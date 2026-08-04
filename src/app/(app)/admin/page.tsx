import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/auth/allowlist";
import { AdminPanel } from "@/components/admin-panel";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
        <p className="text-sm text-zinc-500">
          Habilitá o quitá el acceso de personas a LlevaCuentas.
        </p>
      </div>
      <AdminPanel />
    </div>
  );
}
