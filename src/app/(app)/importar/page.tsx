import { redirect } from "next/navigation";

/** Legacy — importación se unificó en Consumos. */
export default function ImportarRedirect() {
  redirect("/consumos");
}
