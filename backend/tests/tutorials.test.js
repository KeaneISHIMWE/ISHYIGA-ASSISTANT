const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  matchTutorials,
  formatTutorialContext,
  TUTORIALS,
} = require("../src/guides/tutorials");
const { retrieveGuideContext } = require("../src/guides/chatHandler");

describe("video tutorials", () => {
  it("catalog includes official tutorials with YouTube URLs", () => {
    assert.ok(TUTORIALS.length >= 32);
    assert.ok(TUTORIALS.every((item) => item.url.startsWith("http")));
    assert.ok(
      TUTORIALS.some((item) => item.id === "erp-manchester-order-invoice")
    );
    assert.ok(TUTORIALS.some((item) => item.id === "erp-software-overview"));
    assert.ok(TUTORIALS.some((item) => item.id === "pos-make-proforma-report"));
    assert.ok(TUTORIALS.some((item) => item.id === "erp-global-item-purchase-report"));
    assert.ok(TUTORIALS.some((item) => item.id === "umusada-guide"));
    assert.ok(TUTORIALS.some((item) => item.id === "erp-plu-report"));
  });

  it("matches Manchester order questions to the Manchester tutorial", () => {
    const hits = matchTutorials(
      "How do I make an order in Ishyiga Manchester and transform it into an invoice?"
    );
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "erp-manchester-order-invoice");
    assert.match(hits[0].url, /GMuTfTH02kg/);
    assert.ok(hits[0].steps.length >= 10);
  });

  it("matches POS X/Z report without replacing it with ERP X report", () => {
    const hits = matchTutorials("How do I view the X and Z report in Ishyiga POS?");
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "pos-x-z-report");
    assert.match(hits[0].url, /zaWdEwZlkO4/);
  });

  it("matches make proforma and viewing proforma report in Ishyiga POS", () => {
    const hits = matchTutorials(
      "How do I make proforma pos and viewing proforma report?"
    );
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "pos-make-proforma-report");
    assert.match(hits[0].url, /_nd9g8cEIY0/);
  });

  it("matches Global Item Purchase Report in ERP", () => {
    const hits = matchTutorials(
      "How do I open Global Item Purchases in Ishyiga ERP MAIN GATE?"
    );
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "erp-global-item-purchase-report");
  });

  it("matches Umusada guide questions", () => {
    const hits = matchTutorials("How do I login on umusada.com and request loan?");
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "umusada-guide");
    assert.match(hits[0].url, /8PfqLUtEOmU/);
  });

  it("matches PLU report in ERP without replacing POS PLU", () => {
    const hits = matchTutorials("How do I view PLU report in Ishyiga ERP?");
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].id, "erp-plu-report");
    assert.match(hits[0].url, /BytUjjC1suI/);
  });

  it("does not replace POS Caisse invoice with Manchester for a caisse invoice question", () => {
    const hits = matchTutorials("How do I make an invoice in POS caisse?");
    assert.equal(hits[0].id, "pos-caisse-invoice");
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

  it("attaches matched tutorials into guide context", async () => {
    const { guideContext, tutorials } = await retrieveGuideContext(
      "How to add a new item in POS Mini"
    );
    assert.ok(tutorials.some((item) => item.id === "pos-mini-add-item"));
    assert.match(guideContext, /MATCHED VIDEO TUTORIALS/);
    assert.match(guideContext, /VhPoQGZxctI/);
  });
});
