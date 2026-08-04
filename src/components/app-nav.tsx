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
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/consumos", label: "Gastos", icon: List },
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

  const desktopLinks = isAdmin
    ? [...links, { href: "/admin", label: "Admin", icon: Shield }]
    : links;

  const left = links.slice(0, 2);
  const right = links.slice(2, 4);

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
            {desktopLinks.map(({ href, label, icon: Icon }) => {
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
            <Link
              href="/consumos?scan=1"
              className="ml-1 flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-md shadow-violet-600/25 transition hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Agregar
            </Link>
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
        <div className="relative mx-auto grid max-w-lg grid-cols-5 items-end gap-0.5 px-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1">
          {left.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <NavSlot key={href} href={href} label={label} active={active}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
              </NavSlot>
            );
          })}

          <div className="relative flex flex-col items-center">
            <Link
              href="/consumos?scan=1"
              className="absolute -top-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-violet-500 to-violet-700 text-white shadow-lg shadow-violet-600/40 ring-4 ring-white transition active:scale-95 dark:ring-zinc-950"
              aria-label="Agregar gasto"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </Link>
            <span className="mt-10 text-[10px] font-medium text-violet-600 dark:text-violet-400">
              Agregar
            </span>
          </div>

          {right.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <NavSlot key={href} href={href} label={label} active={active}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
              </NavSlot>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function NavSlot({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
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
        {children}
      </span>
      {label}
    </Link>
  );
}
