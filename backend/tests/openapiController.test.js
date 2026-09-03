const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getOpenApi, requestBaseUrl } = require("../src/controllers/openapiController");

describe("openapiController", () => {
  it("uses forwarded host for the live server URL", () => {
    const req = {
      protocol: "http",
      get(name) {
        if (name === "x-forwarded-proto") return "https";
        if (name === "x-forwarded-host") return "ishyiga-assistant-production.up.railway.app";
        return null;
      },
    };
    assert.equal(
      requestBaseUrl(req),
      "https://ishyiga-assistant-production.up.railway.app"
    );
  });

  it("returns an OpenAPI document for the conversation endpoints", () => {
    const res = {
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
    getOpenApi(
      {
        protocol: "https",
        get() {
          return "example.test";
        },
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.openapi, "3.0.3");
    assert.ok(res.body.paths["/api/conversations"]);
    assert.ok(res.body.paths["/api/conversations/by-phone"]);
    assert.ok(res.body.paths["/api/messages"].post);
    assert.ok(res.body.paths["/api/conversations/{conversationId}"]);
    assert.ok(res.body.paths["/api/dashboard"]);
  });
});
