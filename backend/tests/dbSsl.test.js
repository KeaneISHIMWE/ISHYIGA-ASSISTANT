const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { resolvePoolSsl } = require("../src/config/dbSsl");

describe("resolvePoolSsl", () => {
  it("leaves local Docker URLs without SSL", () => {
    assert.equal(
      resolvePoolSsl("postgresql://ishyiga:ishyiga@localhost:5432/ishyiga", "development"),
      undefined
    );
  });

  it("enables SSL in production", () => {
    assert.deepEqual(
      resolvePoolSsl("postgresql://user:pass@db.example.com/ishyiga", "production"),
      { rejectUnauthorized: true }
    );
  });

  it("enables SSL for Neon URLs", () => {
    assert.deepEqual(
      resolvePoolSsl(
        "postgresql://user:pass@ep-example.eu-central-1.aws.neon.tech/neondb?sslmode=require",
        "development"
      ),
      { rejectUnauthorized: true }
    );
  });

  it("honors sslmode=disable even in production", () => {
    assert.equal(
      resolvePoolSsl(
        "postgresql://ishyiga:ishyiga@localhost:5432/ishyiga?sslmode=disable",
        "production"
      ),
      false
    );
  });
});
