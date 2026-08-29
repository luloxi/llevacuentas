import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentTokenMatches,
  extractBearerToken,
  isValidAgentRequest,
} from "./agent-token";

test("extractBearerToken reads Bearer tokens", () => {
  assert.equal(extractBearerToken("Bearer secret-token"), "secret-token");
  assert.equal(extractBearerToken("bearer secret-token"), "secret-token");
  assert.equal(extractBearerToken("Bearer  secret-token"), "secret-token");
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(""), null);
  assert.equal(extractBearerToken("Basic abc"), null);
  assert.equal(extractBearerToken("Bearer"), null);
  assert.equal(extractBearerToken("Bearer "), null);
});

test("agentTokenMatches is exact and rejects empties", () => {
  assert.equal(agentTokenMatches("abc", "abc"), true);
  assert.equal(agentTokenMatches("abc", "abd"), false);
  assert.equal(agentTokenMatches("abc", "abcd"), false);
  assert.equal(agentTokenMatches("", "abc"), false);
  assert.equal(agentTokenMatches("abc", ""), false);
  assert.equal(agentTokenMatches("", ""), false);
});

test("isValidAgentRequest requires configured key + matching Bearer", () => {
  const key = "k".repeat(32);
  assert.equal(isValidAgentRequest(`Bearer ${key}`, key), true);
  assert.equal(isValidAgentRequest(`Bearer ${key}x`, key), false);
  assert.equal(isValidAgentRequest(`Bearer ${key}`, undefined), false);
  assert.equal(isValidAgentRequest(`Bearer ${key}`, ""), false);
  assert.equal(isValidAgentRequest(null, key), false);
  assert.equal(isValidAgentRequest("Bearer wrong-length", key), false);
});
