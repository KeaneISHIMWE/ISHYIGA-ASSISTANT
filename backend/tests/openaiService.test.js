const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  generateReply,
  buildInput,
  classifyOpenAIError,
  FALLBACK_REPLY,
  ESCALATION_REPLY,
  resolveFailedCustomerReply,
  resolveCustomerFacingFailure,
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
    const history = Array.from({ length: 50 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn ${index + 1}`,
    }));
    const input = buildInput("Hello", history);

    assert.equal(input.length, 42);
    assert.equal(input[1].content, "turn 11");
    assert.equal(input[40].content, "turn 50");
    assert.equal(input[41].content, "Hello");
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
    assert.match(SYSTEM_PROMPT, /technical issue/);
    assert.match(SYSTEM_PROMPT, /30 minutes/);
    assert.match(SYSTEM_PROMPT, /GUIDE CONTEXT/);
    assert.match(SYSTEM_PROMPT, /Never invent features, menus, buttons, prices/);
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

  it("appends conversation memory and customer context to the system prompt", () => {
    const input = buildInput(
      "Yes, it still shows the error.",
      [
        { role: "user", content: "I restarted the router." },
        { role: "assistant", content: "Is the POS still showing the error?" },
      ],
      null,
      "CUSTOMER CONTEXT\n- Company: Demo Shop",
      "POS is not connecting on all computers."
    );

    assert.match(input[0].content, /CUSTOMER CONTEXT/);
    assert.match(input[0].content, /CONVERSATION MEMORY/);
    assert.match(input[0].content, /POS is not connecting/);
    assert.equal(input[1].content, "I restarted the router.");
    assert.equal(input[3].content, "Yes, it still shows the error.");
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
    assert.equal(
      classifyOpenAIError({
        status: 429,
        code: "credit_balance_exhausted",
        message: "You have no credits remaining",
      }),
      "insufficient_quota"
    );
  });

  it("classifies other API errors", () => {
    assert.equal(classifyOpenAIError({ status: 500 }), "api_error");
  });

  it("classifies context length errors", () => {
    assert.equal(
      classifyOpenAIError({
        status: 400,
        message: "This model's maximum context length was exceeded",
      }),
      "context_length"
    );
  });

  it("classifies reasoning extras errors", () => {
    assert.equal(
      classifyOpenAIError({
        status: 400,
        message:
          "Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions",
      }),
      "extras_unsupported"
    );
    assert.equal(
      classifyOpenAIError({
        status: 400,
        message:
          "Unsupported parameter: 'reasoning.effort' is not supported with this model.",
      }),
      "extras_unsupported"
    );
  });
});

describe("generateReply", () => {
  it("returns the model text from a successful OpenAI chat completion", async () => {
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

  it("reads reply text from array content parts", async () => {
    const result = await generateReply({
      message: "How do I add a customer?",
      client: fakeClient(async () => ({
        choices: [
          {
            message: {
              content: [{ type: "text", text: "Open Customers, then tap Add." }],
            },
          },
        ],
      })),
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /Open Customers/);
  });

  it("reads output_text from the responses API", async () => {
    const result = await generateReply({
      message: "The invoice failed to post",
      client: {
        responses: {
          create: async () => ({
            output_text: "Check the POS network cable and try again.",
          }),
        },
        chat: {
          completions: {
            create: async () => {
              throw new Error("chat completions should not run");
            },
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /network cable/);
  });

  it("falls back to chat completions when responses rejects extras", async () => {
    const result = await generateReply({
      message: "can i see my balance ?",
      client: {
        responses: {
          create: async () => {
            const error = new Error(
              "400 Unsupported parameter: 'reasoning.effort' is not supported with this model."
            );
            error.status = 400;
            throw error;
          },
        },
        chat: {
          completions: {
            create: async () =>
              completion(
                "I cannot see live balances from WhatsApp. Open Reports, then Balance."
              ),
          },
        },
      },
    });

    assert.equal(result.ok, true);
    assert.match(result.reply, /Reports/);
  });

  it("retries a plain completion when reasoning extras are rejected", async () => {
    let calls = 0;
    const result = await generateReply({
      message: "The invoice failed to post",
      history: [
        { role: "user", content: "POS is down" },
        { role: "assistant", content: "Which computer?" },
      ],
      client: fakeClient(async (payload) => {
        calls += 1;
        if (payload.reasoning_effort || payload.max_completion_tokens) {
          const error = new Error(
            "400 Function tools with reasoning_effort are not supported for gpt-5.6-sol in /v1/chat/completions"
          );
          error.status = 400;
          throw error;
        }

        return completion("Check the network cable on the POS.");
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(result.reply, /network cable/);
  });

  it("retries without history after a context error", async () => {
    let calls = 0;
    const result = await generateReply({
      message: "What services do you offer?",
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: FALLBACK_REPLY },
      ],
      client: fakeClient(async (payload) => {
        calls += 1;
        if (calls === 1) {
          assert.ok(payload.messages.length > 2);
          const error = new Error("This model's maximum context length was exceeded");
          error.status = 400;
          throw error;
        }

        assert.equal(payload.messages.length, 2);
        return completion("We can help with the company's services.");
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.match(result.reply, /services/);
  });

  it("sends a technical-issue reply when OpenAI fails", async () => {
    const result = await generateReply({
      message: "The invoice failed to post",
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
    assert.equal(typeof usedModel, "string");
    assert.ok(usedModel.length > 0);
  });

  it("rejects a missing message", async () => {
    const result = await generateReply({ message: "   " });

    assert.equal(result.ok, false);
    assert.equal(result.reply, FALLBACK_REPLY);
    assert.equal(result.error, "Missing message");
  });
});

describe("resolveFailedCustomerReply", () => {
  it("returns the technical-issue reply", () => {
    assert.equal(resolveFailedCustomerReply([], FALLBACK_REPLY), FALLBACK_REPLY);
    assert.equal(
      resolveFailedCustomerReply(
        [{ role: "assistant", content: FALLBACK_REPLY }],
        FALLBACK_REPLY
      ),
      FALLBACK_REPLY
    );
  });

  it("keeps the technical-issue reply after repeated failures", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: FALLBACK_REPLY },
      { role: "user", content: "hello" },
      { role: "assistant", content: FALLBACK_REPLY },
      { role: "user", content: "good morning" },
    ];

    assert.equal(
      resolveFailedCustomerReply(history, FALLBACK_REPLY),
      FALLBACK_REPLY
    );
  });

  it("keeps the technical-issue reply after an earlier escalation", () => {
    const history = [
      { role: "assistant", content: FALLBACK_REPLY },
      { role: "assistant", content: ESCALATION_REPLY },
    ];

    assert.equal(
      resolveFailedCustomerReply(history, FALLBACK_REPLY),
      FALLBACK_REPLY
    );
  });

  it("uses the technical-issue reply for greetings when the model fails", () => {
    assert.equal(
      resolveCustomerFacingFailure({
        message: "good morning",
        history: [],
      }),
      FALLBACK_REPLY
    );
  });
});
