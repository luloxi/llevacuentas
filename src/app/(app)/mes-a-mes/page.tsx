import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { MesAMesView } from "@/components/mes-a-mes";

export default async function MesAMesPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes a mes</h1>
        <p className="text-sm text-zinc-500">
          Totales por categoría: monto, cantidad y porcentaje del mes.
        </p>
      </div>
      <MesAMesView />
    </div>
  );
}
