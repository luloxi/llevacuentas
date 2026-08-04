"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  List,
  PieChart,
  Users,
  LogOut,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/consumos", label: "Consumos", icon: List },
  { href: "/analisis", label: "Análisis", icon: PieChart },
  { href: "/compartido", label: "Hogar", icon: Users },
];

export function AppNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    router.push("/login");
    router.refresh();
  }

  const allLinks = isAdmin
    ? [...links, { href: "/admin", label: "Admin", icon: Shield }]
    : links;

  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b border-emerald-900/8 bg-white/75 shadow-sm shadow-emerald-900/[0.03] backdrop-blur-xl md:block dark:border-white/5 dark:bg-zinc-950/70 dark:shadow-black/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 md:px-6">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <BrandLogo
              size={34}
              className="transition-transform duration-200 group-hover:scale-105"
            />
            <span className="bg-gradient-to-r from-zinc-900 to-zinc-600 bg-clip-text text-transparent dark:from-white dark:to-zinc-400">
              LlevaCuentas
            </span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {allLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25"
                      : "text-zinc-600 hover:bg-emerald-50/80 hover:text-emerald-900 dark:text-zinc-300 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-100",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active && "drop-shadow-sm")} />
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-1.5 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200/80 bg-white/90 shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.12)] backdrop-blur-xl md:hidden dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:shadow-black/40">
        <div
          className={cn(
            "mx-auto grid max-w-lg gap-0.5 px-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1",
            allLinks.length >= 5 ? "grid-cols-5" : "grid-cols-4",
          )}
        >
          {allLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors",
                  active
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-500",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                    active
                      ? "bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950 dark:text-emerald-300"
                      : "text-zinc-500",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
