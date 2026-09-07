import { createHash } from "crypto";
import { fingerprintParts } from "@/lib/money";

export const CASITA_OWNER_EMAIL = "lucianoolivabianco@gmail.com";
export const CASITA_HOUSEHOLD_NAME = "Casita";
export const CASITA_SEPT_SOURCE = "casita_csv";
export const CASITA_SEPT_FILE = "gastos-septiembre.csv";

export type CasitaSeptRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amountArs: number; // signed as in CSV
  tipo: "gasto" | "ingreso";
};

/** DD/MM/YYYY → YYYY-MM-DD */
export function parseCasitaCsvDate(raw: string): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseCasitaCsvAmount(raw: string): number | null {
  const s = String(raw ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Luciano: follow the tipo column. Rows described as “A/De una cuenta tuya”
 * still parse here; seed + isOwnAccountTransferDescription keep them out of neta.
 */
export function parseCasitaSeptiembreCsv(text: string): CasitaSeptRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]!.toLowerCase();
  if (!header.includes("fecha") || !header.includes("tipo")) {
    throw new Error("CSV Casita: faltan columnas fecha/tipo");
  }

  const out: CasitaSeptRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    if (cols.length < 4) continue;
    const date = parseCasitaCsvDate(cols[0]!);
    const description = String(cols[1] ?? "").trim();
    const amountArs = parseCasitaCsvAmount(cols[2]!);
    const tipoRaw = String(cols[3] ?? "")
      .trim()
      .toLowerCase();
    const tipo = tipoRaw === "ingreso" ? "ingreso" : tipoRaw === "gasto" ? "gasto" : null;
    if (!date || !description || amountArs == null || !tipo) continue;
    out.push({ date, description, amountArs, tipo });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function casitaSeptFingerprint(row: CasitaSeptRow): string {
  return createHash("sha256")
    .update(
      fingerprintParts([
        "casita-sept",
        row.date,
        row.description,
        row.amountArs.toFixed(2),
        row.tipo,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

export function moneyAbs2(value: number): string {
  return Math.abs(value).toFixed(2);
}
