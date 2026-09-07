/**
 * Deuda UI is wrong after Luciano cancelled bank/card debt.
 * Keep the code; hide nav + show a “pronto” stub until rebuilt.
 * Enable with NEXT_PUBLIC_DEUDA_ENABLED=1.
 */
export function isDeudaEnabled(
  value: string | undefined = process.env.NEXT_PUBLIC_DEUDA_ENABLED,
): boolean {
  return value === "1";
}

export const DEUDA_ENABLED = isDeudaEnabled();
