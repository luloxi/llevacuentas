/**
 * Live FX quotes for the home dashboard.
 * - Blue: dolarapi.com
 * - BBVA compra: oficial buy (BBVA tracks the official retail band; no public BBVA feed)
 * - USDC Fiwind: comparadolar.ar fiwind-cripto
 */

export type LiveRate = {
  id: "blue" | "bbva" | "usdc";
  label: string;
  value: number | null;
  hint?: string;
};

export type LiveRatesResult = {
  rates: LiveRate[];
  updatedAt: string | null;
};

const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; data: LiveRatesResult } | null = null;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchBlue(): Promise<{
  buy: number | null;
  sell: number | null;
  at: string | null;
}> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return { buy: null, sell: null, at: null };
    const data = (await res.json()) as {
      compra?: number;
      venta?: number;
      fechaActualizacion?: string;
    };
    return {
      buy: num(data.compra),
      sell: num(data.venta),
      at: data.fechaActualizacion ?? null,
    };
  } catch {
    return { buy: null, sell: null, at: null };
  }
}

async function fetchOficialBuy(): Promise<number | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { compra?: number };
    return num(data.compra);
  } catch {
    return null;
  }
}

async function fetchFiwindUsdc(): Promise<number | null> {
  try {
    const res = await fetch("https://api.comparadolar.ar/usd", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      slug?: string;
      ask?: number | null;
      bid?: number | null;
    }>;
    const row = data.find((r) => r.slug === "fiwind-cripto");
    if (!row) return null;
    // Prefer ask (ARS to buy USDC); fall back to bid
    return num(row.ask) ?? num(row.bid);
  } catch {
    return null;
  }
}

export async function getLiveRates(): Promise<LiveRatesResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.data;
  }

  const [blue, bbvaBuy, usdc] = await Promise.all([
    fetchBlue(),
    fetchOficialBuy(),
    fetchFiwindUsdc(),
  ]);

  const rates: LiveRate[] = [
    {
      id: "blue",
      label: "Blue",
      value: blue.sell ?? blue.buy,
      hint: "venta",
    },
    {
      id: "bbva",
      label: "BBVA",
      value: bbvaBuy,
      hint: "compra",
    },
    {
      id: "usdc",
      label: "USDC",
      value: usdc,
      hint: "Fiwind",
    },
  ];

  const data: LiveRatesResult = {
    rates,
    updatedAt: blue.at,
  };
  cache = { at: Date.now(), data };
  return data;
}
