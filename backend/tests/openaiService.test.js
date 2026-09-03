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
    chat: {
      completions: {
        create,
      },
    },
  };
}

function completion(content) {
  return {
    choices: [{ message: { content } }],
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

  it("keeps only the most recent history turns", () => {
    const history = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index + 1}`,
    }));
    const input = buildInput("Hello", history);

    assert.equal(input.length, 18);
    assert.equal(input[1].content, "turn 25");
    assert.equal(input[16].content, "turn 40");
    assert.equal(input[17].content, "Hello");
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

  it("uses the Ishyiga Software support prompt", () => {
    assert.match(SYSTEM_PROMPT, /Ishyiga Software/i);
    assert.match(SYSTEM_PROMPT, /Customer Support Assistant/i);
    assert.match(SYSTEM_PROMPT, /CARE/i);
    assert.match(SYSTEM_PROMPT, /UNREGISTERED \/ UNRECOGNIZED CONTACT/);
    assert.match(SYSTEM_PROMPT, /NEVER EXPOSE INTERNAL FAILURE MESSAGES/);
    assert.match(SYSTEM_PROMPT, /WhatsApp/i);
    assert.doesNotMatch(SYSTEM_PROMPT, /AIMABLE/);
    assert.doesNotMatch(SYSTEM_PROMPT, /kimenyi/i);
  });

  it("appends customer context to the system prompt when provided", () => {
    const input = buildInput("The invoice failed", [], null, [
      "CUSTOMER CONTEXT",
      "- Company: Demo Shop",
    ].join("\n"));

    assert.match(input[0].content, /Ishyiga Software/i);
    assert.match(input[0].content, /CUSTOMER CONTEXT/);
    assert.match(input[0].content, /Demo Shop/);
    assert.equal(input[1].content, "The invoice failed");
  });

  it("attaches a screenshot as vision content", () => {
    const input = buildInput("Invoice failed", [], {
      dataUrl: "data:image/jpeg;base64,abc",
    });

    assert.equal(input[1].role, "user");
    assert.equal(input[1].content[0].type, "text");
    assert.equal(input[1].content[0].text, "Invoice failed");
    assert.equal(input[1].content[1].type, "image_url");
    assert.equal(input[1].content[1].image_url.url, "data:image/jpeg;base64,abc");
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
  it("returns the model text from a successful Groq chat completion", async () => {
    const result = await generateReply({
      message: "Hello, what services do you offer?",
      client: fakeClient(async () =>
        completion("We help customers with the company's products and services.")
      ),
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /products and services/);
  });

  it("returns a fallback when the model response is empty", async () => {
    const result = await generateReply({
      message: "Hello",
      client: fakeClient(async () => completion("   ")),
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

  it("returns a fallback on insufficient quota without throwing", async () => {
    const result = await generateReply({
      message: "Hello",
      client: fakeClient(async () => {
        const error = new Error("You exceeded your current quota");
        error.status = 429;
        error.code = "insufficient_quota";
        throw error;
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "insufficient_quota");
  });

  it("sends the client record inside the system prompt", async () => {
    let systemContent = "";
    const result = await generateReply({
      message: "The invoice failed",
      clientContext: "CUSTOMER CONTEXT\n- Company: Demo Shop",
      client: fakeClient(async (payload) => {
        systemContent = payload.messages[0].content;
        return completion("I can see Demo Shop uses Ishyiga. Let's check the invoice.");
      }),
    });

    assert.equal(result.ok, true);
    assert.match(systemContent, /Ishyiga Software/i);
    assert.match(systemContent, /Demo Shop/);
  });

  it("sends screenshots to the vision model", async () => {
    let usedModel = null;
    const result = await generateReply({
      message: "[Screenshot]",
      image: { dataUrl: "data:image/jpeg;base64,abc" },
      client: fakeClient(async (payload) => {
        usedModel = payload.model;
        assert.equal(payload.messages[1].content[1].type, "image_url");
        return completion("I can see an invoice error on the screen.");
      }),
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /invoice error/);
    assert.equal(usedModel, "qwen/qwen3.6-27b");
  });

  it("rejects a missing message", async () => {
    const result = await generateReply({ message: "   " });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "Missing message");
  });
});
