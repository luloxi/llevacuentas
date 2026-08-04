import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { ConsumosWorkspace } from "@/components/consumos-workspace";
import { LoadingBlock } from "@/components/ui";

export default async function ConsumosPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <Suspense fallback={<LoadingBlock label="Cargando consumos…" />}>
      <ConsumosWorkspace />
    </Suspense>
  );
}
