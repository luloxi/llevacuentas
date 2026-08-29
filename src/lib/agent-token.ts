import { timingSafeEqual } from "crypto";

/** Extract the raw token from an Authorization header. */
export function extractBearerToken(
  authorization: string | null | undefined,
): string | null {
  if (!authorization) return null;
  const m = authorization.trim().match(/^Bearer\s+(\S+)/i);
  const token = m?.[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

/** Constant-time compare. Different lengths never match; empty expected never matches. */
export function agentTokenMatches(presented: string, expected: string): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * True only when AGENT_API_KEY is configured and the Authorization header
 * carries that exact Bearer token.
 */
export function isValidAgentRequest(
  authorizationHeader: string | null | undefined,
  apiKey: string | undefined,
): boolean {
  if (!apiKey) return false;
  const token = extractBearerToken(authorizationHeader);
  if (!token) return false;
  return agentTokenMatches(token, apiKey);
}
