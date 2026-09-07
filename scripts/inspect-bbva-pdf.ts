import { readFileSync } from "fs";
import { parseBbvaPdfText, extractPdfText, parseGenericPdfText } from "../src/lib/bbva/parse-pdf";

const files = [
  "fixtures/bbva-card/resumen-a.pdf",
  "fixtures/bbva-card/resumen-b.pdf",
  "fixtures/bbva-card/resumen-c.pdf",
];

async function main() {
  for (const f of files) {
    const buf = readFileSync(f);
    const text = await extractPdfText(buf);
    const bbva = parseBbvaPdfText(text);
    const generic = parseGenericPdfText(text);
    console.log("\n====", f, "textLen", text.length, "bbva", bbva.length, "generic", generic.length);
    console.log(" text sample", text.slice(0, 400).replace(/\s+/g, " "));
    console.log(" bbva sample", bbva.slice(0, 5).map((r) => ({ d: r.date, desc: r.descriptionNormalized.slice(0, 40), inst: r.installment, ars: r.amountArs, usd: r.amountUsd, pay: r.isPayment })));
    const cuotas = bbva.filter((r) => r.installment);
    console.log(" cuotas", cuotas.length, cuotas.slice(0, 8).map((c) => c.installment + " " + c.descriptionNormalized.slice(0, 30)));
  }
}

void main();
