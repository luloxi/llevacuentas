# Agent API (El Tano / Jurio)

LlevaCuentas already imported BBVA statements and computed mes-a-mes in the PWA.
This slice exposes that same data to Cursor/Grok Bot agents over HTTP.

There is no MCP server in this slice: Grok Bot cannot host one for the app, and
WebFetch cannot send `Authorization` headers. Agents should `curl` the deployed
PWA origin (the Vercel URL of this project).

## Auth

```
Authorization: Bearer <AGENT_API_TOKEN>
```

The token acts as Luciano's app user (household owner). Cookie login still works
for the PWA; bearer is for agents only.

### Secrets (Vercel env, never commit)

| Name | Required | Purpose |
| --- | --- | --- |
| `AGENT_API_TOKEN` | yes | Random bearer secret. Same value in Vercel and in the agent environment. |
| `AGENT_USER_ID` | recommended | Neon Auth / `users.id` to act as. |
| `AGENT_USER_EMAIL` | optional | Used if `AGENT_USER_ID` is unset. Defaults to `lucianoolivabianco@gmail.com`. |

Generate a token (example): `openssl rand -hex 32`

The user row must already exist (one PWA login) unless you set `AGENT_USER_ID`.
The user must already belong to a household.

## Calls

Replace `$APP_URL` with the Vercel origin (same host as the PWA).

### 1. Load summary (stored statements + current month)

```bash
curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "$APP_URL/api/agent/summary"
```

### 1b. Import a statement (BBVA Excel/PDF; label bank=Fiwind if needed)

Same parser as the PWA import. Fiwind has no dedicated parser yet; files with
fecha / comercio / importe columns work. Pass `bank=Fiwind` to label rows.

Multipart:

```bash
curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -F "file=@resumen.xlsx" -F "bank=BBVA" \
  "$APP_URL/api/agent/import"
```

JSON (when the agent already has bytes as base64):

```bash
curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"resumen.xlsx","bank":"BBVA","fileBase64":"<base64>"}' \
  "$APP_URL/api/agent/import"
```

### 2. Gastos del mes (real stored totals)

Current calendar month (America/Argentina/Buenos_Aires):

```bash
curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "$APP_URL/api/agent/gastos"
```

A specific month, or the latest month that has data:

```bash
curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "$APP_URL/api/agent/gastos?period=2026-08"

curl -sS -H "Authorization: Bearer $AGENT_API_TOKEN" \
  "$APP_URL/api/agent/gastos?period=latest"
```

Read `formatted.headline` plus `totalArs` / `totalUsd` / `totalArsCombined`.
Empty months return zeros — never invented figures.

Bearer also works on the existing PWA routes (`POST /api/import/bbva`,
`GET /api/stats/mes-a-mes`) if you need the full UI payloads.

## PDF genéricos (IA)

Si el PDF no matchea el parser BBVA y está `OPENAI_API_KEY`, el import usa IA (`pdf_ai` / `statement_pdf`). Misma dedupe por `externalFingerprint`.
