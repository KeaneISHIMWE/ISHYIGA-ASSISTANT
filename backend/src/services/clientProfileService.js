const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { maskPhoneNumber } = require("./whatsappService");
const { toCanonicalWhatsappDigits } = require("./contactRules");

const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CONTRACT_PATH = "/api/vibe-contract/by-phone";
const SECRET_KEY_PATTERN =
  /password|secret|token|cookie|authorization|apikey|api[_-]?key|\bpin\b/i;
const PERSON_NAME_ALIASES = [
  "staffName",
  "managerName",
  "name",
  "full_name",
  "fullName",
  "client_name",
  "customer_name",
  "contact_name",
  "clientName",
  "customerName",
];
const COMPANY_NAME_ALIASES = ["companyName", "company"];
const NAME_ALIASES = [...PERSON_NAME_ALIASES, ...COMPANY_NAME_ALIASES];
const WRAPPER_KEYS = ["data", "contract", "customer", "profile"];
const PLACEHOLDER_NAME = /^(unknown client|unknown)$/i;
const ENVELOPE_SKIP_KEYS = new Set([
  "fromCache",
  "cachePhoneNormalized",
  "storageModel",
  "aliased",
  "generatedAt",
  "success",
  "found",
  "noRecord",
  "activities",
  "pdfFile",
  "weeklyPayments",
]);

const profileCache = new Map();

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function getConfiguredApiUrl() {
  return env.clientsApiUrl || "";
}

function getSessionCookie() {
  return env.customerApiSessionCookie || "";
}

function getApiKey() {
  return env.clientsApiKey || "";
}

function getTimeoutMs() {
  return env.customerApiTimeoutMs || env.clientsApiTimeoutMs || DEFAULT_TIMEOUT_MS;
}

function toCarePhone(phoneNumber) {
  const canonical = toCanonicalWhatsappDigits(phoneNumber);
  if (canonical.startsWith("250") && canonical.length === 12) {
    return `0${canonical.slice(3)}`;
  }

  const digits = digitsOnly(phoneNumber);
  if (digits.startsWith("0") && digits.length === 10) {
    return digits;
  }

  return digits;
}

function humanizeKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatFieldValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return "";
}

function isUsableText(value) {
  const formatted = formatFieldValue(value);
  return Boolean(
    formatted && formatted !== "—" && !PLACEHOLDER_NAME.test(formatted)
  );
}

function isCareEnvelope(payload) {
  return (
    isPlainObject(payload) &&
    ("found" in payload ||
      "noRecord" in payload ||
      "client" in payload ||
      "phoneNormalized" in payload)
  );
}

function phonesFromRecord(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  const phones = [];
  if (Array.isArray(source.phones)) {
    phones.push(...source.phones);
  }

  for (const key of [
    "managerPhone",
    "phone",
    "mobile",
    "whatsapp",
    "phoneNormalized",
    "cachePhoneNormalized",
  ]) {
    if (source[key]) {
      phones.push(source[key]);
    }
  }

  return phones;
}

function phoneMatchesContact(value, phoneNumber) {
  const formatted = formatFieldValue(value);
  if (!formatted) {
    return false;
  }

  const carePhone = toCarePhone(phoneNumber);
  const canonical = toCanonicalWhatsappDigits(phoneNumber);
  return (
    toCarePhone(formatted) === carePhone ||
    toCanonicalWhatsappDigits(formatted) === canonical
  );
}

function payloadMatchesContact(payload, phoneNumber) {
  const client = isPlainObject(payload.client) ? payload.client : payload;
  const candidates = [
    payload.phoneNormalized,
    payload.cachePhoneNormalized,
    ...phonesFromRecord(client),
    ...phonesFromRecord(payload),
  ];

  return candidates.some((value) => phoneMatchesContact(value, phoneNumber));
}

function payloadHasRecord(payload) {
  if (!isPlainObject(payload)) {
    return false;
  }

  if (payload.found === false || payload.noRecord === true) {
    return false;
  }

  const client = isPlainObject(payload.client) ? payload.client : payload;
  if (formatFieldValue(client.id) === "000000") {
    return false;
  }

  const company = formatFieldValue(client.companyName || client.company);
  if (company && PLACEHOLDER_NAME.test(company)) {
    return false;
  }

  return true;
}

function selectCareProfileSource(payload) {
  const client = isPlainObject(payload.client) ? payload.client : {};
  const source = { ...client };

  if (isPlainObject(payload.resume) && isUsableText(payload.resume.summary)) {
    source.accountSummary = payload.resume.summary;
  }

  if (Array.isArray(payload.allowedServices) && payload.allowedServices.length) {
    source.allowedServices = payload.allowedServices;
  }

  if (Array.isArray(payload.plans) && payload.plans.length) {
    source.plans = payload.plans;
  }

  if (isPlainObject(payload.payment)) {
    source.payment = payload.payment;
  }

  return source;
}

function unwrapContractPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.find(isPlainObject) || payload[0] || null;
  }

  if (!isPlainObject(payload)) {
    return null;
  }

  for (const key of WRAPPER_KEYS) {
    if (isPlainObject(payload[key])) {
      return unwrapContractPayload(payload[key]) || payload[key];
    }
  }

  return payload;
}

function collectFields(source, prefix = "", seen = new Set()) {
  if (!isPlainObject(source) || seen.has(source)) {
    return [];
  }

  seen.add(source);
  const fields = [];

  for (const [key, value] of Object.entries(source)) {
    if (SECRET_KEY_PATTERN.test(key) || ENVELOPE_SKIP_KEYS.has(key)) {
      continue;
    }

    const label = prefix ? `${prefix} / ${humanizeKey(key)}` : humanizeKey(key);

    if (isPlainObject(value)) {
      fields.push(...collectFields(value, label, seen));
      continue;
    }

    if (Array.isArray(value)) {
      const primitives = value
        .map((item) => formatFieldValue(item))
        .filter(Boolean);
      if (primitives.length > 0) {
        fields.push({ key, label, value: primitives.join(", ") });
        continue;
      }

      value.forEach((item, index) => {
        if (isPlainObject(item)) {
          fields.push(
            ...collectFields(item, `${label} ${index + 1}`, seen)
          );
        }
      });
      continue;
    }

    const formatted = formatFieldValue(value);
    if (isUsableText(formatted)) {
      fields.push({ key, label, value: formatted });
    }
  }

  return fields;
}

function pickFirst(source, aliases) {
  if (!isPlainObject(source)) {
    return "";
  }

  for (const alias of aliases) {
    if (isUsableText(source[alias])) {
      return formatFieldValue(source[alias]);
    }
  }

  return "";
}

function pickName(source, fields) {
  const fromSource = pickFirst(source, NAME_ALIASES);
  if (fromSource) {
    return fromSource;
  }

  const nameField = fields.find((field) =>
    NAME_ALIASES.includes(field.key)
  );
  return nameField && isUsableText(nameField.value) ? nameField.value : "";
}

function firstService(source) {
  return Array.isArray(source.allowedServices)
    ? source.allowedServices.find(isPlainObject) || null
    : null;
}

function firstPlan(source) {
  return Array.isArray(source.plans)
    ? source.plans.find(isPlainObject) || null
    : null;
}

function normalizeClientProfile(raw, phoneNumber) {
  let source = raw;

  if (Array.isArray(raw)) {
    source =
      raw.find((item) => {
        if (!isPlainObject(item)) {
          return false;
        }
        const itemPhone = formatFieldValue(
          item.phone ||
            item.whatsapp ||
            item.whatsapp_number ||
            item.whatsappNumber ||
            item.mobile ||
            item.clientPhone
        );
        return itemPhone && phoneMatchesContact(itemPhone, phoneNumber);
      }) || raw[0];
  }

  if (isCareEnvelope(source)) {
    if (!payloadHasRecord(source) || !payloadMatchesContact(source, phoneNumber)) {
      return null;
    }
    source = selectCareProfileSource(source);
  } else {
    source = unwrapContractPayload(source);
  }

  if (!source) {
    return null;
  }

  const fields = collectFields(source);
  if (fields.length === 0) {
    return null;
  }

  const service = firstService(source);
  const plan = firstPlan(source);

  return {
    name: pickName(source, fields),
    company: pickFirst(source, COMPANY_NAME_ALIASES),
    tin: pickFirst(source, ["tin", "TIN"]),
    email: pickFirst(source, ["managerEmail", "email"]),
    location: pickFirst(source, ["address", "location", "branchName"]),
    software: service ? pickFirst(service, ["name", "code"]) : "",
    version: service ? pickFirst(service, ["version"]) : "",
    plan: plan
      ? [pickFirst(plan, ["contractType", "status"]), pickFirst(plan, ["status"])]
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .join(" · ")
      : "",
    phoneNumber: toCarePhone(phoneNumber),
    fields,
  };
}

const HIDDEN_CONTEXT_LABEL = /\b(id|tin|pdf)\b/i;

function formatClientContext(profile) {
  if (!profile || !Array.isArray(profile.fields) || profile.fields.length === 0) {
    return "";
  }

  const rows = profile.fields
    .filter((field) => field && !HIDDEN_CONTEXT_LABEL.test(field.label || ""))
    .map((field) => `- ${field.label}: ${field.value}`)
    .join("\n");

  if (!rows) {
    return "";
  }

  const companyLine = profile.company
    ? `Company name: ${profile.company}`
    : "";
  const contactLine = profile.phoneNumber
    ? `WhatsApp contact: ${profile.phoneNumber}. Use only this contact's record.`
    : "Customer has been identified using their WhatsApp phone number.";

  return `CUSTOMER CONTEXT

CONTACT STATUS: KNOWN CUSTOMER
${companyLine}
${contactLine}

${rows}

IMPORTANT:
- These values came from the live CARE lookup for this WhatsApp number.
- Use the real company name in greetings when appropriate.
- Never invent information.
- Do not disclose internal IDs, TIN, or staff details unless the customer asks and it is necessary.
- Other customer information should only be disclosed when relevant or explicitly requested.
- If information is unavailable, clearly say that it is unavailable.`;
}

function formatUnknownContactContext(phoneNumber) {
  const carePhone = toCarePhone(phoneNumber);
  return `CUSTOMER CONTEXT

CONTACT STATUS: UNREGISTERED / UNRECOGNIZED CONTACT
WhatsApp number: ${carePhone || "unknown"}

This number was not found in CARE.
This is an identity-discovery step, not a normal support conversation.
Do not treat them as a verified Ishyiga customer.
Do not invent a company name, contract, payment, product, or version.

If their message is only a greeting, reply with a short friendly greeting such as "Hello 👋". Do not ask for the company yet. Do not say "how can I help you today?"
If their message is a question or support request, greet them, say this number isn't registered with us yet, and ask for their name and company. Do not answer the support question yet.
Do not say they are not a customer or that access is denied.
OTP and account-linking are not available. Do not generate an OTP or claim a number was linked.`;
}

function formatUnavailableCareContext() {
  return `CUSTOMER CONTEXT

CONTACT STATUS: UNVERIFIED — CARE UNAVAILABLE

CARE could not be reached for this WhatsApp number.
Do not invent customer information.
Do not pretend the customer was found.
Follow API failure handling.`;
}

function resolveContractEndpoint(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!trimmed) {
    return "";
  }

  if (/vibe-contract\/by-phone/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}${CONTRACT_PATH}`;
}

function buildClientsLookupUrl(baseUrl, phoneNumber) {
  const carePhone = toCarePhone(phoneNumber);
  if (!baseUrl || !carePhone) {
    return null;
  }

  if (String(baseUrl).includes("{phone}")) {
    return String(baseUrl).replaceAll("{phone}", encodeURIComponent(carePhone));
  }

  const endpoint = resolveContractEndpoint(baseUrl);
  const url = new URL(endpoint);
  url.searchParams.set("phone", carePhone);
  return url.toString();
}

function readCache(phoneNumber, nowFn) {
  const key = toCanonicalWhatsappDigits(phoneNumber);
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
  const key = toCanonicalWhatsappDigits(phoneNumber);
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

function hasCachedEntry(phoneNumber) {
  return profileCache.has(toCanonicalWhatsappDigits(phoneNumber));
}

async function fetchClientProfile({
  phoneNumber,
  fetchFn = fetch,
  nowFn = Date.now,
} = {}) {
  const digits = toCanonicalWhatsappDigits(phoneNumber);
  if (!digits) {
    return { ok: false, skipped: true, profile: null, error: "missing_phone" };
  }

  const baseUrl = getConfiguredApiUrl();
  if (!baseUrl) {
    return { ok: false, skipped: true, profile: null, error: "not_configured" };
  }

  if (hasCachedEntry(digits)) {
    const cached = readCache(digits, nowFn);
    return { ok: Boolean(cached), skipped: false, cached: true, profile: cached };
  }

  const lookupUrl = buildClientsLookupUrl(baseUrl, digits);
  if (!lookupUrl) {
    return { ok: false, skipped: true, profile: null, error: "invalid_url" };
  }

  const headers = { Accept: "application/json" };
  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const sessionCookie = getSessionCookie();
  if (sessionCookie) {
    headers.Cookie = sessionCookie;
  }

  try {
    const response = await fetchFn(lookupUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(getTimeoutMs()),
    });

    if (response.status === 404) {
      writeCache(digits, null, nowFn);
      logger.info("Customer contract not found", {
        customer: maskPhoneNumber(digits),
      });
      return { ok: false, skipped: false, profile: null, error: "not_found" };
    }

    if (!response.ok) {
      logger.error("Customer contract lookup failed", {
        customer: maskPhoneNumber(digits),
        status: response.status,
      });
      return { ok: false, skipped: false, profile: null, error: "api_error" };
    }

    const payload = await response.json();
    const profile = normalizeClientProfile(payload, digits);

    if (
      !profile &&
      isCareEnvelope(payload) &&
      (!payloadHasRecord(payload) || !payloadMatchesContact(payload, digits))
    ) {
      writeCache(digits, null, nowFn);
      logger.info("Customer contract not found", {
        customer: maskPhoneNumber(digits),
      });
      return { ok: false, skipped: false, profile: null, error: "not_found" };
    }

    writeCache(digits, profile, nowFn);

    logger.info("Customer contract loaded", {
      customer: maskPhoneNumber(digits),
      found: Boolean(profile),
    });

    return {
      ok: Boolean(profile),
      skipped: false,
      profile,
      error: profile ? null : "empty",
    };
  } catch (error) {
    const timedOut =
      error && (error.name === "TimeoutError" || error.name === "AbortError");
    logger.error("Customer contract lookup failed", {
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
  let clientContext = "";
  if (result.profile) {
    clientContext = formatClientContext(result.profile);
  } else if (result.error === "not_found") {
    clientContext = formatUnknownContactContext(phoneNumber);
  } else if (
    result.error === "api_error" ||
    result.error === "timeout" ||
    result.error === "unhandled"
  ) {
    clientContext = formatUnavailableCareContext();
  }

  return {
    ...result,
    clientContext,
  };
}

module.exports = {
  fetchClientProfile,
  loadClientPromptContext,
  normalizeClientProfile,
  formatClientContext,
  formatUnknownContactContext,
  formatUnavailableCareContext,
  buildClientsLookupUrl,
  toCarePhone,
  clearClientProfileCache,
  CACHE_TTL_MS,
};
