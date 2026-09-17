const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { listSupport, getSupport } = require("../src/controllers/supportController");

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

describe("supportController", () => {
  it("lists support records and applies client filters", async () => {
    const res = mockRes();
    await listSupport(
      { query: { client: "TRUSTED", agent: "lucie" } },
      res,
      {
        list: async (filters) => {
          assert.equal(filters.client, "TRUSTED");
          assert.equal(filters.agent, "lucie");
          return [
            {
              id: "11111111-1111-1111-1111-111111111111",
              source_row: 0,
              client_name: "TRUSTED PHARMACY LIMITED",
              support_agent: "Uwimanikunda lucie",
              location: "KIREHE",
              sector: "PHARMACY",
              visit_at: new Date("2026-09-16T13:57:00.000Z"),
              branches: 0,
              status: "Done",
              approval: "needs_approval",
              active: true,
              contact: "250781065084",
              created_at: new Date("2026-09-16T13:57:00.000Z"),
              updated_at: new Date("2026-09-16T13:57:00.000Z"),
            },
          ];
        },
      }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.count, 1);
    assert.equal(res.body.support[0].clientName, "TRUSTED PHARMACY LIMITED");
    assert.equal(res.body.support[0].active, true);
  });

  it("rejects an invalid support id", async () => {
    const res = mockRes();
    await getSupport({ params: { id: "not-a-uuid" } }, res, {
      findById: async () => {
        throw new Error("should not query");
      },
    });
    assert.equal(res.statusCode, 400);
  });
});
