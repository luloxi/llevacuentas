import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { DeudaView } from "@/components/deuda-view";
import { ListSkeleton, PageHeader, PageStack, Surface } from "@/components/ui";
import { DEUDA_ENABLED } from "@/lib/features";

function DeudaPronto() {
  return (
    <PageStack>
      <PageHeader
        eyebrow="En pausa"
        title="Deuda, más adelante"
        description="Esta pantalla quedó desactualizada. La estamos acomodando — pronto vuelve."
      />
      <Surface className="max-w-lg">
        <p className="text-sm leading-relaxed text-[var(--muted-fg)]">
          Cancelaste la deuda del banco y de la tarjeta, y acá seguía mostrando
          números que no cerraban. Mejor esconderla un rato que mentirte.
        </p>
        <Link
          href="/dashboard"
          className="lc-btn lc-btn-primary mt-5 inline-flex !px-4 !py-2"
        >
          Volver al inicio
        </Link>
      </Surface>
    </PageStack>
  );
}

export default async function DeudaPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  if (!DEUDA_ENABLED) {
    return <DeudaPronto />;
  }

  return (
    <Suspense fallback={<ListSkeleton label="Cargando deuda…" rows={5} />}>
      <DeudaView />
    </Suspense>
  );
}
