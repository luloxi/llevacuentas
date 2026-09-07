import { isFiwindNonExpenseTipo } from "@/lib/import/fiwind";

/**
 * Statement lines that are accounting (not real consumption).
 * BBVA: pesificación, debt transfers, USD interest credits.
 * Fiwind: USDC↔ARS conversions, Compra/Venta KO, yields, deposits, crypto out,
 * wallet TRANSFERENCIA ARS, and amount-only Tipo (legacy parse used the monto).
 * They must not inflate “gastos” totals in Análisis / Consumos.
 * COMPRA SUPER ARS is grocery spend, not an investment.
 */
export function isBankAccountingEntry(description: string): boolean {
  const u = description.toUpperCase();
  if (
    u.includes("PESIFICACION") ||
    u.includes("PESIFICACIÓN") ||
    u.includes("TRANSFERENCIA DEUDA") ||
    u.includes("CREDITOS VS EN USD") ||
    u.includes("CRÉDITOS VS EN USD") ||
    u.includes("CREDITO VS EN USD") ||
    u.includes("TRANSF. DEUDA") ||
    u.includes("TRANSF DEUDA") ||
    u.includes("CTA A CTA") ||
    u.includes("CUENTA A CUENTA") ||
    u.startsWith("TRANSFERENCIA INTERNA") ||
    u.includes("TRANSFERENCIA ENTRE CUENTAS") ||
    u.includes("TRANSF ENTRE CUENTAS") ||
    u.includes("TRANSFERENCIA A CUENTA PROPIA") ||
    u.includes("TRANSF A CUENTA PROPIA")
  ) {
    return true;
  }
  return isFiwindNonExpenseTipo(description);
}

/** Card payments the user made (reduces debt). */
export function isCardPaymentEntry(description: string): boolean {
  const u = description
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return (
    u.includes("SU PAGO") ||
    u.includes("PAGO EN PESOS") ||
    u.includes("PAGO EN USD") ||
    u.includes("PAGO RECIBIDO") ||
    u.includes("PAGO DE TARJETA") ||
    u.includes("PAGO TARJETA") ||
    u.includes("PAGO VISA") ||
    u.includes("PAGO MASTER") ||
    u.includes("PAGO AMEX") ||
    u.includes("DEBITO AUTOMATICO") ||
    u.includes("DEB. AUTOMATICO") ||
    u.includes("DEB AUTOMATICO") ||
    u.includes("DEBITO AUT.") ||
    u.includes("PAGO FACIL") ||
    u.includes("PAGO MIS CUENTAS") ||
    // Generic “PAGO …” — not Fiwind “Pago a DIA” (merchant purchase)
    (/^PAGO\b/.test(u.trim()) && !/^PAGO\s+A\b/.test(u.trim())) ||
    /\bSU\s+PAGO\b/.test(u)
  );
}
