import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { requireHousehold } from "@/lib/household";
import { normalizeBank } from "@/lib/banks";
import { ensureSchema } from "@/lib/db/ensure-schema";
import {
  importBbvaFile,
  importTransparenciaConsumos,
} from "@/lib/import/bbva";

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;

  try {
    await ensureSchema();
    const ctx = await requireHousehold(sessionUser.id);
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "bbva");
    const bank = normalizeBank(String(form.get("bank") ?? "")) ?? "BBVA";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result =
      kind === "transparencia"
        ? await importTransparenciaConsumos({
            householdId: ctx.household.id,
            userId: sessionUser.id,
            fileName: file.name,
            buffer,
            bank,
          })
        : await importBbvaFile({
            householdId: ctx.household.id,
            userId: sessionUser.id,
            fileName: file.name,
            buffer,
            bank,
          });

    return NextResponse.json(result);
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
