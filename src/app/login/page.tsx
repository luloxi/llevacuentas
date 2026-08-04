import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isAuthConfigured } from "@/lib/auth/server";
import { LoginClient } from "@/components/login-client";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const authReady = isAuthConfigured();

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white">
            LC
          </div>
          <h1 className="text-3xl font-bold tracking-tight">LlevaCuentas</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Gastos de tarjeta BBVA, tickets de súper y balance compartido.
          </p>
        </div>

        <LoginClient authReady={authReady} error={params.error} />
      </div>
    </main>
  );
}
