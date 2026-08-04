import * as XLSX from "xlsx";
import { createHash } from "crypto";
import {
  amountFingerprintKey,
  fingerprintParts,
  normalizeMovementCurrency,
  parseBbvaAmount,
} from "@/lib/money";

export type BbvaMovement = {
  date: string; // YYYY-MM-DD
  descriptionRaw: string;
  descriptionNormalized: string;
  installment: string | null;
  amountArs: number | null;
  amountUsd: number | null;
  isPayment: boolean;
  isCredit: boolean;
  fingerprint: string;
};

function normalizeDescription(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // DD/MM/YY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const month = Number(m[2]);
    const day = Number(m[1]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Excel serial date as number
  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function validInstallment(a: number, b: number): string | null {
  // Real cuotas: 1/3, 2/6… not tax codes like 5463/5465
  if (a >= 1 && b >= 1 && a <= b && b <= 60) return `${a}/${b}`;
  return null;
}

function extractInstallment(description: string, cuotaCol: unknown): string | null {
  const fromCol = cuotaCol != null ? String(cuotaCol).trim() : "";
  // BBVA uses "/" alone when there is no installment
  if (fromCol && fromCol !== "-" && fromCol !== "/") {
    const m = fromCol.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) {
      const hit = validInstallment(Number(m[1]), Number(m[2]));
      if (hit) return hit;
    }
  }
  const m = description.match(/cuota\s*0*(\d+)\s*\/\s*0*(\d+)/i);
  if (m) return validInstallment(Number(m[1]), Number(m[2]));
  return null;
}

function isPaymentDescription(desc: string): boolean {
  const u = desc.toUpperCase();
  return (
    u.includes("SU PAGO") ||
    u.includes("PAGO EN PESOS") ||
    u.includes("PAGO EN USD") ||
    u.includes("PAGO RECIBIDO")
  );
}

function makeFingerprint(m: Omit<BbvaMovement, "fingerprint">): string {
  const base = fingerprintParts([
    m.date,
    m.descriptionNormalized,
    // Amount without currency so ARS↔USD fixes keep the same fingerprint
    amountFingerprintKey(m.amountArs, m.amountUsd),
    m.installment ?? "",
  ]);
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

function normalizeHeaderCell(c: unknown): string {
  return String(c ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderRow(row: (string | number | Date | null)[]): boolean {
  const joined = row.map((c) => normalizeHeaderCell(c)).join("|");
  if (!joined.includes("fecha")) return false;
  // BBVA actual export: Fecha | Establecimiento | Importe en $ | Importe en U$S
  // Older / other banks: Movimiento / Descripción
  return (
    joined.includes("establecimiento") ||
    joined.includes("movimiento") ||
    joined.includes("descrip") ||
    joined.includes("comercio") ||
    joined.includes("detalle")
  );
}

function isUsdHeader(h: string): boolean {
  return (
    h.includes("u$s") ||
    h.includes("usd") ||
    h.includes("us$") ||
    h.includes("dolar") ||
    h.includes("dólar")
  );
}

function isArsHeader(h: string): boolean {
  if (isUsdHeader(h)) return false;
  return (
    h.includes("importe") ||
    h.includes("monto") ||
    h.includes("peso") ||
    h.includes("$")
  );
}

function parseColumnAmount(raw: unknown): number | null {
  const parsed = parseBbvaAmount(raw);
  return parsed ? parsed.value : null;
}

/** Parse ARS/USD columns; honor USD markers inside either cell. */
function parseArsUsdColumns(
  arsRaw: unknown,
  usdRaw: unknown,
): { amountArs: number | null; amountUsd: number | null } {
  const arsParsed = parseBbvaAmount(arsRaw);
  const usdParsed = parseBbvaAmount(usdRaw);

  let amountArs: number | null = null;
  let amountUsd: number | null = null;

  if (usdParsed) {
    // Value in the U$S column is always USD, even if Excel typed it as a bare number
    amountUsd = usdParsed.value;
  }
  if (arsParsed) {
    if (arsParsed.currency === "USD") {
      // Cell in $ column but labeled "USD …"
      amountUsd = amountUsd ?? arsParsed.value;
    } else {
      amountArs = arsParsed.value;
    }
  }

  return { amountArs, amountUsd };
}

/**
 * Parse BBVA "Últimos movimientos" (.xls / .xlsx) buffer.
 * Supports the home-banking export:
 *   Nro. Tarjeta | Fecha | Establecimiento | Cuota | Importe en $ | Importe en U$S
 */
export function parseBbvaWorkbook(data: ArrayBuffer | Buffer): BbvaMovement[] {
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /mov/i.test(n)) ??
    wb.SheetNames.find((n) => /periodo|period/i.test(n)) ??
    wb.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    wb.Sheets[sheetName],
    { header: 1, defval: null, raw: true },
  );

  // Find header row (title row may sit above it)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    if (isHeaderRow(rows[i] ?? [])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    // Last resort: first row that has "fecha"
    for (let i = 0; i < Math.min(rows.length, 25); i++) {
      const joined = (rows[i] ?? []).map((c) => normalizeHeaderCell(c)).join("|");
      if (joined.includes("fecha")) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx < 0) headerIdx = 0;

  const header = (rows[headerIdx] ?? []).map(normalizeHeaderCell);

  const colDate = header.findIndex((h) => h.includes("fecha"));
  const colMov = header.findIndex(
    (h) =>
      h.includes("establecimiento") ||
      h.includes("movimiento") ||
      h.includes("descrip") ||
      h.includes("comercio") ||
      h.includes("detalle"),
  );
  const colCuota = header.findIndex((h) => h.includes("cuota"));
  const colUsd = header.findIndex(
    (h) => (h.includes("importe") || h.includes("monto")) && isUsdHeader(h),
  );
  let colArs = header.findIndex(
    (h) => (h.includes("importe") || h.includes("monto") || h.includes("$")) && isArsHeader(h),
  );
  // If only one "importe" and it's not USD, use it as ARS
  if (colArs < 0) {
    colArs = header.findIndex(
      (h, i) =>
        i !== colUsd && (h.includes("importe") || h.includes("monto") || h.includes("peso")),
    );
  }

  // Layout fallback for classic BBVA export (no reliable header match):
  // 0 card, 1 date, 2 merchant, 3 cuota, 4 ARS, 5 USD
  const dateIdx = colDate >= 0 ? colDate : 1;
  const movIdx = colMov >= 0 ? colMov : 2;
  const cuotaIdx = colCuota >= 0 ? colCuota : 3;
  const arsIdx = colArs >= 0 ? colArs : 4;
  const usdIdx = colUsd >= 0 ? colUsd : 5;

  const out: BbvaMovement[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const descriptionRaw = String(row[movIdx] ?? "").trim();
    if (!descriptionRaw) continue;
    // Skip totals / footer rows
    if (/^total\b/i.test(descriptionRaw)) continue;
    if (/monto total/i.test(descriptionRaw)) continue;

    const date = parseDate(row[dateIdx]);
    if (!date) continue;

    const descriptionNormalized = normalizeDescription(descriptionRaw);
    const installment = extractInstallment(descriptionRaw, row[cuotaIdx]);

    let { amountArs, amountUsd } = parseArsUsdColumns(row[arsIdx], row[usdIdx]);
    ({ amountArs, amountUsd } = normalizeMovementCurrency({
      descriptionNormalized,
      amountArs,
      amountUsd,
    }));
    if (amountArs == null && amountUsd == null) continue;

    const negative = (amountArs ?? amountUsd ?? 0) < 0;
    const payment = isPaymentDescription(descriptionNormalized) || negative;

    const partial = {
      date,
      descriptionRaw,
      descriptionNormalized,
      installment,
      amountArs,
      amountUsd,
      isPayment: payment,
      isCredit: negative && !isPaymentDescription(descriptionNormalized),
    };

    out.push({ ...partial, fingerprint: makeFingerprint(partial) });
  }

  return out;
}

/**
 * Parse Transparencia "Consumos" sheet for historical migration.
 */
export type TransparenciaConsumo = {
  period: string;
  date: string;
  description: string;
  amountArs: number | null;
  amountUsd: number | null;
  categoryName: string;
  fingerprint: string;
};

function parseMoneyLoose(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || s === "-") return null;
  s = s.replace(/USD/gi, "").replace(/\$/g, "").replace(/\s/g, "");
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (s.includes(",") && s.includes(".")) {
    // AR: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // 1234,56
    s = s.replace(",", ".");
  }
  // plain "14681.86" keeps the decimal point
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

export function parseTransparenciaConsumos(
  data: ArrayBuffer | Buffer,
): TransparenciaConsumo[] {
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });
  const sheet =
    wb.Sheets["Consumos"] ??
    wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase().includes("consumo")) ?? ""];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  const out: TransparenciaConsumo[] = [];
  for (const r of rows) {
    const desc = String(r["Descripción"] ?? r["Descripcion"] ?? "").trim();
    if (!desc) continue;

    let dateStr: string | null = null;
    const fecha = r["Fecha"];
    if (fecha instanceof Date) dateStr = fecha.toISOString().slice(0, 10);
    else dateStr = parseDate(fecha);

    if (!dateStr) continue;

    let period = "";
    const per = r["Período"] ?? r["Periodo"];
    if (per instanceof Date) period = per.toISOString().slice(0, 7);
    else if (per) period = String(per).slice(0, 7);

    const amountArs = parseMoneyLoose(r["Monto $"]);
    let amountUsd: number | null = null;
    const usdRaw = r["Monto USD"];
    if (usdRaw != null && String(usdRaw).trim() && String(usdRaw).trim() !== "-") {
      const s = String(usdRaw).replace(/USD/gi, "").trim();
      amountUsd = parseMoneyLoose(s);
    }

    const categoryName = String(r["Categoría"] ?? r["Categoria"] ?? "Uncategorized").trim();
    const description = normalizeDescription(desc);
    const fp = createHash("sha256")
      .update(
        fingerprintParts([
          dateStr,
          description,
          amountArs?.toFixed(2) ?? "",
          amountUsd?.toFixed(2) ?? "",
          categoryName,
        ]),
      )
      .digest("hex")
      .slice(0, 32);

    out.push({
      period,
      date: dateStr,
      description,
      amountArs,
      amountUsd,
      categoryName,
      fingerprint: fp,
    });
  }
  return out;
}
