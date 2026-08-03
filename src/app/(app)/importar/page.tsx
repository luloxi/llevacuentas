import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { ImportForm } from "@/components/import-form";

export default async function ImportarPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar</h1>
        <p className="text-sm text-zinc-500">
          Cargá el resumen de tarjeta BBVA o migrá tu planilla Transparencia.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
