import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  agentTokenMatches,
  isAgentAuthConfigured,
  parseBearerToken,
} from "./auth";

const prevToken = process.env.AGENT_API_TOKEN;

describe("agent bearer auth", () => {
  beforeEach(() => {
    delete process.env.AGENT_API_TOKEN;
  });
  afterEach(() => {
    if (prevToken === undefined) delete process.env.AGENT_API_TOKEN;
    else process.env.AGENT_API_TOKEN = prevToken;
  });

  it("parses Authorization: Bearer", () => {
    assert.equal(parseBearerToken("Bearer secret-token"), "secret-token");
    assert.equal(parseBearerToken("bearer secret-token"), "secret-token");
    assert.equal(parseBearerToken("Basic abc"), null);
    assert.equal(parseBearerToken(null), null);
    assert.equal(parseBearerToken(""), null);
  });

  it("rejects missing or empty configured token", () => {
    assert.equal(isAgentAuthConfigured(), false);
    assert.equal(agentTokenMatches("anything"), false);
    process.env.AGENT_API_TOKEN = "";
    assert.equal(isAgentAuthConfigured(), false);
  });

  it("accepts only the exact configured token", () => {
    process.env.AGENT_API_TOKEN = "test-agent-token-not-a-finance-figure";
    assert.equal(isAgentAuthConfigured(), true);
    assert.equal(
      agentTokenMatches("test-agent-token-not-a-finance-figure"),
      true,
    );
    assert.equal(agentTokenMatches("wrong"), false);
    assert.equal(agentTokenMatches(""), false);
  });
});
