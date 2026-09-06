"use client";

import Link from "next/link";
import { Bot, Copy, ExternalLink, Check } from "lucide-react";
import { useState } from "react";
import { PageHeader, PageStack, Surface } from "@/components/ui";
import {
  MCP_PUBLIC_URL,
  MCP_TOOLS,
} from "@/lib/agent/mcp-tools-meta";

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-fg)]">
          {label}
        </p>
        <button
          type="button"
          className="lc-btn lc-btn-ghost !px-2 !py-1 text-xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // ignore
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Listo" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-relaxed text-[var(--foreground)]">
        {text}
      </pre>
    </div>
  );
}

export function McpSetupView() {
  const grokCli = `grok mcp add --transport http llevacuentas \\
  ${MCP_PUBLIC_URL} \\
  --header "Authorization: Bearer \${AGENT_API_TOKEN}"`;

  const grokToml = `[mcp_servers.llevacuentas]
url = "${MCP_PUBLIC_URL}"
headers = { Authorization = "Bearer \${AGENT_API_TOKEN}" }`;

  const cursorJson = `{
  "mcpServers": {
    "llevacuentas": {
      "url": "${MCP_PUBLIC_URL}",
      "headers": {
        "Authorization": "Bearer \${AGENT_API_TOKEN}"
      }
    }
  }
}`;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Agentes"
        title="MCP remoto"
        description="Conectá LlevaCuentas a grok.com, Cursor u otro cliente MCP para consultar e importar finanzas con el mismo token del Agent API."
      />

      <Surface className="space-y-2 border border-amber-500/40 bg-amber-50/80 dark:bg-amber-950/30">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Importante: tus datos salen de LlevaCuentas
        </p>
        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          Cuando conectás una IA (grok.com, Cursor u otra) por MCP, los
          movimientos y resúmenes que consultás o importás{" "}
          <strong>salen de LlevaCuentas hacia esa IA</strong>. Es el punto: el
          agente los lee para ayudarte. Si no querés eso, no conectes MCP.
        </p>
        <p className="text-sm leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          <strong>Nunca pegues el Bearer / AGENT_API_TOKEN en un chat</strong>,
          ni en issues, ni en el repo. Generálo con openssl, ponelo en Vercel y
          en tu entorno local. Polar (suscripción) sigue aparte y pausado: esto
          no lo toca.
        </p>
      </Surface>

      <Surface elevated className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand-fg)]">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-[var(--foreground)]">
              URL del servidor MCP
            </p>
            <p className="break-all font-mono text-sm text-[var(--brand-fg)]">
              {MCP_PUBLIC_URL}
            </p>
            <p className="text-xs text-[var(--muted-fg)]">
              Transporte: Streamable HTTP. Auth:{" "}
              <code className="rounded bg-[var(--surface-muted)] px-1">
                Authorization: Bearer &lt;AGENT_API_TOKEN&gt;
              </code>
            </p>
          </div>
        </div>
        <CopyBlock label="URL" text={MCP_PUBLIC_URL} />
      </Surface>

      <Surface className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          1. Token (una sola vez)
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted-fg)]">
          <li>
            Generá un secreto local:{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              openssl rand -hex 32
            </code>
          </li>
          <li>
            En Vercel → Project → Settings → Environment Variables, creá{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              AGENT_API_TOKEN
            </code>{" "}
            con ese valor (y opcional{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              AGENT_USER_ID
            </code>{" "}
            = el id del usuario PWA que ya está en el hogar). Redeploy.
          </li>
          <li>
            Si el agente responde{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              no_household
            </code>
            : sacá un{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              AGENT_USER_ID
            </code>{" "}
            incorrecto o poné el id del usuario que creó/une el hogar (tras un
            login en la PWA). El email{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              AGENT_USER_EMAIL
            </code>{" "}
            también sirve de fallback.
          </li>
          <li>
            En tu máquina / cliente, exportá el mismo valor como{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1 text-[var(--foreground)]">
              AGENT_API_TOKEN
            </code>
            . Nunca lo pegues en el chat ni en el repo.
          </li>
        </ol>
      </Surface>

      <Surface className="space-y-4">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          2. Cómo agregarlo
        </h2>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--foreground)]">
            grok.com / Grok CLI
          </p>
          <CopyBlock label="Comando" text={grokCli} />
          <CopyBlock label="~/.grok/config.toml" text={grokToml} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--foreground)]">
            Cursor u otro cliente MCP (JSON)
          </p>
          <CopyBlock label="mcp.json" text={cursorJson} />
        </div>
      </Surface>

      <Surface className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          3. Tools disponibles
        </h2>
        <ul className="divide-y divide-[var(--border)]">
          {MCP_TOOLS.map((t) => (
            <li
              key={t.name}
              className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
            >
              <code className="text-sm font-medium text-[var(--brand-fg)]">
                {t.name}
              </code>
              <span className="text-sm text-[var(--muted-fg)]">{t.summary}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--muted-fg)]">
          Para importar: el cliente manda{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">
            fileBase64
          </code>{" "}
          (bytes del Excel/PDF en base64) +{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">fileName</code>
          . Misma lógica que la API HTTP.
        </p>
      </Surface>

      <Surface className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--foreground)]">
          Docs
        </h2>
        <p className="text-sm text-[var(--muted-fg)]">
          Detalle curl + MCP en{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">
            docs/agent-api.md
          </code>{" "}
          del repo. También podés usar la API HTTP (
          <code className="rounded bg-[var(--surface-muted)] px-1">
            /api/agent/*
          </code>
          ) con el mismo bearer.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href="/cargas"
            className="lc-btn lc-btn-ghost !px-3 !py-2 text-sm"
          >
            Ir a Cargas
          </Link>
          <a
            href="https://github.com/luloxi/llevacuentas/blob/main/docs/agent-api.md"
            target="_blank"
            rel="noreferrer"
            className="lc-btn lc-btn-ghost !px-3 !py-2 text-sm"
          >
            docs/agent-api.md
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </Surface>
    </PageStack>
  );
}
