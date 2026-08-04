import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageStack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-up space-y-5", className)}>{children}</div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-700/80 dark:text-emerald-400/80">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Surface({
  children,
  className,
  elevated = false,
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  padding?: boolean;
}) {
  return (
    <div
      className={cn(
        elevated ? "lc-card-elevated" : "lc-card",
        padding && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; icon?: ReactNode }>;
  className?: string;
}) {
  return (
    <div className={cn("lc-seg", className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          data-active={value === opt.id}
          onClick={() => onChange(opt.id)}
          className="lc-seg-item"
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "brand" | "danger" | "violet" | "amber";
  icon?: ReactNode;
}) {
  const tones = {
    neutral:
      "border-zinc-200/90 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/60",
    brand:
      "border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-zinc-950/60",
    danger:
      "border-red-200/80 bg-gradient-to-br from-red-50/90 to-white dark:border-red-900/50 dark:from-red-950/30 dark:to-zinc-950/60",
    violet:
      "border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white dark:border-violet-900/40 dark:from-violet-950/30 dark:to-zinc-950/60",
    amber:
      "border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white dark:border-amber-900/40 dark:from-amber-950/25 dark:to-zinc-950/60",
  } as const;

  const valueTone = {
    neutral: "text-zinc-900 dark:text-zinc-50",
    brand: "text-emerald-900 dark:text-emerald-100",
    danger: "text-red-800 dark:text-red-200",
    violet: "text-violet-950 dark:text-violet-100",
    amber: "text-amber-950 dark:text-amber-100",
  } as const;

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm backdrop-blur", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
          {label}
        </p>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 text-emerald-700 shadow-sm dark:bg-zinc-900/70 dark:text-emerald-300">
            {icon}
          </div>
        )}
      </div>
      <p className={cn("mt-1.5 text-xl font-bold tabular-nums tracking-tight", valueTone[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="lc-card flex flex-col items-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="lc-card space-y-3 p-5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        {label}
      </div>
      <div className="skeleton h-3 w-2/5" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton h-10 w-4/5" />
    </div>
  );
}

export function Toast({
  children,
  tone = "ok",
}: {
  children: ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      role="status"
      className={cn("lc-toast", tone === "ok" ? "lc-toast-ok" : "lc-toast-warn")}
    >
      {children}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {children}
    </span>
  );
}
