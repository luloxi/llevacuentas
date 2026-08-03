"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HouseholdSetup() {
  const router = useRouter();
  const [name, setName] = useState("Nuestro hogar");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/household", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    router.refresh();
    router.push("/dashboard");
  }

  async function join() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/household", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", code }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Tu espacio de pareja</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Creá un hogar o uníte con el código de tu pareja (máx. 2 personas).
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="font-semibold">Crear hogar</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Nombre del hogar"
        />
        <button
          type="button"
          disabled={loading}
          onClick={create}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          Crear y continuar
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
        />
        <button
          type="button"
          disabled={loading || code.length < 6}
          onClick={join}
          className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Unirme
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
