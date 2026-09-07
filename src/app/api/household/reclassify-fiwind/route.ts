import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { requireHousehold } from "@/lib/household";
import { reclassifyFiwindNoise } from "@/lib/import/reclassify-fiwind";

export async function POST() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    const ctx = await requireHousehold(user.id);
    const result = await reclassifyFiwindNoise(ctx.household.id);
    const message =
      result.updated === 0
        ? result.alreadyOk > 0
          ? `Nada nuevo: ${result.alreadyOk} ya estaban como ruido (Conversiones / crypto). No se borró nada.`
          : "No había ruido Fiwind para reclasificar."
        : `Listo: ${result.updated} movimiento${result.updated === 1 ? "" : "s"} fuera de gastos (categoría Conversiones). No se borró nada.`;
    return NextResponse.json({ ok: true, ...result, message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    if (msg === "NO_HOUSEHOLD") {
      return NextResponse.json(
        { error: "Creá o uníte a un hogar primero" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
