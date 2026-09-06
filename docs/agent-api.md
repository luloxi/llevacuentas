# Agent API + MCP remoto (El Tano / Jurio / grok.com)

LlevaCuentas expone los mismos datos del hogar por:

1. **HTTP Agent API** (`/api/agent/*`) — ideal para `curl` / scripts.
2. **MCP remoto** (`/api/mcp`) — Streamable HTTP para grok.com, Cursor u otros clientes MCP.

Ambos usan el mismo bearer `AGENT_API_TOKEN` y la misma lógica (no inventan números).

UI de setup (español): **`/mcp`** en la PWA (`https://llevacuentas.vercel.app/mcp`).

## Auth

```
Authorization: Bearer <AGENT_API_TOKEN>
```

El token actúa como el usuario de la app (dueño del hogar). Cookie login sigue para la PWA; bearer es para agentes / MCP.

### Secrets (Vercel env, never commit)

| Name | Required | Purpose |
| --- | --- | --- |
| `AGENT_API_TOKEN` | yes | Random bearer secret. Same value in Vercel and in the agent environment. |
| `AGENT_USER_ID` | recommended | Neon Auth / `users.id` to act as. |
| `AGENT_USER_EMAIL` | optional | Used if `AGENT_USER_ID` is unset. Defaults to `lucianoolivabianco@gmail.com`. |

Generate a token (example): `openssl rand -hex 32`

The user row must already exist (one PWA login) unless you set `AGENT_USER_ID`.
The user must already belong to a household.

## MCP remoto

- **URL:** `https://llevacuentas.vercel.app/api/mcp`
- **Transport:** Streamable HTTP (MCP 2025/2026). Stateless on Vercel (Node runtime).
- **Auth:** header `Authorization: Bearer <AGENT_API_TOKEN>` (no OAuth browser flow).

### Tools

| Tool | Qué hace |
| --- | --- |
| `gastos_del_mes` | Totales reales; `period` opcional (`YYYY-MM`, `latest`, o mes actual AR). |
| `resumen` | Resúmenes importados + períodos + mes actual / último con datos. |
| `importar_resumen` | Importa Excel/PDF: `fileBase64` + `fileName` (+ `bank`, `kind`). |
| `listar_cargas` | Historial de cargas (resúmenes, tickets, manuales). |

### grok.com / Grok CLI

```bash
export AGENT_API_TOKEN="…"   # mismo valor que en Vercel

grok mcp add --transport http llevacuentas \
  https://llevacuentas.vercel.app/api/mcp \
  --header "Authorization: Bearer ${AGENT_API_TOKEN}"
```

O en `~/.grok/config.toml`:

```toml
[mcp_servers.llevacuentas]
url = "https://llevacuentas.vercel.app/api/mcp"
headers = { Authorization = "Bearer ${AGENT_API_TOKEN}" }
```

### Cursor / cliente genérico

```json
{
  "mcpServers": {
    "llevacuentas": {
      "url": "https://llevacuentas.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer ${AGENT_API_TOKEN}"
      }
    }
  }
}
```

Metadata RFC 9728 (descubrimiento): `/.well-known/oauth-protected-resource`.
El flujo esperado es bearer estático, no un Authorization Server interactivo.

## HTTP calls (curl)

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

Discovery: `GET /api/agent` (auth required) lists HTTP + MCP.

## PDF genéricos (IA)

Si el PDF no matchea el parser BBVA y está `OPENAI_API_KEY`, el import usa IA (`pdf_ai` / `statement_pdf`). Misma dedupe por `externalFingerprint`.

## Privacidad

Cuando conectas una IA por MCP, los movimientos salen de LlevaCuentas hacia esa IA. No pegues el token del agente en chats ni en el repo. Polar/suscripcion no se toca con este cambio.
