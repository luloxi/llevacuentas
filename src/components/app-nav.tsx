"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  List,
  PieChart,
  ShoppingCart,
  Upload,
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
  { href: "/mes-a-mes", label: "Mes a mes", icon: PieChart },
  { href: "/supermercado", label: "Súper", icon: ShoppingCart },
  { href: "/importar", label: "Importar", icon: Upload },
  { href: "/grupo", label: "Grupo", icon: Users },
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
      <header className="hidden border-b border-emerald-900/10 bg-white/80 backdrop-blur md:block dark:border-emerald-100/10 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <BrandLogo size={32} />
            <span>LlevaCuentas</span>
          </Link>
          <nav className="flex items-center gap-1">
            {allLinks.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition",
                    active
                      ? "bg-emerald-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void logout()}
              className="ml-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <div
          className={cn(
            "mx-auto grid max-w-lg gap-0.5 px-1 py-1",
            allLinks.length > 6 ? "grid-cols-7" : "grid-cols-6",
          )}
        >
          {allLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px]",
                  active ? "text-emerald-600" : "text-zinc-500",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
