import { redirect } from "next/navigation";

/** Legacy route — who-owes-whom removed; shared budget lives in /compartido */
export default function GrupoRedirect() {
  redirect("/compartido");
}
