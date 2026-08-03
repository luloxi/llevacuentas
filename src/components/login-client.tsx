"use client";

import { authClient } from "@/lib/auth/client";
import { useState } from "react";

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function LoginClient({
  authReady,
  error,
  allowedHint,
}: {
  authReady: boolean;
  error?: string;
  allowedHint?: string[];
}) {
  const [loading, setLoading] = useState(false);

  async function signInGoogle() {
    setLoading(true);
    const origin = window.location.origin;
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${origin}/dashboard`,
        errorCallbackURL: `${origin}/login?error=oauth`,
      });
      const err =
        result && typeof result === "object" && "error" in result
          ? (result as { error?: { code?: string; message?: string } }).error
          : null;
      if (err) {
        const code = err.code ?? "";
        const msg = err.message ?? "";
        if (
          code === "INVALID_CALLBACKURL" ||
          /callbackurl|trusted|domain/i.test(msg)
        ) {
          window.location.href = "/login?error=domain";
          return;
        }
        window.location.href = "/login?error=oauth";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/callbackurl|trusted|domain|INVALID_CALLBACKURL/i.test(msg)) {
        window.location.href = "/login?error=domain";
        return;
      }
      window.location.href = "/login?error=oauth";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error === "forbidden" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Tu cuenta de Google no está en la lista de acceso. Pedile al dueño que
          agregue tu email a <code>ALLOWED_EMAILS</code>.
        </p>
      )}
      {error === "domain" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Neon Auth no confía este dominio. En Neon Console → Auth →
          Configuration → Domains agregá{" "}
          <code className="text-xs">https://llevacuentas.vercel.app</code>.
        </p>
      )}
      {error === "oauth" && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          No se pudo completar el login con Google. Reintentá o revisá que Auth
          esté habilitado en Neon.
        </p>
      )}
      {error === "auth_not_configured" && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Auth no está configurado en este entorno.
        </p>
      )}

      {authReady ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void signInGoogle()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <GoogleMark />
          {loading ? "Redirigiendo…" : "Continuar con Google"}
        </button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">Falta activar Neon Auth</p>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed">
            <li>
              Abrí{" "}
              <a
                className="underline"
                href="https://console.neon.tech"
                target="_blank"
                rel="noreferrer"
              >
                console.neon.tech
              </a>{" "}
              → proyecto de LlevaCuentas
            </li>
            <li>
              <strong>Auth</strong> → Enable (si no está)
            </li>
            <li>
              Configuration → Domains → agregá{" "}
              <code>https://llevacuentas.vercel.app</code>
            </li>
            <li>
              En Vercel, re-sync del integration Neon (o redeploy) para que
              llegue <code>NEON_AUTH_BASE_URL</code>
            </li>
          </ol>
          <p className="text-xs opacity-80">
            Es el mismo flujo que en lulox.dev: Google sin Google Cloud Console.
          </p>
        </div>
      )}

      {allowedHint && allowedHint.length > 0 && (
        <p className="text-xs text-zinc-500">
          Acceso limitado a: {allowedHint.join(", ")}
          {allowedHint.length >= 1 ? " (+ mails en ALLOWED_EMAILS)" : ""}
        </p>
      )}
    </div>
  );
}
