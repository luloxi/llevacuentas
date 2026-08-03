/**
 * Parse amounts from BBVA AR exports.
 * Examples: "$ 30.277,00" | "$ -28.818,86" | "USD 20,00" | "USD -102,48"
 */
export type ParsedAmount = {
  currency: "ARS" | "USD";
  value: number;
};

export function parseBbvaAmount(raw: unknown): ParsedAmount | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { currency: "ARS", value: raw };
  }

  let s = String(raw).trim();
  if (!s || s === "-") return null;

  const isUsd = /^USD\b/i.test(s) || s.toUpperCase().includes("USD");
  s = s.replace(/^USD\s*/i, "").replace(/^\$\s*/, "").trim();

  // Remove spaces used as thousand separators sometimes
  s = s.replace(/\s/g, "");

  // Argentine format: 1.234.567,89  or US-like in some exports
  const negative = s.startsWith("-") || s.includes("-");
  s = s.replace(/-/g, "");

  if (s.includes(",") && s.includes(".")) {
    // 1.234,56 → 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // 1234,56 or 1,234.56 ambiguous — prefer AR if last sep is comma
    s = s.replace(",", ".");
  }

  const value = Number(s);
  if (!Number.isFinite(value)) return null;

  return {
    currency: isUsd ? "USD" : "ARS",
    value: negative ? -Math.abs(value) : value,
  };
}

export function amountsClose(
  a: number,
  b: number,
  opts: { absTol?: number; pctTol?: number } = {},
): boolean {
  const absTol = opts.absTol ?? 50;
  const pctTol = opts.pctTol ?? 0.02;
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / base <= pctTol;
}

export function fingerprintParts(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((p) => (p == null ? "" : String(p).trim().toUpperCase()))
    .join("|");
}
