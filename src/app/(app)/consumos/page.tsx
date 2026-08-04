import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { ConsumosWorkspace } from "@/components/consumos-workspace";

export default async function ConsumosPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consumos</h1>
        <p className="text-sm text-zinc-500">
          Importá el banco, cargá tickets y categorizá movimientos.
        </p>
      </div>
      <ConsumosWorkspace />
    </div>
  );
}
