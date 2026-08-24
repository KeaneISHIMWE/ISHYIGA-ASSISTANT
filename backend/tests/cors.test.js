const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { isPublicReadPath, allowPublicReadCors } = require("../src/middleware/cors");

describe("isPublicReadPath", () => {
  it("allows conversation and dashboard reads", () => {
    assert.equal(isPublicReadPath("/api/conversations"), true);
    assert.equal(isPublicReadPath("/api/conversations/abc"), true);
    assert.equal(isPublicReadPath("/api/dashboard"), true);
    assert.equal(isPublicReadPath("/api/openapi.json"), true);
    assert.equal(isPublicReadPath("/webhook"), false);
    assert.equal(isPublicReadPath("/api/messages"), false);
  });
});

describe("allowPublicReadCors", () => {
  it("adds CORS headers on public GET routes", () => {
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
    };
    let nextCalled = false;
    allowPublicReadCors(
      { path: "/api/conversations", method: "GET" },
      res,
      () => {
        nextCalled = true;
      }
    );
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
    assert.equal(nextCalled, true);
  });

  it("answers OPTIONS without calling the route", () => {
    let ended = false;
    const res = {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      end() {
        ended = true;
        return this;
      },
    };
    allowPublicReadCors({ path: "/api/dashboard", method: "OPTIONS" }, res, () => {
      throw new Error("should not continue");
    });
    assert.equal(res.statusCode, 204);
    assert.equal(ended, true);
  });
});
