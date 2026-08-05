import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { HouseholdSetup } from "@/components/household-setup";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();

  if (!hasDatabase()) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <h1 className="text-lg font-semibold">Falta configurar la base de datos</h1>
          <p className="mt-2">
            En Vercel → Storage asegurate de que Neon inyecte{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">DATABASE_URL</code>.
            El schema se crea solo al primer uso.
          </p>
        </div>
      </main>
    );
  }

  const ctx = await getUserHousehold(user.id);
  if (ctx) redirect("/dashboard");

  return (
    <main className="flex min-h-full flex-1 items-center px-4 py-12">
      <Suspense fallback={null}>
        <HouseholdSetup />
      </Suspense>
    </main>
  );
}
