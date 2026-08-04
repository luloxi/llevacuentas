import OpenAI from "openai";
import { z } from "zod";

export const ReceiptOcrSchema = z.object({
  merchant: z.string().nullable(),
  date: z.string().nullable(), // ISO YYYY-MM-DD
  total: z.number().nullable(),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().nullable().default(1),
        unit_price: z.number().nullable(),
        line_total: z.number().nullable(),
      }),
    )
    .default([]),
});

export type ReceiptOcrResult = z.infer<typeof ReceiptOcrSchema>;

const SYSTEM = `Sos un extractor de tickets de supermercado de Argentina.
Analizá la imagen del ticket y devolvé SOLO un JSON válido (sin markdown) con esta forma:
{
  "merchant": "nombre del comercio o null",
  "date": "YYYY-MM-DD o null",
  "total": número o null,
  "currency": "ARS" o "USD",
  "items": [
    { "name": "producto", "quantity": 1, "unit_price": 100, "line_total": 100 }
  ]
}
Reglas:
- total es el monto final a pagar (incl. descuentos si aplica el total cobrado).
- Fechas en formato argentino DD/MM/YYYY → convertí a YYYY-MM-DD.
- Montos con coma decimal argentina → número JS (punto decimal).
- Si no podés leer un campo, usá null.
- Incluí tantos ítems como puedas leer del ticket.`;

/** True when any vision provider key is configured. */
export function isOcrConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.XAI_API_KEY);
}

function createVisionClient(): {
  client: OpenAI;
  model: string;
} {
  // Prefer OpenAI (user credits). Fallback to xAI if only that is set.
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
    };
  }

  if (process.env.XAI_API_KEY) {
    return {
      client: new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: "https://api.x.ai/v1",
      }),
      model: process.env.XAI_VISION_MODEL ?? "grok-2-vision-1212",
    };
  }

  throw new Error(
    "Falta OPENAI_API_KEY (o XAI_API_KEY). Configurala en Vercel → Settings → Environment Variables.",
  );
}

export async function parseReceiptImage(
  imageUrlOrDataUrl: string,
): Promise<ReceiptOcrResult> {
  const { client, model } = createVisionClient();

  const response = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extraé los datos del ticket de supermercado.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrlOrDataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No se pudo parsear la respuesta del OCR");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return ReceiptOcrSchema.parse(parsed);
}

/** Offline/dev fixture when no API key */
export function mockReceiptOcr(): ReceiptOcrResult {
  return {
    merchant: "DIA TIENDA 536",
    date: new Date().toISOString().slice(0, 10),
    total: 30277,
    currency: "ARS",
    items: [
      { name: "LECHE ENTERA 1L", quantity: 2, unit_price: 1800, line_total: 3600 },
      { name: "PAN LACTAL", quantity: 1, unit_price: 3200, line_total: 3200 },
      { name: "YERBA 1KG", quantity: 1, unit_price: 8500, line_total: 8500 },
      { name: "ACEITE GIRASOL", quantity: 1, unit_price: 7200, line_total: 7200 },
      { name: "VARIOS", quantity: 1, unit_price: 7777, line_total: 7777 },
    ],
  };
}
