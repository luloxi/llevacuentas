"use client";

import { ThemeProvider } from "@/components/theme-provider";

/** Neon Auth client no requiere SessionProvider de next-auth. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
