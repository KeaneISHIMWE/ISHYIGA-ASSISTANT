const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { loadGuideFiles } = require("../src/guides/loader");
const { chunkDocuments } = require("../src/guides/chunker");
const { buildIndex, retrieveChunks } = require("../src/guides/retriever");
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

  it("offers human support when nothing is in the guides", () => {
    assert.match(noGuideMatchReply("en"), /human support/i);
  });
});
