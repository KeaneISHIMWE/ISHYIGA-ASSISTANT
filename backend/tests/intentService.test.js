const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  INTENTS,
  classifyIntent,
  conversationalFallback,
  isSupportCapableIntent,
} = require("../src/services/intentService");

describe("classifyIntent", () => {
  it("classifies greetings and small talk without support", () => {
    assert.equal(classifyIntent("Hello"), INTENTS.GREETING);
    assert.equal(classifyIntent("Muraho"), INTENTS.GREETING);
    assert.equal(classifyIntent("Amakuru yawe?"), INTENTS.GENERAL_CONVERSATION);
    assert.equal(classifyIntent("Umeze neza?"), INTENTS.GENERAL_CONVERSATION);
    assert.equal(isSupportCapableIntent(classifyIntent("Hello")), false);
    assert.equal(isSupportCapableIntent(classifyIntent("Umeze neza?")), false);
  });

  it("classifies how-to questions as information, not tickets", () => {
    assert.equal(classifyIntent("How do I print a receipt?"), INTENTS.INFORMATION_REQUEST);
    assert.equal(
      classifyIntent("Where can I see customer contacts?"),
      INTENTS.INFORMATION_REQUEST
    );
    assert.equal(isSupportCapableIntent(classifyIntent("How do I print a receipt?")), false);
  });

  it("classifies a POS question as a technical issue, not an automatic ticket", () => {
    assert.equal(
      classifyIntent("I have an issue with my POS"),
      INTENTS.TECHNICAL_ISSUE
    );
    assert.equal(classifyIntent("My POS is slow."), INTENTS.TECHNICAL_ISSUE);
    assert.equal(isSupportCapableIntent(classifyIntent("My POS is slow.")), false);
  });

  it("classifies actions the AI cannot perform as escalation intents", () => {
    assert.equal(
      classifyIntent("I want to add a new customer contact."),
      INTENTS.REGISTRATION_REQUEST
    );
    assert.equal(
      classifyIntent(
        "My POS configuration needs to be changed, but I don't have access to do it."
      ),
      INTENTS.SUPPORT_REQUEST
    );
  });

  it("classifies an explicit technician request as support", () => {
    assert.equal(
      classifyIntent(
        "My POS is completely not working and I need someone to check it."
      ),
      INTENTS.SUPPORT_REQUEST
    );
  });
});

describe("conversationalFallback", () => {
  it("answers in the customer's language", () => {
    assert.match(conversationalFallback("Hello"), /Hello/);
    assert.match(conversationalFallback("Muraho"), /Muraho/);
    assert.match(conversationalFallback("Amakuru yawe?"), /Ni meza neza/);
    assert.match(conversationalFallback("Umeze neza?"), /Yego, meze neza/);
  });
});
