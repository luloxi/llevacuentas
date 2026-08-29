<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Agent HTTP API (Cursor / Grok Bot)

Do not invent an MCP server. Authenticate with `Authorization: Bearer $AGENT_API_KEY` (env `AGENT_API_KEY`). The token acts as lucianoolivabianco@gmail.com after that user has logged in once via the PWA.

1. Load a statement (BBVA or Fiwind): `POST /api/agent/import` multipart `file` + `bank` + `kind=bbva`. Same handler as `POST /api/import/bbva`.
2. This month's expenses (real DB numbers): `GET /api/agent/gastos-mes`. Optional `?period=YYYY-MM`. Also `GET /api/stats/mes-a-mes?period=current`.
