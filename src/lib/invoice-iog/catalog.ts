import { createHash } from "crypto";
import { fingerprintParts } from "@/lib/money";

export const INVOICE_IOG_HOUSEHOLD_NAME = "Invoice IOG";
export const INVOICE_IOG_OWNER_EMAIL = "lucianoolivabianco@gmail.com";
export const INVOICE_IOG_SOURCE = "invoice_iog";

export const INVOICE_IOG_RUBROS = [
  "Herramientas AI",
  "Infra y cloud",
  "Eventos y extras",
  "Movilidad",
  "Hardware",
] as const;

export type InvoiceIogRubro = (typeof INVOICE_IOG_RUBROS)[number];

export const INVOICE_IOG_RUBRO_SLUGS: Record<InvoiceIogRubro, string> = {
  "Herramientas AI": "herramientas-ai",
  "Infra y cloud": "infra-cloud",
  "Eventos y extras": "eventos-extras",
  Movilidad: "movilidad",
  Hardware: "hardware",
};

export type InvoiceIogGasto = {
  n: number;
  date: string;
  mes: string;
  invoice: string;
  desc: string;
  rubro: string;
  moneda: "USD" | "ARS" | string;
  importe: number;
  tc: number;
  usd: number | null;
  arsPagados: number | null;
  arsLiq: number | null;
};

export type InvoiceIogFixture = {
  household: string;
  count: number;
  totalUsd: number;
  totalArs?: number;
  source?: string;
  /** Fixture generation: 3 = Excel v3 (92 Gastos, Jan–Sep 2026). */
  version?: number;
  note?: string;
  items: InvoiceIogGasto[];
};

export function isInvoiceIogRubro(value: string): value is InvoiceIogRubro {
  return (INVOICE_IOG_RUBROS as readonly string[]).includes(value);
}

export function slugForInvoiceIogRubro(rubro: string): string {
  if (isInvoiceIogRubro(rubro)) return INVOICE_IOG_RUBRO_SLUGS[rubro];
  return "uncategorized";
}

/** SuperGrok / Claude / OpenAI / Cursor → herramientas; DO / Railway / Vercel → infra. */
export function rubroForInvoiceIogTool(description: string): InvoiceIogRubro | null {
  const u = description.toUpperCase();
  if (
    /SUPERGROK/.test(u) ||
    /\bCLAUDE\b/.test(u) ||
    /\bOPENAI\b/.test(u) ||
    /CHATGPT/.test(u) ||
    /\bCURSOR\b/.test(u)
  ) {
    return "Herramientas AI";
  }
  if (
    /DIGITAL\s*OCEAN/.test(u) ||
    /\bRAILWAY\b/.test(u) ||
    /\bVERCEL\b/.test(u)
  ) {
    return "Infra y cloud";
  }
  return null;
}

export const INVOICE_IOG_TOOL_RULES: Array<{
  pattern: string;
  rubro: InvoiceIogRubro;
  priority: number;
}> = [
  { pattern: "SUPERGROK", rubro: "Herramientas AI", priority: 90 },
  { pattern: "CHATGPT", rubro: "Herramientas AI", priority: 88 },
  { pattern: "OPENAI", rubro: "Herramientas AI", priority: 88 },
  { pattern: "CLAUDE", rubro: "Herramientas AI", priority: 88 },
  { pattern: "CURSOR", rubro: "Herramientas AI", priority: 88 },
  { pattern: "DIGITALOCEAN", rubro: "Infra y cloud", priority: 88 },
  { pattern: "DIGITAL OCEAN", rubro: "Infra y cloud", priority: 88 },
  { pattern: "RAILWAY", rubro: "Infra y cloud", priority: 88 },
  { pattern: "VERCEL", rubro: "Infra y cloud", priority: 88 },
  { pattern: "UBER", rubro: "Movilidad", priority: 85 },
  { pattern: "UBERX", rubro: "Movilidad", priority: 86 },
  { pattern: "DIDI", rubro: "Movilidad", priority: 85 },
  { pattern: "PAYU*AR*UBER", rubro: "Movilidad", priority: 86 },
];

export function money2(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.0001) {
    return null;
  }
  return Math.abs(value).toFixed(2);
}

/**
 * Prefer usd + arsLiq (same economic row in two currencies).
 * ARS-original rows still keep usd from the sheet.
 * Totales sheet (adelanto / saldo) is docs-only — app seeds line items.
 */
export function invoiceIogAmounts(item: InvoiceIogGasto): {
  amountUsd: string | null;
  amountArs: string | null;
} {
  return {
    amountUsd: money2(item.usd),
    amountArs: money2(item.arsLiq),
  };
}

export function invoiceIogFingerprint(item: InvoiceIogGasto): string {
  return createHash("sha256")
    .update(
      fingerprintParts([
        "invoice-iog",
        item.n,
        item.date,
        item.desc,
        item.usd,
        item.arsLiq,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
}

export function sumInvoiceIogUsd(items: InvoiceIogGasto[]): number {
  return items.reduce((s, i) => s + (typeof i.usd === "number" ? i.usd : 0), 0);
}

export function uniqueInvoiceIogItems(items: InvoiceIogGasto[]): InvoiceIogGasto[] {
  const seen = new Set<string>();
  const out: InvoiceIogGasto[] = [];
  for (const item of items) {
    const fp = invoiceIogFingerprint(item);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}
