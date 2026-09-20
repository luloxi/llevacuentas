import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { ConsumosWorkspace } from "@/components/consumos-workspace";
import { ListSkeleton } from "@/components/ui";

export default async function ConsumosPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  // Belt: same Rainman reclassify as dashboard /api/transactions (idempotent).
  try {
    const { reclassifyFiwindNoise } = await import(
      "@/lib/import/reclassify-fiwind"
    );
    await reclassifyFiwindNoise(ctx.household.id, { userId: user.id });
  } catch {
    // Non-fatal — workspace still loads via client API.
  }

  return (
    <Suspense fallback={<ListSkeleton label="Cargando consumos…" />}>
      <ConsumosWorkspace />
    </Suspense>
  );
}
