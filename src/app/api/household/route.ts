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
  const { user: sessionUser } = authResult;
  try {
    const body = await req.json();
    if (body.action === "join") {
      const ctx = await joinHousehold(sessionUser.id, body.code);
      return NextResponse.json({ household: ctx });
    }
    const ctx = await createHousehold(
      sessionUser.id,
      body.name || "Nuestro hogar",
    );
    return NextResponse.json({ household: ctx });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
