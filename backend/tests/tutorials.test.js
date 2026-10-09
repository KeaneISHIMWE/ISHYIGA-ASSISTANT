const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  matchTutorials,
  formatTutorialContext,
  TUTORIALS,
} = require("../src/guides/tutorials");
const { retrieveGuideContext } = require("../src/guides/chatHandler");

describe("video tutorials", () => {
  it("catalog includes the seven official tutorials", () => {
    assert.equal(TUTORIALS.length, 7);
    assert.ok(TUTORIALS.every((item) => item.url.startsWith("http")));
  });

  it("matches invoice questions to the POS Caisse invoice tutorial", () => {
    const hits = matchTutorials("How do I make an invoice in POS caisse?");
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "pos-caisse-invoice");
    assert.match(hits[0].url, /FxfH40jzBng/);
    assert.ok(hits[0].steps.length >= 5);
  });

  it("matches refund questions to the POS Mini refund short", () => {
    const hits = matchTutorials("How can I make a refund in POS Mini?");
    assert.ok(hits.some((item) => item.id === "pos-mini-refund"));
  });

  it("formats tutorial context with YouTube link and steps", () => {
    const hits = matchTutorials("create invoice sales caisse");
    const block = formatTutorialContext(hits);
    assert.match(block, /MATCHED VIDEO TUTORIALS/);
    assert.match(block, /youtu\.be\/FxfH40jzBng/);
    assert.match(block, /Approved steps/);
    assert.match(block, /Sales button/);
  });

  it("attaches matched tutorials into guide context", () => {
    const { guideContext, tutorials } = retrieveGuideContext(
      "How to add a new item in POS Mini"
    );
    assert.ok(tutorials.some((item) => item.id === "pos-mini-add-item"));
    assert.match(guideContext, /MATCHED VIDEO TUTORIALS/);
    assert.match(guideContext, /VhPoQGZxctI/);
  });
});
