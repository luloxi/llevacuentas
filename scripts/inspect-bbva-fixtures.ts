import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { parseStatementWorkbook } from "../src/lib/bbva/parse";
import { isBankAccountingEntry } from "../src/lib/bbva/bank-entries";

function isExpenseRow(r: { isPayment: boolean; isCredit?: boolean; descriptionNormalized: string }) {
  if (r.isPayment || r.isCredit) return false;
  if (isBankAccountingEntry(r.descriptionNormalized)) return false;
  return true;
}

const files = [
  "fixtures/bbva-card/mov-periodo-a.xls",
  "fixtures/bbva-card/mov-periodo-b.xls",
  "fixtures/bbva-card/mov-periodo-c.xls",
  "fixtures/bbva-card/ultimos-movimientos.xlsx",
  "fixtures/bbva-card/ultimos-movimientos-2.xlsx",
];

for (const f of files) {
  const buf = readFileSync(f);
  const parsed = parseStatementWorkbook(buf, f.split("/").pop());
  const m = parsed.movements;
  const cuotas = m.filter((x) => x.installment);
  const payments = m.filter((x) => x.isPayment);
  const expenses = m.filter(isExpenseRow);
  const ars = expenses.reduce((s, x) => s + Math.abs(x.amountArs ?? 0), 0);
  const usd = expenses.reduce((s, x) => s + Math.abs(x.amountUsd ?? 0), 0);
  const payArs = payments.reduce((s, x) => s + Math.abs(x.amountArs ?? 0), 0);
  const payUsd = payments.reduce((s, x) => s + Math.abs(x.amountUsd ?? 0), 0);
  console.log("\n====", f);
  console.log(" classic", parsed.classicBbva, "bank", parsed.detectedBank, "kind", parsed.fileKind);
  console.log(" mov", m.length, "expenses", expenses.length, "payments", payments.length, "cuotas", cuotas.length);
  console.log(" expense ARS", ars.toFixed(2), "USD", usd.toFixed(2), "pay ARS", payArs.toFixed(2), "USD", payUsd.toFixed(2));
  const inst: Record<string, number> = {};
  for (const c of cuotas) inst[c.installment!] = (inst[c.installment!] || 0) + 1;
  console.log(" installment histogram", inst);
  console.log(
    " sample cuotas",
    cuotas.slice(0, 12).map((c) => ({
      d: c.date,
      desc: c.descriptionNormalized.slice(0, 50),
      inst: c.installment,
      ars: c.amountArs,
      usd: c.amountUsd,
    })),
  );
  console.log(
    " sample payments",
    payments.slice(0, 8).map((c) => ({
      d: c.date,
      desc: c.descriptionNormalized.slice(0, 50),
      ars: c.amountArs,
      usd: c.amountUsd,
    })),
  );
  if (m.length < 12)
    console.log(
      " ALL",
      m.map((c) => ({
        d: c.date,
        desc: c.descriptionNormalized,
        inst: c.installment,
        ars: c.amountArs,
        usd: c.amountUsd,
        pay: c.isPayment,
      })),
    );
}

for (const f of [
  "fixtures/bbva-card/mov-periodo-a.xls",
  "fixtures/bbva-card/mov-periodo-b.xls",
  "fixtures/bbva-card/mov-periodo-c.xls",
]) {
  const buf = readFileSync(f);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) as unknown[][];
  const cuotaRows = rows.filter(
    (r) => r && r[3] && String(r[3]).includes("/") && String(r[3]).trim() !== "/",
  );
  console.log("\nRAW CUOTAS", f, cuotaRows.length);
  for (const r of cuotaRows) console.log(" ", JSON.stringify(r).slice(0, 240));
}
