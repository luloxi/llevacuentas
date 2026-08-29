# LlevaCuentas

App web/PWA para llevar gastos de tarjeta **BBVA**, tickets de **supermercado** y gastos de **pareja**.

## Qué hace

- Importar Excel de **Últimos movimientos** BBVA y desglosarlo como **Transparencia** (Consumos + Mes a mes).
- Migrar histórico desde `Transparencia_Actualizada_*.xlsx` (hoja Consumos).
- Login con **Google** (y acceso demo local).
- Gastos **personales o compartidos** (hogar de 2 personas) + balance de pareja.
- Foto de **ticket de súper** → OCR → asocia al gasto bancario del día o lo crea.
- Sección de **desglose por ítems** del ticket.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Neon Postgres + Drizzle ORM
- Auth.js (Google + login demo)
- Vercel Blob (opcional) + xAI Vision (OCR)

## Setup

```bash
cp .env.example .env.local
# Completar DATABASE_URL (Neon), AUTH_SECRET, y opcionalmente Google / XAI / Blob

npm install
npx drizzle-kit push
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

### Google OAuth

1. Creá credenciales OAuth en Google Cloud.
2. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (y la URL de Vercel en prod).
3. `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` en `.env.local` y en Vercel.

### Neon en Vercel

En el dashboard de Vercel → Storage → create/connect Neon → copiá `DATABASE_URL`.

## API para agentes (Cursor / Grok Bot)

Los agentes no usan la cookie de la PWA. Un Bearer token llama las mismas operaciones de importar resumen y gastos del mes.

### Secret

En `.env.local` y en Vercel seteá **`AGENT_API_KEY`** (token largo, por ejemplo `openssl rand -hex 32`). No lo commitees.

El token actúa como **lucianoolivabianco@gmail.com**. Hace falta haber iniciado sesión una vez en la app para que el usuario exista en la DB.

Header en todas las llamadas: `Authorization: Bearer <AGENT_API_KEY>`

### 1. Cargar un resumen (BBVA o Fiwind)

`POST /api/agent/import` (multipart)

- `file`: Excel o PDF de movimientos
- `bank`: `BBVA` o `Fiwind` (u otro de la lista)
- `kind`: `bbva` (default) o `transparencia`

Equivalente: `POST /api/import/bbva` con el mismo header y form. El parser es el existente (`src/lib/import/bbva.ts`).

### 2. Gastos del mes (números reales de la DB)

`GET /api/agent/gastos-mes`

Mes calendario en `America/Argentina/Buenos_Aires`. Otro mes: `?period=2026-07`.

Respuesta: `totalArs`, `totalUsd`, `totalArsCombined`, `totalCount`, `categories[]` calculados desde `transactions`. Un mes vacío devuelve ceros — no hay totales inventados.

También: `GET /api/stats/mes-a-mes?period=current` (payload más grande, el de la UI).

Tests: `npm test`

## Scripts útiles

```bash
# Probar parsers con tus Excels reales
npx tsx scripts/test-bbva-parse.ts

# Schema → Neon
npx drizzle-kit push
```

## Flujo recomendado

1. Login → crear hogar (o unirse con código de pareja).
2. **Importar** el xlsx de BBVA (o Transparencia).
3. Revisar **Consumos** y marcar personal/compartido.
4. Ver **Mes a mes**.
5. En **Supermercado**, sacar foto al ticket: se linkea al `DIA TIENDA…` del día o se agrega el gasto.

## Deploy (Vercel)

```bash
vercel link
vercel env pull .env.local
npx drizzle-kit push
vercel --prod
```
