import { redirect } from "next/navigation";

/** Resumen y gráficos se movieron a Gastos. */
export default function AnalisisRedirect() {
  redirect("/consumos");
}
