"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="mx-auto max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Tu espacio</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Creá un espacio para vos solo o compartilo con otras personas y
          lleven los gastos juntos.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold">Crear espacio</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Nombre del espacio"
          disabled={loading !== null}
        />
        <button
          type="button"
          disabled={loading !== null}
          onClick={() => void create()}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading === "create" ? "Creando…" : "Crear y continuar"}
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold">Unirme con código</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm uppercase tracking-widest dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="ABCD1234"
          maxLength={8}
          disabled={loading !== null}
        />
        <button
          type="button"
          disabled={loading !== null || code.length < 6}
          onClick={() => void join()}
          className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {loading === "join" ? "Uniéndome…" : "Unirme"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
