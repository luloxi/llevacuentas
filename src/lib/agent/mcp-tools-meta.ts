/** Public catalogue of MCP tools (UI + docs). No secrets. */
export const MCP_TOOLS = [
  {
    name: "gastos_del_mes",
    summary:
      "Totales reales del mes (period opcional: YYYY-MM, latest o mes actual AR).",
  },
  {
    name: "resumen",
    summary:
      "Resúmenes importados, períodos disponibles y totales del mes actual / último con datos.",
  },
  {
    name: "importar_resumen",
    summary:
      "Importa Excel/CSV/PDF (fileBase64 + fileName; bank opcional, ej. Fiwind).",
  },
  {
    name: "listar_cargas",
    summary: "Historial de cargas (resúmenes, tickets, manuales).",
  },
] as const;

export const MCP_PUBLIC_PATH = "/api/mcp";
export const MCP_PUBLIC_URL = "https://llevacuentas.vercel.app/api/mcp";
