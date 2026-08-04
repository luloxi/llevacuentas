import { redirect } from "next/navigation";

/** Deuda vive dentro de Análisis (pestaña Deuda). */
export default function DeudaRedirect() {
  redirect("/analisis");
}
