/**
 * Pure helpers for hogar-service reimbursements (rent/utilities already paid
 * by a roommate). Client-safe — no DB / next/headers imports.
 * UI must not echo full legal names.
 */

const HOGAR_REINTEGRO_PAYEE_TOKENS = [
  "KATHERINE",
  "FERNANDA",
  "KATHO",
] as const;

/** Outbound person payment / transfer prefixes (Fiwind + similar). */
const OUTBOUND_PAY_PREFIX =
  /^(RETIRO|PAGO|TRANSFERENCIA|TRANSFER|ENVIO)\s+A\b/;

function normalizeKey(description: string): string {
  return description
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the description looks like a payment to the roommate who often
 * fronts alquiler/luz/agua/internet — those must not double-count in Hogar.
 */
export function looksLikeHogarReintegroPayee(description: string): boolean {
  const key = normalizeKey(description);
  if (!key) return false;
  if (!OUTBOUND_PAY_PREFIX.test(key)) return false;
  // Strong payee hit: Katho nickname, or Katherine+Fernanda together.
  if (/\bKATHO\b/.test(key)) return true;
  const hasKatherine = /\bKATHERINE\b/.test(key);
  const hasFernanda = /\bFERNANDA\b/.test(key);
  return hasKatherine && hasFernanda;
}

/**
 * Fiwind CSV / exports sometimes list the roommate payee alone (no
 * "Retiro a" / "Pago a" prefix). Still a hogar-service reimbursement.
 * Requires the whole description to be that payee — not "… en el super".
 */
export function looksLikeBareHogarReintegroPayee(description: string): boolean {
  const key = normalizeKey(description);
  if (!key) return false;
  if (OUTBOUND_PAY_PREFIX.test(key)) return false;
  if (/^KATHO$/.test(key)) return true;
  // Whole line = Katherine + Fernanda + optional surnames (not merchant copy).
  if (!/^KATHERINE\s+FERNANDA(\s+[A-Z]+)*$/.test(key)) return false;
  const after = key.replace(/^KATHERINE\s+FERNANDA\s*/, "");
  if (!after) return true;
  if (
    /\b(EN|EL|LA|LOS|LAS|DE|DEL|AL|SUPER|MARKET|TIENDA|FARMAC|STEAM|PAGO|RETIRO|UNA|CUENTA)\b/.test(
      after,
    )
  ) {
    return false;
  }
  return after.split(" ").every((t) => t.length >= 3);
}

/** Outbound-prefix OR bare-payee hogar reintegro description. */
export function isHogarReintegroDescription(description: string): boolean {
  return (
    looksLikeHogarReintegroPayee(description) ||
    looksLikeBareHogarReintegroPayee(description)
  );
}

/** Same payee key for bulk “Aplicar a N” (exact normalized description). */
export function sameHogarReintegroKey(a: string, b: string): boolean {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  return Boolean(ka) && ka === kb;
}

export function countHogarReintegroMatches(
  rows: Array<{
    id: string;
    descriptionNormalized: string;
    isPayment?: boolean;
  }>,
  description: string,
  opts?: { excludeTxId?: string; onlyUnset?: boolean },
): number {
  const key = normalizeKey(description);
  if (!key || !looksLikeHogarReintegroPayee(description)) return 0;
  let n = 0;
  for (const tx of rows) {
    if (opts?.excludeTxId && tx.id === opts.excludeTxId) continue;
    if (normalizeKey(tx.descriptionNormalized) !== key) continue;
    if (opts?.onlyUnset && tx.isPayment) continue;
    n++;
  }
  return n;
}

/** Exported for tests — do not surface in UI copy. */
export const _HOGAR_REINTEGRO_PAYEE_TOKENS_FOR_TESTS =
  HOGAR_REINTEGRO_PAYEE_TOKENS;

export { normalizeKey as normalizeHogarReintegroKey };
