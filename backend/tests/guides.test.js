const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { loadGuideFiles } = require("../src/guides/loader");
const { chunkDocuments } = require("../src/guides/chunker");
const {
  buildIndex,
  retrieveChunks,
  retrieveByEmbedding,
} = require("../src/guides/retriever");
const {
  formatGuideContext,
  noGuideMatchReply,
} = require("../src/guides/promptBuilder");

const GUIDE_DIR = path.join(__dirname, "../guide");

describe("guide retrieval", () => {
  it("loads and chunks the PDFs in backend/guide", async () => {
    const documents = await loadGuideFiles(GUIDE_DIR);
    assert.ok(documents.length >= 1);
    assert.ok(documents.every((doc) => doc.text.length > 50));
    const chunks = chunkDocuments(documents);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].fileName);
    assert.ok(chunks[0].sectionTitle);
  });

  it("retrieves POS guidance for a stock question", async () => {
    const documents = await loadGuideFiles(GUIDE_DIR);
    const index = buildIndex(chunkDocuments(documents));
    const hits = retrieveChunks(index, "How do I check stock in POS?", {
      limit: 6,
      minScore: 0.5,
    });
    assert.ok(hits.length >= 1);
    assert.ok(hits.length <= 6);
  });

  it("returns no chunks for an unrelated question", async () => {
    const index = buildIndex(
      chunkDocuments([
        {
          fileName: "POS.pdf",
          text: "## STOCK\nCheck stock from the Inventory menu.",
        },
      ])
    );
    const hits = retrieveChunks(index, "how do I fly a plane", {
      minScore: 1.2,
    });
    assert.equal(hits.length, 0);
  });

  it("labels retrieved chunks for the model", () => {
    const context = formatGuideContext([
      {
        fileName: "ISHYIGA POS GUIDE FOR USERS.pdf",
        sectionTitle: "STOCK",
        text: "Open Inventory then Stock.",
      },
    ]);
    assert.match(context, /^GUIDE CONTEXT:/);
    assert.match(context, /ISHYIGA POS GUIDE FOR USERS\.pdf — STOCK/);
  });

  it("retrieves the closest guide section by embedding", () => {
    const index = {
      chunks: [
        { fileName: "POS.pdf", sectionTitle: "STOCK", text: "Check stock." },
        { fileName: "POS.pdf", sectionTitle: "LOGIN", text: "Enter password." },
      ],
      embeddings: [
        [1, 0],
        [0, 1],
      ],
    };
    const hits = retrieveByEmbedding(index, [0.95, 0.05], {
      limit: 6,
      minScore: 0.32,
    });
    assert.equal(hits[0].sectionTitle, "STOCK");
    assert.ok(hits.length <= 6);
  });

  it("returns no embedding matches when the question is unrelated", () => {
    const index = {
      chunks: [{ fileName: "POS.pdf", sectionTitle: "STOCK", text: "Check stock." }],
      embeddings: [[1, 0]],
    };
    const hits = retrieveByEmbedding(index, [0, 1], { minScore: 0.32 });
    assert.equal(hits.length, 0);
  });

  it("says the guide has no answer without promising a person", () => {
    assert.match(noGuideMatchReply("en"), /Ishyiga support guides/);
    assert.doesNotMatch(noGuideMatchReply("en"), /human support/i);
    assert.doesNotMatch(noGuideMatchReply("fr"), /support humain/i);
  });
});
