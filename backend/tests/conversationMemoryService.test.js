const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  formatConversationMemory,
  formatTranscript,
  seedSummaryFromMessages,
  shouldRefreshSummary,
  compactFallbackSummary,
  summarizeConversation,
  loadConversationSummary,
  maybeRefreshConversationMemory,
  SUMMARY_AFTER_MESSAGES,
} = require("../src/services/conversationMemoryService");

describe("conversation memory helpers", () => {
  it("formats a summary for the AI without inventing details", () => {
    const block = formatConversationMemory(
      "POS is not connecting on all computers. Client restarted the router."
    );

    assert.match(block, /CONVERSATION MEMORY/);
    assert.match(block, /POS is not connecting/);
    assert.match(block, /this client/);
    assert.equal(formatConversationMemory(""), "");
    assert.equal(formatConversationMemory(null), "");
  });

  it("builds a transcript that the model can continue from", () => {
    const transcript = formatTranscript([
      { sender_type: "customer", message: "My POS is not connecting." },
      { sender_type: "assistant", message: "Is it happening on all computers?" },
      { sender_type: "customer", message: "Yes, all of them." },
    ]);

    assert.match(transcript, /Client: My POS is not connecting/);
    assert.match(transcript, /AI: Is it happening on all computers/);
    assert.match(transcript, /Client: Yes, all of them/);
  });

  it("does not refresh short conversations", () => {
    assert.equal(
      shouldRefreshSummary({
        messageCount: 4,
        messagesSinceSummary: 4,
        hasSummary: false,
      }),
      false
    );
    assert.equal(
      shouldRefreshSummary({
        messageCount: SUMMARY_AFTER_MESSAGES + 1,
        messagesSinceSummary: 1,
        hasSummary: false,
      }),
      true
    );
    assert.equal(
      shouldRefreshSummary({
        messageCount: 30,
        messagesSinceSummary: 2,
        hasSummary: true,
      }),
      false
    );
    assert.equal(
      shouldRefreshSummary({
        messageCount: 30,
        messagesSinceSummary: 8,
        hasSummary: true,
      }),
      true
    );
  });

  it("falls back to stored facts when the summarizer is unavailable", async () => {
    const summary = await summarizeConversation({
      existingSummary: "POS connection issue.",
      olderMessages: [
        { sender_type: "customer", message: "I restarted the router." },
      ],
      client: {
        chat: {
          completions: {
            create: async () => {
              throw new Error("OpenAI unavailable");
            },
          },
        },
      },
    });

    assert.match(summary, /POS connection issue/);
    assert.match(
      compactFallbackSummary("", [
        { sender_type: "customer", message: "Error 500" },
      ]),
      /Error 500/
    );
    assert.match(
      seedSummaryFromMessages([
        { sender_type: "customer", message: "Need help with stock." },
      ]),
      /Need help with stock/
    );
  });

  it("loads an empty summary when the database is unavailable", async () => {
    const summary = await loadConversationSummary(
      "11111111-1111-4111-8111-111111111111",
      {
      findConversation: async () => {
        throw new Error("db down");
      },
    });

    assert.equal(summary, "");
  });

  it("updates a long conversation summary from older messages", async () => {
    const older = Array.from({ length: 20 }, (_, index) => ({
      sender_type: index % 2 === 0 ? "customer" : "assistant",
      message: `older ${index + 1}`,
    }));
    const recent = Array.from({ length: 16 }, (_, index) => ({
      sender_type: index % 2 === 0 ? "customer" : "assistant",
      message: `recent ${index + 1}`,
    }));
    let saved = "";

    const summary = await maybeRefreshConversationMemory(
      {
        conversationId: "11111111-1111-4111-8111-111111111111",
        currentMessage: "It still shows the error.",
        assistantReply: "Let's check the database service.",
      },
      {
        findConversation: async () => ({ id: "conv-1", summary: "" }),
        countMessages: async () => 36,
        countAfter: async () => 36,
        listMessages: async () => [...older, ...recent],
        saveSummary: async (_id, text) => {
          saved = text;
          return { summary: text };
        },
        summarizeFn: async ({ olderMessages }) => {
          assert.match(formatTranscript(olderMessages), /older 1/);
          assert.doesNotMatch(formatTranscript(olderMessages), /recent 1/);
          return "Client has a long POS outage. Router restart did not help.";
        },
      }
    );

    assert.equal(
      summary,
      "Client has a long POS outage. Router restart did not help."
    );
    assert.equal(saved, summary);
  });
});
