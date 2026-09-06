import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { createHousehold, getUserHousehold, joinHousehold } from "@/lib/household";

export async function GET() {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user: sessionUser } = authResult;
  try {
    const ctx = await getUserHousehold(sessionUser.id);
    return NextResponse.json({ household: ctx });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  if (authResult.authKind === "household_token") {
    return NextResponse.json(
      {
        error: "Usá la sesión de la app para crear o unirte a un hogar",
        code: "session_required",
      },
      { status: 403 },
    );
  }
  const { user: sessionUser } = authResult;
  try {
    const body = await req.json();
    if (body.action === "join") {
      const ctx = await joinHousehold(sessionUser.id, body.code);
      return NextResponse.json({ household: ctx });
    }
    const ctx = await createHousehold(
      sessionUser.id,
      body.name || "Mi espacio",
    );
    return NextResponse.json({ household: ctx });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
