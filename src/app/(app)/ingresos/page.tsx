import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { IngresosView } from "@/components/ingresos-view";
import { ListSkeleton } from "@/components/ui";

export default async function IngresosPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <Suspense fallback={<ListSkeleton label="Cargando ingresos…" rows={4} />}>
      <IngresosView />
    </Suspense>
  );
}
