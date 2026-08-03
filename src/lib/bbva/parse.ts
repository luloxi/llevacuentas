import * as XLSX from "xlsx";
import { createHash } from "crypto";
import { fingerprintParts, parseBbvaAmount } from "@/lib/money";

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

function extractInstallment(description: string, cuotaCol: unknown): string | null {
  const fromCol = cuotaCol != null ? String(cuotaCol).trim() : "";
  if (fromCol && fromCol !== "-" && /\d+\s*\/\s*\d+/.test(fromCol)) {
    const m = fromCol.match(/(\d+)\s*\/\s*(\d+)/);
    if (m) return `${Number(m[1])}/${Number(m[2])}`;
  }
  const m = description.match(/cuota\s*0*(\d+)\s*\/\s*0*(\d+)/i);
  if (m) return `${Number(m[1])}/${Number(m[2])}`;
  const m2 = description.match(/\(?\s*0*(\d+)\s*\/\s*0*(\d+)\s*\)?/);
  if (m2 && Number(m2[2]) > 1) return `${Number(m2[1])}/${Number(m2[2])}`;
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
    m.amountArs?.toFixed(2) ?? "",
    m.amountUsd?.toFixed(2) ?? "",
    m.installment ?? "",
  ]);
  return createHash("sha256").update(base).digest("hex").slice(0, 32);
}

/**
 * Parse BBVA "Últimos movimientos.xlsx" buffer/arraybuffer.
 */
export function parseBbvaWorkbook(data: ArrayBuffer | Buffer): BbvaMovement[] {
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("movement")) ??
    wb.SheetNames[0];
  if (!sheetName) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
    wb.Sheets[sheetName],
    { header: 1, defval: null, raw: true },
  );

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] ?? [];
    const joined = row.map((c) => String(c ?? "").toLowerCase()).join("|");
    if (
      joined.includes("fecha") &&
      (joined.includes("movimiento") || joined.includes("descrip"))
    ) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) headerIdx = 1; // BBVA default: title row 0, header row 1

  const header = (rows[headerIdx] ?? []).map((c) =>
    String(c ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, ""),
  );

  const colDate = header.findIndex((h) => h.includes("fecha"));
  const colMov = header.findIndex(
    (h) => h.includes("movimiento") || h.includes("descrip"),
  );
  const colCuota = header.findIndex((h) => h.includes("cuota"));
  const colMonto = header.findIndex((h) => h.includes("monto") || h.includes("importe"));

  const dateIdx = colDate >= 0 ? colDate : 0;
  const movIdx = colMov >= 0 ? colMov : 1;
  const cuotaIdx = colCuota >= 0 ? colCuota : 2;
  const montoIdx = colMonto >= 0 ? colMonto : 3;

  const out: BbvaMovement[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue;

    const descriptionRaw = String(row[movIdx] ?? "").trim();
    if (!descriptionRaw) continue;

    const date = parseDate(row[dateIdx]);
    if (!date) continue;

    const amount = parseBbvaAmount(row[montoIdx]);
    if (!amount) continue;

    const descriptionNormalized = normalizeDescription(descriptionRaw);
    const installment = extractInstallment(descriptionRaw, row[cuotaIdx]);
    const amountArs = amount.currency === "ARS" ? amount.value : null;
    const amountUsd = amount.currency === "USD" ? amount.value : null;
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
