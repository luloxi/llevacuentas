import { requireUser } from "@/lib/session";
import { getUserHousehold } from "@/lib/household";
import { hasDatabase } from "@/lib/db";
import { redirect } from "next/navigation";
import { ParejaPanel } from "@/components/pareja-panel";

export default async function ParejaPage() {
  const user = await requireUser();
  if (!hasDatabase()) redirect("/onboarding");
  const ctx = await getUserHousehold(user.id);
  if (!ctx) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pareja</h1>
        <p className="text-sm text-zinc-500">
          Invitá a tu pareja y mirá el balance de gastos compartidos.
        </p>
      </div>
      <ParejaPanel
        inviteCode={ctx.household.inviteCode}
        members={ctx.members.map((m) => ({
          userId: m.userId,
          name: m.name,
          email: m.email,
          role: m.role,
        }))}
      />
    </div>
  );
}
