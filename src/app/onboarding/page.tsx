import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { HouseholdSetup } from "@/components/household-setup";

export default async function OnboardingPage() {
  await requireUser();

  if (!hasDatabase()) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <h1 className="text-lg font-semibold">Falta configurar la base de datos</h1>
          <p className="mt-2">
            Agregá <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">DATABASE_URL</code> de
            Neon en <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">.env.local</code> y
            corré las migraciones:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
{`npx drizzle-kit push
npm run dev`}
          </pre>
        </div>
      </main>
    );
  }

  const user = await requireUser();
  const ctx = await getUserHousehold(user.id);
  if (ctx) redirect("/dashboard");

  return (
    <main className="flex min-h-full flex-1 items-center px-4 py-12">
      <HouseholdSetup />
    </main>
  );
}
