import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import {
  agentTokenMatches,
  isAgentAuthConfigured,
  resolveAgentUser,
} from "@/lib/agent/auth";
import { mcpErrorResult, mcpJsonResult } from "@/lib/agent/mcp-json";
import {
  getAgentGastos,
  getAgentSummary,
  importAgentStatement,
  listAgentCargas,
} from "@/lib/agent/services";
import { syncUser, type AppUser } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

type AuthExtra = { userId?: string; email?: string };

function userFromAuthInfo(authInfo: {
  extra?: Record<string, unknown>;
  clientId?: string;
} | undefined): AppUser | null {
  const extra = authInfo?.extra as AuthExtra | undefined;
  if (extra?.userId) {
    return {
      id: extra.userId,
      email: extra.email ?? null,
      name: "Agent",
      image: null,
    };
  }
  if (authInfo?.clientId) {
    return {
      id: authInfo.clientId,
      email: extra?.email ?? null,
      name: "Agent",
      image: null,
    };
  }
  return null;
}

async function resolveToolUser(ctx: {
  http?: { authInfo?: { extra?: Record<string, unknown>; clientId?: string } };
}): Promise<AppUser> {
  const fromCtx = userFromAuthInfo(ctx.http?.authInfo);
  if (fromCtx) return fromCtx;
  const user = await resolveAgentUser();
  if (!user) {
    throw new Error(
      "Agente autenticado pero no hay usuario de app. Configurá AGENT_USER_ID o iniciá sesión una vez en la PWA.",
    );
  }
  return user;
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "gastos_del_mes",
      {
        title: "Gastos del mes",
        description:
          "Totales reales de gastos del hogar para un período (YYYY-MM, latest, o mes calendario actual en AR). No inventa números.",
        inputSchema: z.object({
          period: z
            .string()
            .optional()
            .describe(
              "YYYY-MM, latest (último mes con datos), o omitir / current para el mes calendario actual (America/Argentina/Buenos_Aires).",
            ),
        }),
      },
      async ({ period }, ctx) => {
        try {
          const user = await resolveToolUser(ctx);
          await syncUser(user);
          const data = await getAgentGastos(user, period ?? null);
          return mcpJsonResult(data);
        } catch (e) {
          return mcpErrorResult(e);
        }
      },
    );

    server.registerTool(
      "resumen",
      {
        title: "Resumen",
        description:
          "Resumen del hogar: últimos resúmenes importados, períodos disponibles, mes actual y último mes con datos (totales reales).",
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        try {
          const user = await resolveToolUser(ctx);
          await syncUser(user);
          const data = await getAgentSummary(user);
          return mcpJsonResult(data);
        } catch (e) {
          return mcpErrorResult(e);
        }
      },
    );

    server.registerTool(
      "importar_resumen",
      {
        title: "Importar resumen",
        description:
          "Importa un resumen de tarjeta (Excel/PDF BBVA u similar; bank=Fiwind para etiquetar). Enviá el archivo en base64 (fileBase64). Misma lógica que POST /api/agent/import.",
        inputSchema: z.object({
          fileBase64: z
            .string()
            .min(1)
            .describe("Contenido del archivo en base64 (sin data: URL prefix)."),
          fileName: z
            .string()
            .optional()
            .describe("Nombre del archivo, ej. resumen.xlsx o resumen.pdf"),
          bank: z
            .string()
            .optional()
            .describe("Banco / etiqueta (BBVA, Fiwind). Default BBVA."),
          kind: z
            .string()
            .optional()
            .describe("bbva (default) o transparencia."),
        }),
      },
      async ({ fileBase64, fileName, bank, kind }, ctx) => {
        try {
          const user = await resolveToolUser(ctx);
          await syncUser(user);
          const buffer = Buffer.from(fileBase64, "base64");
          const data = await importAgentStatement(user, {
            buffer,
            fileName: fileName ?? "statement.bin",
            bank,
            kind,
          });
          return mcpJsonResult(data);
        } catch (e) {
          return mcpErrorResult(e);
        }
      },
    );

    server.registerTool(
      "listar_cargas",
      {
        title: "Listar cargas",
        description:
          "Historial reciente de cargas: resúmenes importados, tickets OCR y cargas manuales.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Máximo de ítems a devolver (default 40)."),
        }),
      },
      async ({ limit }, ctx) => {
        try {
          const user = await resolveToolUser(ctx);
          await syncUser(user);
          const data = await listAgentCargas(user, limit ?? 40);
          return mcpJsonResult(data);
        } catch (e) {
          return mcpErrorResult(e);
        }
      },
    );
  },
  {
    serverInfo: {
      name: "llevacuentas",
      version: "1.0.0",
    },
    instructions:
      "LlevaCuentas MCP: consultá e importá finanzas del hogar. Auth: Authorization Bearer AGENT_API_TOKEN. Los números vienen de la base; no inventes montos.",
  },
);

const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken || !isAgentAuthConfigured()) return undefined;
  if (!agentTokenMatches(bearerToken)) return undefined;
  const user = await resolveAgentUser();
  if (!user) return undefined;
  return {
    token: bearerToken,
    clientId: user.id,
    scopes: ["llevacuentas:read", "llevacuentas:import"],
    extra: {
      userId: user.id,
      email: user.email ?? undefined,
    },
  };
};

const authHandler = withMcpAuth(mcpHandler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
