const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { maskPhoneNumber } = require("./whatsappService");

const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const FIELD_ALIASES = {
  name: ["name", "full_name", "fullName", "client_name", "customer_name", "contact_name"],
  company: ["company", "company_name", "business_name", "businessName", "organisation", "organization"],
  tin: ["tin", "tin_number", "vat", "tax_id", "taxId"],
  software: ["software", "product", "application", "app_name"],
  version: ["version", "software_version", "softwareVersion", "app_version", "appVersion"],
  plan: ["plan", "subscription", "package", "license"],
  location: ["location", "city", "district", "address", "branch"],
  email: ["email", "contact_email"],
  notes: ["notes", "support_notes", "remarks", "comment"],
};

const profileCache = new Map();

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function pickFirstString(source, aliases) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const key of aliases) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    return unwrapPayload(payload.data) || payload.data;
  }

  if (payload.client && typeof payload.client === "object") {
    return payload.client;
  }

  if (payload.customer && typeof payload.customer === "object") {
    return payload.customer;
  }

  if (payload.profile && typeof payload.profile === "object") {
    return payload.profile;
  }

  return payload;
}

function normalizeClientProfile(raw, phoneNumber) {
  let source = raw;

  if (Array.isArray(raw)) {
    const digits = digitsOnly(phoneNumber);
    source =
      raw.find((item) => {
        const itemPhone = pickFirstString(item || {}, [
          "phone",
          "whatsapp",
          "whatsapp_number",
          "whatsappNumber",
          "mobile",
        ]);
        return itemPhone && digitsOnly(itemPhone) === digits;
      }) || raw[0];
  }

  source = unwrapPayload(source);
  if (!source) {
    return null;
  }

  const profile = {
    name: pickFirstString(source, FIELD_ALIASES.name),
    company: pickFirstString(source, FIELD_ALIASES.company),
    tin: pickFirstString(source, FIELD_ALIASES.tin),
    software: pickFirstString(source, FIELD_ALIASES.software),
    version: pickFirstString(source, FIELD_ALIASES.version),
    plan: pickFirstString(source, FIELD_ALIASES.plan),
    location: pickFirstString(source, FIELD_ALIASES.location),
    email: pickFirstString(source, FIELD_ALIASES.email),
    notes: pickFirstString(source, FIELD_ALIASES.notes),
  };

  const hasValue = Object.values(profile).some(Boolean);
  return hasValue ? profile : null;
}

function formatClientContext(profile) {
  if (!profile) {
    return "";
  }

  const rows = [
    ["Name", profile.name],
    ["Company", profile.company],
    ["TIN", profile.tin],
    ["Software", profile.software],
    ["Version", profile.version],
    ["Plan", profile.plan],
    ["Location", profile.location],
    ["Email", profile.email],
    ["Support notes", profile.notes],
  ].filter(([, value]) => value);

  if (rows.length === 0) {
    return "";
  }

  const facts = rows.map(([label, value]) => `- ${label}: ${value}`).join("\n");

  return `## CURRENT CLIENT RECORD

The following information was loaded from the Ishyiga client database for this WhatsApp number.
Use it to personalize support. Do not invent extra client facts.
If a field is missing, ask the client instead of guessing.

${facts}`;
}

function buildClientsLookupUrl(baseUrl, phoneNumber) {
  const digits = digitsOnly(phoneNumber);
  if (!baseUrl || !digits) {
    return null;
  }

  if (baseUrl.includes("{phone}")) {
    return baseUrl.replaceAll("{phone}", encodeURIComponent(digits));
  }

  const url = new URL(baseUrl);
  url.searchParams.set("phone", digits);
  return url.toString();
}

function readCache(phoneNumber, nowFn) {
  const key = digitsOnly(phoneNumber);
  const entry = profileCache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= nowFn()) {
    profileCache.delete(key);
    return null;
  }

  return entry.profile;
}

function writeCache(phoneNumber, profile, nowFn) {
  const key = digitsOnly(phoneNumber);
  if (!key) {
    return;
  }

  profileCache.set(key, {
    profile,
    expiresAt: nowFn() + CACHE_TTL_MS,
  });
}

function clearClientProfileCache() {
  profileCache.clear();
}

async function fetchClientProfile({
  phoneNumber,
  fetchFn = fetch,
  nowFn = Date.now,
} = {}) {
  const digits = digitsOnly(phoneNumber);
  if (!digits) {
    return { ok: false, skipped: true, profile: null, error: "missing_phone" };
  }

  if (!env.clientsApiUrl) {
    return { ok: false, skipped: true, profile: null, error: "not_configured" };
  }

  const cached = readCache(digits, nowFn);
  if (cached !== null || profileCache.has(digits)) {
    return { ok: Boolean(cached), skipped: false, cached: true, profile: cached };
  }

  const lookupUrl = buildClientsLookupUrl(env.clientsApiUrl, digits);
  if (!lookupUrl) {
    return { ok: false, skipped: true, profile: null, error: "invalid_url" };
  }

  const headers = { Accept: "application/json" };
  if (env.clientsApiKey) {
    headers.Authorization = `Bearer ${env.clientsApiKey}`;
  }

  try {
    const response = await fetchFn(lookupUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(env.clientsApiTimeoutMs || DEFAULT_TIMEOUT_MS),
    });

    if (response.status === 404) {
      writeCache(digits, null, nowFn);
      logger.info("Client profile not found", {
        customer: maskPhoneNumber(digits),
      });
      return { ok: false, skipped: false, profile: null, error: "not_found" };
    }

    if (!response.ok) {
      logger.error("Client profile lookup failed", {
        customer: maskPhoneNumber(digits),
        status: response.status,
      });
      return { ok: false, skipped: false, profile: null, error: "api_error" };
    }

    const payload = await response.json();
    const profile = normalizeClientProfile(payload, digits);
    writeCache(digits, profile, nowFn);

    logger.info("Client profile loaded", {
      customer: maskPhoneNumber(digits),
      found: Boolean(profile),
    });

    return { ok: Boolean(profile), skipped: false, profile, error: profile ? null : "empty" };
  } catch (error) {
    const timedOut =
      error && (error.name === "TimeoutError" || error.name === "AbortError");
    logger.error("Client profile lookup failed", {
      customer: maskPhoneNumber(digits),
      reason: timedOut ? "timeout" : "unhandled",
    });
    return {
      ok: false,
      skipped: false,
      profile: null,
      error: timedOut ? "timeout" : "unhandled",
    };
  }
}

async function loadClientPromptContext(input = {}, deps = {}) {
  const phoneNumber =
    typeof input === "string" ? input : input.phoneNumber;
  const result = await fetchClientProfile({
    ...deps,
    ...(typeof input === "object" ? input : {}),
    phoneNumber,
  });
  return {
    ...result,
    clientContext: result.profile ? formatClientContext(result.profile) : "",
  };
}

module.exports = {
  fetchClientProfile,
  loadClientPromptContext,
  normalizeClientProfile,
  formatClientContext,
  buildClientsLookupUrl,
  clearClientProfileCache,
  FIELD_ALIASES,
  CACHE_TTL_MS,
};
