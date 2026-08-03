"use client";

/** Neon Auth client no requiere SessionProvider de next-auth. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
