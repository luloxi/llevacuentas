import { createHash } from "crypto";
import { PDFParse } from "pdf-parse";
import { fingerprintParts } from "@/lib/money";
import type { BbvaMovement } from "@/lib/bbva/parse";

const MONTHS: Record<string, number> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  sep: 9,
  oct: 10,
  nov: 11,
  dic: 12,
};

/** Argentine money: 1.234,56 or -180.000,00 (not 2,00%) */
const MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}/g;

const DATE_LINE_RE =
  /^(\d{1,2})-([A-Za-záéíóúÁÉÍÓÚ]{3})-(\d{2})\s+(.+)$/i;

function parseArMoney(token: string): number | null {
  let s = token.trim().replace(/\s/g, "");
  if (!s) return null;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseBbvaPdfDate(day: string, mon: string, year: string): string | null {
  const m = MONTHS[mon.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")];
  if (!m) return null;
  let y = Number(year);
  if (y < 100) y += 2000;
  const d = Number(day);
  if (d < 1 || d > 31) return null;
  const iso = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(iso.getTime())) return null;
  // reject overflow (e.g. 31-Feb)
  if (
    iso.getUTCFullYear() !== y ||
    iso.getUTCMonth() !== m - 1 ||
    iso.getUTCDate() !== d
  ) {
    return null;
  }
  return iso.toISOString().slice(0, 10);
}

function stripNoise(rest: string): string {
  return rest
    .replace(/Banco BBVA.*$/i, "")
    .replace(/Sobre\s*\(\d+\).*$/i, "")
    .replace(/Página\s+\d+\s+de\s+\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInstallment(text: string): string | null {
  const m = text.match(/\bC\.?\s*0*(\d{1,2})\s*\/\s*0*(\d{1,2})\b/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a >= 1 && b >= 1 && a <= b && b <= 60) return `${a}/${b}`;
  return null;
}

function extractCupon(text: string): string | null {
  // 6-digit cupón not part of a larger number
  const matches = [...text.matchAll(/(?<![\d.,])(\d{6})(?![\d.,])/g)];
  if (matches.length === 0) return null;
  // Prefer the last cupón-like token (usually before amounts)
  return matches[matches.length - 1]?.[1] ?? null;
}

function findMoneyTokens(text: string): { raw: string; value: number; index: number }[] {
  const out: { raw: string; value: number; index: number }[] = [];
  MONEY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_RE.exec(text)) !== null) {
    // skip percentages like 2,00%
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (after === "%") continue;
    // skip if glued to letters (e.g. TC1220,000 shouldn't appear as pure money with TC)
    const before = text.slice(Math.max(0, m.index - 1), m.index);
    if (/[A-Za-zÁÉÍÓÚáéíóú]/.test(before)) continue;
    const value = parseArMoney(m[0]);
    if (value == null) continue;
    out.push({ raw: m[0], value, index: m.index });
  }
  return out;
}

function isPaymentDescription(desc: string): boolean {
  const u = desc.toUpperCase();
  return (
    u.includes("SU PAGO") ||
    u.includes("PAGO EN PESOS") ||
    u.includes("PAGO EN USD") ||
    u.includes("PAGO RECIBIDO") ||
    u.includes("TRANSFERENCIA DEUDA") ||
    u.startsWith("CR IVA") ||
    u.startsWith("DEV ")
  );
}

function shouldSkipDescription(desc: string): boolean {
  const u = desc.toUpperCase();
  if (!u.trim()) return true;
  if (u.startsWith("TOTAL CONSUMOS")) return true;
  if (u.startsWith("SALDO ")) return true;
  if (u.includes("SALDO ACTUAL")) return true;
  if (u.includes("SALDO ANTERIOR")) return true;
  if (u.startsWith("CIERRE")) return true;
  if (u.startsWith("VENCIMIENTO")) return true;
  if (u.startsWith("PAGO MÍNIMO") || u.startsWith("PAGO MINIMO")) return true;
  if (u.startsWith("LÍMITES") || u.startsWith("LIMITES")) return true;
  if (u.includes("PLAN V:")) return true;
  if (u.includes("TNA FIJA")) return true;
  if (u.includes("CUOTAS DE $")) return true;
  if (u.includes("FECHA") && u.includes("DESCRIP")) return true;
  return false;
}

function isUsdOnlyLine(desc: string, moneys: { value: number }[]): boolean {
  const u = desc.toUpperCase();
  if (!u.includes("USD") && !u.includes("U$S")) return false;
  // Foreign spend: typically one small trailing amount and USD in description
  if (moneys.length === 1 && Math.abs(moneys[0].value) < 5000) return true;
  // Two identical-ish amounts (original FX + charged USD)
  if (moneys.length >= 2) {
    const last = moneys[moneys.length - 1];
    const prev = moneys[moneys.length - 2];
    if (
      Math.abs(last.value) < 5000 &&
      Math.abs(Math.abs(last.value) - Math.abs(prev.value)) < 0.02
    ) {
      return true;
    }
  }
  return false;
}

function cleanDescription(
  rest: string,
  installment: string | null,
  cupon: string | null,
  moneys: { raw: string; index: number }[],
): string {
  // Strip from the original string using original indices first (end → start)
  let d = rest;
  for (const m of [...moneys].sort((a, b) => b.index - a.index)) {
    d = `${d.slice(0, m.index)} ${d.slice(m.index + m.raw.length)}`;
  }
  if (cupon) {
    d = d.replace(new RegExp(`(?<![\\d.,])${cupon}(?![\\d.,])`), " ");
  }
  if (installment) {
    d = d.replace(/\bC\.?\s*0*\d{1,2}\s*\/\s*0*\d{1,2}\b/i, " ");
  }
  // Drop rate codes before any residual money sweep
  d = d
    .replace(/\bTC\d+(?:[.,]\d+)?\b/gi, " ")
    .replace(/\bUSD\b/gi, " ")
    .replace(/\bU\$S\b/gi, " ")
    // Merchant codes glued to USD e.g. P69852833USD / A84450689USD
    .replace(/[A-Z0-9*]{4,}USD\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Residual AR money tokens (same rules as findMoneyTokens)
  for (const m of [...findMoneyTokens(d)].sort((a, b) => b.index - a.index)) {
    d = `${d.slice(0, m.index)} ${d.slice(m.index + m.raw.length)}`;
  }
  // Drop dangling punctuation / empty parens left after stripping base amounts
  d = d
    .replace(/\(\s*\)/g, " ")
    .replace(/\bD[OÓ]LARES?\b/gi, "DOLARES")
    .replace(/^[,.*\-\s]+|[,.*\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Normalize payment labels cut mid-word by PDF extract
  if (/^SU PAGO EN$/i.test(d)) d = "SU PAGO EN DOLARES";
  return d;
}

function assignAmounts(
  desc: string,
  moneys: { value: number }[],
): { amountArs: number | null; amountUsd: number | null } {
  if (moneys.length === 0) return { amountArs: null, amountUsd: null };

  const last = moneys[moneys.length - 1];
  const prev = moneys.length >= 2 ? moneys[moneys.length - 2] : null;

  // Transfer / dual currency: ... 17.299,60 -14,18
  if (prev && last.value < 0 && prev.value > 0 && Math.abs(last.value) < 1000) {
    return { amountArs: prev.value, amountUsd: last.value };
  }

  if (isUsdOnlyLine(desc, moneys)) {
    return { amountArs: null, amountUsd: Math.abs(last.value) };
  }

  // Tax lines with base + charge: take last as the booked amount
  // Payments: last (possibly negative)
  return { amountArs: last.value, amountUsd: null };
}

function makeFingerprint(m: Omit<BbvaMovement, "fingerprint">, cupon: string | null): string {
  const base = fingerprintParts([
    m.date,
    m.descriptionNormalized,
    m.amountArs?.toFixed(2) ?? "",
    m.amountUsd?.toFixed(2) ?? "",
    m.installment ?? "",
    // cupón distinguishes same-day same-merchant same-amount (common with Ubers)
    cupon ?? "",
  ]);
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

/**
 * Parse BBVA Visa "Resumen con vencimiento" PDF (formato de resumen mensual clásico).
 */
export async function parseBbvaStatementPdf(
  data: ArrayBuffer | Buffer,
): Promise<BbvaMovement[]> {
  const bytes = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);
  const parser = new PDFParse({ data: bytes });
  let text: string;
  try {
    const result = await parser.getText();
    text = result.text ?? "";
  } finally {
    // pdf-parse may hold resources
    try {
      await parser.destroy?.();
    } catch {
      /* ignore */
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u0000/g, "").trim())
    .filter(Boolean);

  // Only parse detail sections (pagos / consumos / impuestos)
  let inDetail = false;
  const out: BbvaMovement[] = [];
  const seenFp = new Set<string>();

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (
      upper.includes("SUS PAGOS Y AJUSTES") ||
      upper.includes("DETALLE") ||
      /^CONSUMOS\b/i.test(line) ||
      upper.includes("IMPUESTOS, CARGOS")
    ) {
      inDetail = true;
    }
    if (
      upper.includes("LEGALES Y AVISOS") ||
      upper.includes("PLAN V:") ||
      upper.includes("RÉGIMEN DE TRANSPARENCIA") ||
      upper.includes("REGIMEN DE TRANSPARENCIA")
    ) {
      inDetail = false;
      continue;
    }

    // Before DETALLE, summary block has undated totals — skip.
    // Some extracts put movement lines only after first dated pago.
    const dateMatch = line.match(DATE_LINE_RE);
    if (!dateMatch) continue;

    // Once we see a solid movement line, allow parse even if DETALLE header was messy
    const restRaw = stripNoise(dateMatch[4] ?? "");
    if (!restRaw) continue;

    const date = parseBbvaPdfDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    if (!date) continue;

    const installment = extractInstallment(restRaw);
    const moneys = findMoneyTokens(restRaw);
    if (moneys.length === 0) continue;

    // Cupón before stripping moneys
    let cupon = extractCupon(restRaw);
    // Avoid treating money thousands as cupón (shouldn't with 6 digits only)

    const { amountArs, amountUsd } = assignAmounts(restRaw, moneys);
    if (amountArs == null && amountUsd == null) continue;

    const descriptionRaw = cleanDescription(restRaw, installment, cupon, moneys);
    if (shouldSkipDescription(descriptionRaw)) continue;

    // If we haven't entered detail yet, only accept if it looks like a real movement
    // (has cupón or payment keyword or installment) — avoids header period dates
    if (!inDetail) {
      const looksLikeMovement =
        Boolean(cupon) ||
        Boolean(installment) ||
        isPaymentDescription(descriptionRaw) ||
        /MERPAGO|PAYU|UBER|SPOTIFY|COTO|DIA |RAPPI|OPENAI|GITHUB/i.test(
          descriptionRaw,
        );
      if (!looksLikeMovement) continue;
      inDetail = true;
    }

    const descriptionNormalized = descriptionRaw.replace(/\s+/g, " ").trim();
    if (!descriptionNormalized) continue;

    const payment = isPaymentDescription(descriptionNormalized);
    const arsNeg = (amountArs ?? 0) < 0;
    const partial: Omit<BbvaMovement, "fingerprint"> = {
      date,
      descriptionRaw: descriptionNormalized,
      descriptionNormalized,
      installment,
      amountArs,
      amountUsd,
      isPayment: payment || arsNeg,
      isCredit: arsNeg && !payment,
    };

    const fingerprint = makeFingerprint(partial, cupon);
    if (seenFp.has(fingerprint)) continue;
    seenFp.add(fingerprint);

    out.push({ ...partial, fingerprint });
  }

  return out;
}

export function looksLikePdf(buffer: Buffer, fileName?: string): boolean {
  if (fileName && /\.pdf$/i.test(fileName)) return true;
  return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}
