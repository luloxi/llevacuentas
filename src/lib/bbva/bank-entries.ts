/**
 * BBVA statement lines that are accounting (not real consumption).
 * e.g. converting USD balance to ARS, debt transfers, USD interest credits.
 * They must not inflate “gastos” totals in Análisis / Consumos.
 */
export function isBankAccountingEntry(description: string): boolean {
  const u = description.toUpperCase();
  return (
    u.includes("PESIFICACION") ||
    u.includes("PESIFICACIÓN") ||
    u.includes("TRANSFERENCIA DEUDA") ||
    u.includes("CREDITOS VS EN USD") ||
    u.includes("CRÉDITOS VS EN USD") ||
    u.includes("CREDITO VS EN USD") ||
    // Plan V / debt plan markers sometimes appear as non-spend
    u.includes("TRANSF. DEUDA") ||
    u.includes("TRANSF DEUDA")
  );
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
    // Generic “PAGO …” but not merchant names like “PAGO FACIL COMISION” handled above
    /^PAGO\b/.test(u.trim()) ||
    /\bSU\s+PAGO\b/.test(u)
  );
}
