const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeClientProfile,
  formatClientContext,
  buildClientsLookupUrl,
  fetchClientProfile,
  loadClientPromptContext,
  clearClientProfileCache,
} = require("../src/services/clientProfileService");
const { env } = require("../src/config/env");

describe("buildClientsLookupUrl", () => {
  it("adds the phone query when the URL has no placeholder", () => {
    const url = buildClientsLookupUrl(
      "https://clients.ishyiga.rw/api/clients",
      "+250 788 880 066"
    );

    assert.equal(
      url,
      "https://clients.ishyiga.rw/api/clients?phone=250788880066"
    );
  });

  it("replaces a {phone} placeholder in the path", () => {
    const url = buildClientsLookupUrl(
      "https://clients.ishyiga.rw/api/clients/{phone}",
      "250788880066"
    );

    assert.equal(url, "https://clients.ishyiga.rw/api/clients/250788880066");
  });
});

describe("normalizeClientProfile", () => {
  it("reads common aliases and wrapped payloads", () => {
    const profile = normalizeClientProfile(
      {
        data: {
          client: {
            full_name: "Jean Uwimana",
            business_name: "Kigali Mart",
            tin_number: "102345678",
            app_version: "4.2.1",
            city: "Kigali",
          },
        },
      },
      "250788880066"
    );

    assert.deepEqual(profile, {
      name: "Jean Uwimana",
      company: "Kigali Mart",
      tin: "102345678",
      software: "",
      version: "4.2.1",
      plan: "",
      location: "Kigali",
      email: "",
      notes: "",
    });
  });

  it("returns null when no useful fields exist", () => {
    assert.equal(normalizeClientProfile({ id: 12 }, "250700000000"), null);
  });
});

describe("formatClientContext", () => {
  it("builds a prompt section from known fields only", () => {
    const text = formatClientContext({
      name: "Jean Uwimana",
      company: "Kigali Mart",
      tin: "102345678",
      software: "",
      version: "4.2.1",
      plan: "",
      location: "Kigali",
      email: "",
      notes: "",
    });

    assert.match(text, /CURRENT CLIENT RECORD/);
    assert.match(text, /Jean Uwimana/);
    assert.match(text, /Kigali Mart/);
    assert.match(text, /4\.2\.1/);
    assert.doesNotMatch(text, /Plan:/);
  });
});

describe("fetchClientProfile", () => {
  beforeEach(() => {
    clearClientProfileCache();
  });

  it("skips the lookup when the client API is not configured", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "250788880066",
        fetchFn: async () => {
          throw new Error("should not fetch");
        },
      });

      assert.equal(result.skipped, true);
      assert.equal(result.error, "not_configured");
      assert.equal(result.profile, null);
    } finally {
      env.clientsApiUrl = previous;
    }
  });

  it("loads and caches a client record", async () => {
    const previousUrl = env.clientsApiUrl;
    const previousKey = env.clientsApiKey;
    env.clientsApiUrl = "https://clients.ishyiga.rw/api/clients";
    env.clientsApiKey = "test-key";
    let calls = 0;

    const fetchFn = async (url, options) => {
      calls += 1;
      assert.equal(url, "https://clients.ishyiga.rw/api/clients?phone=250788880066");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "Jean Uwimana",
          company: "Kigali Mart",
        }),
      };
    };

    try {
      const first = await loadClientPromptContext({
        phoneNumber: "250788880066",
        fetchFn,
        nowFn: () => 1_000,
      });
      const second = await loadClientPromptContext({
        phoneNumber: "250788880066",
        fetchFn,
        nowFn: () => 2_000,
      });

      assert.equal(calls, 1);
      assert.equal(first.ok, true);
      assert.equal(second.cached, true);
      assert.match(first.clientContext, /Kigali Mart/);
    } finally {
      env.clientsApiUrl = previousUrl;
      env.clientsApiKey = previousKey;
    }
  });

  it("fails open when the client API times out", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://clients.ishyiga.rw/api/clients";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "250788880066",
        fetchFn: async () => {
          const error = new Error("aborted");
          error.name = "TimeoutError";
          throw error;
        },
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, "timeout");
      assert.equal(result.profile, null);
    } finally {
      env.clientsApiUrl = previous;
    }
  });
});
