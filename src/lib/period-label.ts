/** Format YYYY-MM as "julio 2026" (es-AR). */
export function formatPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Short label: "jul 26" */
export function formatPeriodShort(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "2-digit",
  }).format(d);
}
