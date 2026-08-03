import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createHousehold, getUserHousehold, joinHousehold } from "@/lib/household";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const ctx = await getUserHousehold(session.user.id);
    return NextResponse.json({ household: ctx });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const body = await req.json();
    if (body.action === "join") {
      const ctx = await joinHousehold(session.user.id, body.code);
      return NextResponse.json({ household: ctx });
    }
    const ctx = await createHousehold(
      session.user.id,
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
