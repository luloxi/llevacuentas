import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  appUrlFromRequest,
  clientIp,
  getPolar,
  isPolarCheckoutConfigured,
  polarProductId,
} from "@/lib/polar";

export async function POST(req: Request) {
  const authResult = await requireApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  if (!isPolarCheckoutConfigured()) {
    return NextResponse.json(
      { error: "Falta configurar Polar", code: "polar_unconfigured" },
      { status: 503 },
    );
  }

  const polar = getPolar();
  const productId = polarProductId();
  if (!polar || !productId) {
    return NextResponse.json(
      { error: "Falta configurar Polar", code: "polar_unconfigured" },
      { status: 503 },
    );
  }

  const origin = appUrlFromRequest(req);
  const successUrl = `${origin}/suscripcion?checkout=ok`;
  const returnUrl = `${origin}/suscripcion`;
  const ip = clientIp(req);

  const base = {
    products: [productId],
    externalCustomerId: user.id,
    customerEmail: user.email ?? undefined,
    metadata: { userId: user.id },
    successUrl,
    returnUrl,
    locale: "es",
    customerIpAddress: ip,
  };

  try {
    let checkout;
    try {
      checkout = await polar.checkouts.create({
        ...base,
        currency: "ars",
      });
    } catch (arsErr) {
      // Product without ARS price: Polar still charges the catalog currency.
      console.warn(
        "[billing/checkout] ARS presentment failed, retrying without currency",
        arsErr instanceof Error ? arsErr.message : arsErr,
      );
      checkout = await polar.checkouts.create(base);
    }

    if (!checkout.url) {
      return NextResponse.json(
        { error: "Polar no devolvió una URL de checkout" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de Polar";
    console.error("[billing/checkout]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
