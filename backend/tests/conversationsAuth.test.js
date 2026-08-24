const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { env } = require("../src/config/env");
const {
  requireConversationsAuth,
  readProvidedKey,
} = require("../src/middleware/conversationsAuth");

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("readProvidedKey", () => {
  it("reads a Bearer token or X-Api-Key", () => {
    assert.equal(
      readProvidedKey({
        get(name) {
          return name === "authorization" ? "Bearer secret-key" : "";
        },
      }),
      "secret-key"
    );
    assert.equal(
      readProvidedKey({
        get(name) {
          return name === "x-api-key" ? "header-key" : "";
        },
      }),
      "header-key"
    );
  });
});

describe("requireConversationsAuth", () => {
  it("rejects a missing or wrong key", () => {
    const previous = env.conversationsApiKey;
    env.conversationsApiKey = "correct-key";
    try {
      const missing = mockRes();
      requireConversationsAuth(
        {
          get() {
            return "";
          },
        },
        missing,
        () => {
          throw new Error("should not continue");
        }
      );
      assert.equal(missing.statusCode, 401);

      const wrong = mockRes();
      requireConversationsAuth(
        {
          get(name) {
            return name === "authorization" ? "Bearer other-key" : "";
          },
        },
        wrong,
        () => {
          throw new Error("should not continue");
        }
      );
      assert.equal(wrong.statusCode, 401);
    } finally {
      env.conversationsApiKey = previous;
    }
  });

  it("allows a matching key", () => {
    const previous = env.conversationsApiKey;
    env.conversationsApiKey = "correct-key";
    let nextCalled = false;
    try {
      const res = mockRes();
      requireConversationsAuth(
        {
          get(name) {
            return name === "authorization" ? "Bearer correct-key" : "";
          },
        },
        res,
        () => {
          nextCalled = true;
        }
      );
      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, 200);
    } finally {
      env.conversationsApiKey = previous;
    }
  });

  it("locks the API when no key is configured", () => {
    const previous = env.conversationsApiKey;
    env.conversationsApiKey = "";
    try {
      const res = mockRes();
      requireConversationsAuth(
        {
          get() {
            return "Bearer anything";
          },
        },
        res,
        () => {
          throw new Error("should not continue");
        }
      );
      assert.equal(res.statusCode, 503);
    } finally {
      env.conversationsApiKey = previous;
    }
  });
});
