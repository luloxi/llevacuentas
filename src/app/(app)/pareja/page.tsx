import { redirect } from "next/navigation";

/** Legacy route — "Pareja" was renamed to "Grupo". */
export default function ParejaRedirect() {
  redirect("/grupo");
}
