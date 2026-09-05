import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { SuscripcionView } from "@/components/suscripcion-view";
import { LoadingBlock } from "@/components/ui";

export default async function SuscripcionPage() {
  await requireUser();

  return (
    <Suspense fallback={<LoadingBlock label="Cargando suscripción…" />}>
      <SuscripcionView />
    </Suspense>
  );
}
