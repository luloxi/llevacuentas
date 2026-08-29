import { POST as importStatement } from "@/app/api/import/bbva/route";

/**
 * Agent alias of POST /api/import/bbva
 * multipart: file, bank (BBVA | Fiwind | …), kind (bbva | transparencia)
 * Auth: Authorization: Bearer $AGENT_API_KEY (or PWA session)
 */
export async function POST(req: Request) {
  return importStatement(req);
}
