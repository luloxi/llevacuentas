import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { requireHousehold } from "@/lib/household";
import { normalizeBank } from "@/lib/banks";
import {
  importBbvaFile,
  importTransparenciaConsumos,
} from "@/lib/import/bbva";
import {
  parseStatementMovements,
  summarizeParsedMovements,
} from "@/lib/agent/import-summary";

async function readUpload(req: Request): Promise<
  | {
      buffer: Buffer;
      fileName: string;
      bank: string;
      kind: string;
    }
  | { error: string }
> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as {
      fileBase64?: string;
      fileName?: string;
      bank?: string;
      kind?: string;
    };
    if (!body.fileBase64) return { error: "Falta fileBase64" };
    const fileName =
      (body.fileName ?? "statement.bin").trim() || "statement.bin";
    const buffer = Buffer.from(body.fileBase64, "base64");
    if (buffer.length === 0) return { error: "Archivo vacío" };
    return {
      buffer,
      fileName,
      bank: normalizeBank(body.bank) ?? "BBVA",
      kind: String(body.kind ?? "bbva"),
    };
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Falta el archivo" };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) return { error: "Archivo vacío" };
  return {
    buffer,
    fileName: file.name,
    bank: normalizeBank(String(form.get("bank") ?? "")) ?? "BBVA",
    kind: String(form.get("kind") ?? "bbva"),
  };
}

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  try {
    const ctx = await requireHousehold(user.id);
    const upload = await readUpload(req);
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }

    const { movements, source } = await parseStatementMovements(
      upload.buffer,
      upload.fileName,
    );
    const fileSummary = summarizeParsedMovements(movements, source);

    const result =
      upload.kind === "transparencia"
        ? await importTransparenciaConsumos({
            householdId: ctx.household.id,
            userId: user.id,
            fileName: upload.fileName,
            buffer: upload.buffer,
            bank: upload.bank,
          })
        : await importBbvaFile({
            householdId: ctx.household.id,
            userId: user.id,
            fileName: upload.fileName,
            buffer: upload.buffer,
            bank: upload.bank,
          });

    return NextResponse.json({
      ok: true,
      bank: upload.bank,
      fileName: upload.fileName,
      file: fileSummary,
      import: result,
    });
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
