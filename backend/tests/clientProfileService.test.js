const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeClientProfile,
  formatClientContext,
  buildClientsLookupUrl,
  fetchClientProfile,
  loadClientPromptContext,
  clearClientProfileCache,
  toCarePhone,
} = require("../src/services/clientProfileService");
const { env } = require("../src/config/env");

describe("toCarePhone", () => {
  it("converts WhatsApp international numbers to the documented local format", () => {
    assert.equal(toCarePhone("+250788880066"), "0788880066");
    assert.equal(toCarePhone("250788880066"), "0788880066");
    assert.equal(toCarePhone("0788880066"), "0788880066");
  });
});

describe("buildClientsLookupUrl", () => {
  it("calls the documented Contract endpoint with a local phone query", () => {
    const url = buildClientsLookupUrl("https://ishyiga.rw/care", "+250 788 880 066");

    assert.equal(
      url,
      "https://ishyiga.rw/care/api/vibe-contract/by-phone?phone=0788880066"
    );
  });

  it("does not duplicate the contract path when the full endpoint is configured", () => {
    const url = buildClientsLookupUrl(
      "https://ishyiga.rw/care/api/vibe-contract/by-phone",
      "0788880066"
    );

    assert.equal(
      url,
      "https://ishyiga.rw/care/api/vibe-contract/by-phone?phone=0788880066"
    );
  });

  it("replaces a {phone} placeholder in the path", () => {
    const url = buildClientsLookupUrl(
      "https://ishyiga.rw/care/api/vibe-contract/by-phone/{phone}",
      "250788880066"
    );

    assert.equal(
      url,
      "https://ishyiga.rw/care/api/vibe-contract/by-phone/0788880066"
    );
  });
});

describe("normalizeClientProfile", () => {
  it("keeps only fields returned by the API", () => {
    const profile = normalizeClientProfile(
      {
        data: {
          contract: {
            name: "John Doe",
            customer_id: "12345",
            company: "Kigali Mart",
            account_status: "Active",
            password: "should-not-appear",
          },
        },
      },
      "250788000000"
    );

    assert.equal(profile.name, "John Doe");
    assert.deepEqual(
      profile.fields.map((field) => field.label),
      ["Name", "Customer Id", "Company", "Account Status"]
    );
    assert.equal(
      profile.fields.find((field) => field.label === "Customer Id").value,
      "12345"
    );
  });

  it("returns null when the API body has no usable fields", () => {
    assert.equal(normalizeClientProfile({ password: "x" }, "250700000000"), null);
    assert.equal(normalizeClientProfile({}, "250700000000"), null);
  });

  it("keeps only the CARE record that matches the WhatsApp contact", () => {
    const profile = normalizeClientProfile(
      {
        found: true,
        noRecord: false,
        phoneNormalized: "250788880066",
        resume: { summary: "SLA Status: BREACH (83% Satisfaction)" },
        allowedServices: [
          { code: "POS", name: "Ishyiga POS", version: "10.1.4", included: true },
        ],
        plans: [
          {
            contractType: "STANDARD",
            status: "Activated",
            contractId: "CTR-4130522-2025",
          },
        ],
        client: {
          id: "4130522",
          companyName: "KUPHARMA PHARMACY",
          staffName: "KUBWIMANA ALICE",
          managerName: "KUBWIMANA ALICE",
          managerPhone: "0788880066",
          managerEmail: "kalikumana@gmail.com",
          address: "Kigali, Rwanda",
          phones: ["0788880066", "250788880066"],
        },
        payment: { paymentStatusLabel: "Pending Payment" },
      },
      "250788880066"
    );

    assert.equal(profile.name, "KUBWIMANA ALICE");
    assert.equal(profile.company, "KUPHARMA PHARMACY");
    assert.equal(profile.phoneNumber, "0788880066");
    assert.equal(profile.software, "Ishyiga POS");
    assert.match(profile.plan, /STANDARD/);
    assert.match(
      profile.fields.map((field) => field.value).join("\n"),
      /KUBWIMANA ALICE/
    );
    assert.match(
      profile.fields.map((field) => field.label).join("\n"),
      /Allowed Services/
    );
  });

  it("ignores placeholder CARE records and records for a different contact", () => {
    assert.equal(
      normalizeClientProfile(
        {
          found: false,
          noRecord: true,
          phoneNormalized: "250781111111",
          client: {
            id: "000000",
            companyName: "Unknown Client",
            staffName: "Unknown Client",
            managerPhone: "0781111111",
            phones: ["0781111111"],
          },
        },
        "0781111111"
      ),
      null
    );

    assert.equal(
      normalizeClientProfile(
        {
          found: true,
          phoneNormalized: "250788000000",
          client: {
            id: "4130403",
            companyName: "PHARMACY DOLCEBELLALTD",
            staffName: "JOSEPHINE JOSEPHINE",
            phones: ["0788000000", "250788000000"],
          },
        },
        "0788880066"
      ),
      null
    );
  });
});

describe("formatClientContext", () => {
  it("builds a prompt section from returned fields only", () => {
    const text = formatClientContext({
      name: "John Doe",
      fields: [
        { key: "name", label: "Name", value: "John Doe" },
        { key: "company", label: "Company", value: "Kigali Mart" },
      ],
    });

    assert.match(text, /CUSTOMER CONTEXT/);
    assert.match(text, /KNOWN CUSTOMER/);
    assert.match(text, /John Doe/);
    assert.match(text, /Kigali Mart/);
    assert.match(text, /Never invent information/);
    assert.doesNotMatch(text, /Account Status/);
  });

  it("names the WhatsApp contact used for the CARE lookup", () => {
    const text = formatClientContext({
      name: "KUBWIMANA ALICE",
      company: "KUPHARMA PHARMACY",
      phoneNumber: "0788880066",
      fields: [
        { key: "companyName", label: "Company Name", value: "KUPHARMA PHARMACY" },
      ],
    });

    assert.match(text, /KNOWN CUSTOMER/);
    assert.match(text, /Company name: KUPHARMA PHARMACY/);
    assert.match(text, /WhatsApp contact: 0788880066/);
    assert.match(text, /this contact's record/);
  });
});

describe("fetchClientProfile", () => {
  beforeEach(() => {
    clearClientProfileCache();
  });

  it("skips the lookup when the customer API is not configured", async () => {
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

  it("loads and caches a contract for a normal customer", async () => {
    const previousUrl = env.clientsApiUrl;
    const previousCookie = env.customerApiSessionCookie;
    const previousApiKey = env.clientsApiKey;
    env.clientsApiUrl = "https://ishyiga.rw/care";
    env.customerApiSessionCookie = "care.sid=test-session";
    env.clientsApiKey = "care_sec_test";
    let calls = 0;

    const fetchFn = async (url, options) => {
      calls += 1;
      assert.equal(
        url,
        "https://ishyiga.rw/care/api/vibe-contract/by-phone?phone=0788000000"
      );
      assert.equal(options.headers.Authorization, "Bearer care_sec_test");
      assert.equal(options.headers.Cookie, "care.sid=test-session");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: "John Doe",
          company: "Kigali Mart",
        }),
      };
    };

    try {
      const first = await loadClientPromptContext({
        phoneNumber: "250788000000",
        fetchFn,
        nowFn: () => 1_000,
      });
      const second = await loadClientPromptContext({
        phoneNumber: "+250788000000",
        fetchFn,
        nowFn: () => 2_000,
      });

      assert.equal(calls, 1);
      assert.equal(first.ok, true);
      assert.equal(second.cached, true);
      assert.match(first.clientContext, /John Doe/);
      assert.match(first.clientContext, /Kigali Mart/);
    } finally {
      env.clientsApiUrl = previousUrl;
      env.customerApiSessionCookie = previousCookie;
      env.clientsApiKey = previousApiKey;
    }
  });

  it("marks an unknown CARE number as an unverified contact", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://ishyiga.rw/care";

    try {
      const result = await loadClientPromptContext({
        phoneNumber: "0781111111",
        fetchFn: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            found: false,
            noRecord: true,
            phoneNormalized: "250781111111",
            client: {
              id: "000000",
              companyName: "Unknown Client",
              managerPhone: "0781111111",
              phones: ["0781111111"],
            },
          }),
        }),
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, "not_found");
      assert.match(result.clientContext, /NEW \/ UNVERIFIED CONTACT/);
      assert.match(result.clientContext, /0781111111/);
    } finally {
      env.clientsApiUrl = previous;
    }
  });

  it("treats a CARE placeholder record as not found for that contact", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://ishyiga.rw/care";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "0781111111",
        fetchFn: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            found: false,
            noRecord: true,
            phoneNormalized: "250781111111",
            client: {
              id: "000000",
              companyName: "Unknown Client",
              managerPhone: "0781111111",
              phones: ["0781111111"],
            },
          }),
        }),
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, "not_found");
      assert.equal(result.profile, null);
    } finally {
      env.clientsApiUrl = previous;
    }
  });

  it("returns no profile when the contract is not found", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://ishyiga.rw/care";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "250700000000",
        fetchFn: async () => ({
          ok: false,
          status: 404,
        }),
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, "not_found");
      assert.equal(result.profile, null);
    } finally {
      env.clientsApiUrl = previous;
    }
  });

  it("fails open when the customer API times out", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://ishyiga.rw/care";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "250788000000",
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

  it("fails open when the customer API returns an error", async () => {
    const previous = env.clientsApiUrl;
    env.clientsApiUrl = "https://ishyiga.rw/care";

    try {
      const result = await fetchClientProfile({
        phoneNumber: "250788000000",
        fetchFn: async () => ({
          ok: false,
          status: 500,
        }),
      });

      assert.equal(result.ok, false);
      assert.equal(result.error, "api_error");
      assert.equal(result.profile, null);
    } finally {
      env.clientsApiUrl = previous;
    }
  });
});
