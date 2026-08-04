import { redirect } from "next/navigation";

/** Legacy — supermercado se unificó en Consumos. */
export default function SupermercadoRedirect() {
  redirect("/consumos");
}
