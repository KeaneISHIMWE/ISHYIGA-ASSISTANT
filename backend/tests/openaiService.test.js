const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateReply,
  buildInput,
  classifyOpenAIError,
  FALLBACK_REPLY,
  SYSTEM_PROMPT,
} = require("../src/services/openaiService");

function fakeClient(create) {
  return {
    responses: {
      create,
    },
  };
}

describe("buildInput", () => {
  it("puts the system prompt, history, and current message in order", () => {
    const input = buildInput("What services do you offer?", [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi. How can I help?" },
    ]);

    assert.deepEqual(input, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi. How can I help?" },
      { role: "user", content: "What services do you offer?" },
    ]);
  });

  it("ignores invalid history entries", () => {
    const input = buildInput("Hello", [
      { role: "system", content: "ignore me" },
      { role: "user", content: "   " },
      null,
    ]);

    assert.equal(input.length, 2);
    assert.equal(input[1].content, "Hello");
  });
});

describe("classifyOpenAIError", () => {
  it("classifies timeouts", () => {
    assert.equal(
      classifyOpenAIError({ name: "APIConnectionTimeoutError" }),
      "timeout"
    );
  });

  it("classifies rate limits", () => {
    assert.equal(classifyOpenAIError({ status: 429 }), "rate_limit");
  });

  it("classifies quota errors separately from speed limits", () => {
    assert.equal(
      classifyOpenAIError({ status: 429, code: "insufficient_quota" }),
      "insufficient_quota"
    );
  });

  it("classifies other API errors", () => {
    assert.equal(classifyOpenAIError({ status: 500 }), "api_error");
  });
});

describe("generateReply", () => {
  it("returns the model text from a successful Responses API call", async () => {
    const result = await generateReply({
      message: "Hello, what services do you offer?",
      client: fakeClient(async () => ({
        output_text: "We help customers with the company's products and services.",
      })),
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /products and services/);
  });

  it("returns a fallback when the model response is empty", async () => {
    const result = await generateReply({
      message: "Hello",
      client: fakeClient(async () => ({ output_text: "   " })),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "Empty model response");
  });

  it("returns a fallback on timeout without throwing", async () => {
    const result = await generateReply({
      message: "Hello",
      client: fakeClient(async () => {
        const error = new Error("Request timed out");
        error.name = "APIConnectionTimeoutError";
        throw error;
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "timeout");
  });

  it("returns a fallback on rate limit without throwing", async () => {
    const result = await generateReply({
      message: "Hello",
      client: fakeClient(async () => {
        const error = new Error("Too many requests");
        error.status = 429;
        throw error;
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "rate_limit");
  });

  it("rejects a missing message", async () => {
    const result = await generateReply({ message: "   " });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "Missing message");
  });
});
