const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateRegistration,
  decideRole,
  validateContribution,
  canEditContribution,
  reviewStatus,
  knowledgeContent,
} = require("../src/services/studioRules");

describe("studio registration rules", () => {
  it("rejects a short password and accepts a contributor by default", () => {
    assert.equal(validateRegistration({ name: "A", email: "a@b.com", password: "short" }), "Name must be at least 2 characters");
    const account = validateRegistration({
      name: "Aline Uwase",
      email: "Aline@Example.com",
      password: "correct-horse",
      phone: "0788000000",
    });
    assert.equal(account.email, "aline@example.com");
    assert.equal(decideRole(0), "ADMIN");
    assert.equal(decideRole(2), "CONTRIBUTOR");
  });
});

describe("studio contributions", () => {
  it("requires the fields for each type", () => {
    assert.equal(validateContribution({ type: "QUESTION_ANSWER", title: "Add customer" }), "Question and answer are required");
    const record = validateContribution({
      type: "QUESTION_ANSWER",
      title: "Add customer",
      question: "How do I create a customer?",
      answer: "Open Customers and choose Add Customer.",
      encountered: "The cashier could not find where to add a customer.",
    });
    assert.equal(record.question, "How do I create a customer?");
  });

  it("lets only the owner revise a pending item", () => {
    const item = { contributor_id: "user-1", status: "PENDING" };
    assert.equal(canEditContribution({ id: "user-1", role: "CONTRIBUTOR" }, item), true);
    assert.equal(canEditContribution({ id: "user-2", role: "CONTRIBUTOR" }, item), false);
    assert.equal(canEditContribution({ id: "user-2", role: "CONTRIBUTOR" }, { ...item, status: "APPROVED" }), false);
    assert.equal(reviewStatus("revision"), "NEEDS_REVISION");
  });

  it("builds traceable knowledge text without inventing fields", () => {
    const text = knowledgeContent({
      question: "POS is offline",
      solution: "Restart the database service.",
    });
    assert.match(text, /POS is offline/);
    assert.match(text, /Restart the database service/);
  });
});
