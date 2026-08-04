"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { Home, UserPlus } from "lucide-react";

export function HouseholdSetup() {
  const router = useRouter();
  const [name, setName] = useState("Mi espacio");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

  async function create() {
    setLoading("create");
    setError(null);
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "create", name }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(null);
    }
  }

  async function join() {
    setLoading("join");
    setError(null);
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "join", code }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error || `Error ${res.status}`);
        return;
      }
      router.refresh();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="app-shell mx-auto w-full max-w-md animate-fade-up space-y-6 px-1">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <BrandLogo size={48} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Tu espacio</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          Creá un espacio para vos solo o compartilo con otras personas y
          lleven los gastos juntos.
        </p>
      </div>

      <div className="lc-card-elevated space-y-3 p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <Home className="h-4 w-4" />
          </div>
          <h2 className="font-semibold tracking-tight">Crear espacio</h2>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="lc-input w-full"
          placeholder="Nombre del espacio"
          disabled={loading !== null}
        />
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void create()}
          className="lc-btn lc-btn-primary w-full"
        >
          {loading === "create" ? "Creando…" : "Crear y continuar"}
        </button>
      </div>

      <div className="lc-card space-y-3 p-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <UserPlus className="h-4 w-4" />
          </div>
          <h2 className="font-semibold tracking-tight">Unirme con código</h2>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="lc-input w-full uppercase tracking-widest"
          placeholder="ABCD1234"
          maxLength={8}
          disabled={loading !== null}
        />
        <button
          type="button"
          disabled={loading !== null || code.length < 6}
          onClick={() => void join()}
          className="lc-btn lc-btn-secondary w-full"
        >
          {loading === "join" ? "Uniéndome…" : "Unirme"}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
