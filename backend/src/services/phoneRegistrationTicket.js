const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { toCanonicalWhatsappDigits } = require("./contactRules");
const {
  getRegistrationTicket,
  saveRegistrationTicket,
} = require("../models/conversation");

const TICKET_PATH = "/api/client-portal/create-ticket";
const NOT_CREATED_NOTE = `REGISTRATION TICKET STATUS: NOT CREATED
A support ticket is created only when this WhatsApp number needs to be registered or added.
Do not say a human support agent will contact or assist the client.
Do not say the issue was escalated, forwarded, or resolved.
If they want this number added, ask for their name, company, and the phone number already registered on the Ishyiga account.`;

const REPLIES = {
  en: {
    created:
      "I submitted a request to register this WhatsApp number. A support agent will add it to your account.",
    waiting:
      "Human support has not assisted you yet. This number is still not registered.",
    failed:
      "I could not submit the request to register this number. Please try again after 30 minutes.",
  },
  fr: {
    created:
      "J'ai envoyé une demande pour enregistrer ce numéro WhatsApp. Un agent du support va l'ajouter à votre compte.",
    waiting:
      "Le support humain ne vous a pas encore aidé. Ce numéro n'est toujours pas enregistré.",
    failed:
      "Je n'ai pas pu envoyer la demande d'enregistrement de ce numéro. Réessayez après 30 minutes.",
  },
  rw: {
    created:
      "Nohereje ubusabe bwo kwandika iyi nimero ya WhatsApp. Umukozi wa support azayishyira kuri konti yawe.",
    waiting:
      "Abakozi ba support ntibaragufasha. Iyi nimero ntirandikwa.",
    failed:
      "Sinashoboye kohereza ubusabe bwo kwandika iyi nimero. Ongera ugerageze nyuma y'iminota 30.",
  },
};

const REGISTRATION_INTENT =
  /\b(?:add|register|link)\b.{0,40}\b(?:number|phone|whatsapp|nimero|num[eé]ro)\b|\b(?:new number|new phone)\b|\b(?:number|phone|num[eé]ro|nimero)\b.{0,40}\b(?:not registered|isn't registered|is not registered|pas enregistr|ntirandikwa)\b|\balready (?:use|using) ishyiga\b|\bi use ishyiga\b|\bexisting customer\b|\bndakoresha\s+ishyiga\b|\benregistr(?:er|é)\b.{0,30}\b(?:num[eé]ro|t[eé]l[eé]phone)\b/i;

const ADD_THIS_NUMBER =
  /\b(?:add|register|link)\s+(?:this|my)\s+(?:whatsapp\s+)?(?:number|phone)\b|\bongeraho\s+(?:iyi\s+)?nimero\b|\bshyira\s+(?:iyi\s+)?nimero\b/i;

function replyLanguage(text) {
  const sample = String(text || "");
  if (/\b(muraho|ndakoresha|nimero|mwiriwe|nitwa|shyiraho|ongeraho)\b/i.test(sample)) {
    return "rw";
  }
  if (
    /\b(bonjour|num[eé]ro|soci[eé]t[eé]|enregistr|je suis|s'il vous pla[iî]t|je m'appelle)\b/i.test(
      sample
    )
  ) {
    return "fr";
  }
  return "en";
}

function replyFor(language, key) {
  const pack = REPLIES[language] || REPLIES.en;
  return pack[key];
}

function userTexts(message, history) {
  const previous = (Array.isArray(history) ? history : [])
    .filter(
      (item) =>
        item && item.role === "user" && typeof item.content === "string"
    )
    .map((item) => item.content.trim());
  const current = typeof message === "string" ? message.trim() : "";
  return [...previous, current].filter(Boolean);
}

function trimCaptured(value) {
  return String(value || "")
    .split(/\b(?:please|the registered|registered phone|registered number|my number|and the)\b/i)[0]
    .replace(/[.,!?].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function captureFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleaned = trimCaptured(match[1]);
      if (cleaned) {
        return cleaned;
      }
    }
  }
  return "";
}

function captureName(text) {
  return captureFirst(text, [
    /\bmy name is\s+([A-Za-z][A-Za-z' -]{1,60})/i,
    /\bje m'appelle\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,60})/i,
    /\bnitwa\s+([A-Za-z][A-Za-z' -]{1,60})/i,
    /\bname\s*:\s*([A-Za-z][A-Za-z' -]{1,60})/i,
  ]);
}

function captureCompany(text) {
  return captureFirst(text, [
    /\b(?:company(?:\s+name)?|soci[eé]t[eé]|sosiyete)\s*(?:is|:)?\s+([A-Za-z0-9][^\n]{1,80})/i,
    /\b(?:i work at|i am from|i'm from)\s+([A-Za-z0-9][^\n]{1,80})/i,
  ]);
}

function extractPhones(text) {
  const found = [];
  const pattern = /(?:\+?\s*250|0)\s*7\d(?:[\s-]?\d){7}/g;
  const matches = String(text || "").match(pattern) || [];
  for (const match of matches) {
    const canonical = toCanonicalWhatsappDigits(match);
    if (
      canonical.startsWith("250") &&
      canonical.length === 12 &&
      !found.includes(canonical)
    ) {
      found.push(canonical);
    }
  }
  return found;
}

function assessPhoneRegistration({
  message = "",
  history = [],
  phone = "",
  customerName = "",
} = {}) {
  const texts = userTexts(message, history);
  const combined = texts.join("\n");
  const whatsappPhone = toCanonicalWhatsappDigits(phone);
  const intent = REGISTRATION_INTENT.test(combined);
  const name =
    captureName(combined) ||
    (intent ? trimCaptured(customerName).slice(0, 80) : "");
  const company = captureCompany(combined);
  const registeredPhone =
    extractPhones(combined).find((item) => item !== whatsappPhone) || "";
  const wantsThisNumber = ADD_THIS_NUMBER.test(combined);
  const ready = Boolean(
    intent && name && company && (registeredPhone || wantsThisNumber)
  );

  return {
    intent,
    ready,
    language: replyLanguage(combined),
    details: {
      whatsappPhone,
      clientName: name,
      clientCompany: company,
      registeredPhone,
    },
  };
}

function ticketEndpoint(baseUrl) {
  const base = String(baseUrl || "").trim().replace(/\/$/, "");
  if (!base) {
    return "";
  }
  return `${base}${TICKET_PATH}`;
}

function registrationMessage(details) {
  return [
    "Please register or add this WhatsApp number to the client account.",
    details.whatsappPhone
      ? `WhatsApp number to add: ${details.whatsappPhone}`
      : "",
    details.clientName ? `Client name: ${details.clientName}` : "",
    details.clientCompany ? `Company: ${details.clientCompany}` : "",
    details.registeredPhone
      ? `Phone already registered on the account: ${details.registeredPhone}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function readTicketId(payload) {
  if (!payload || typeof payload !== "object") {
    return "created";
  }
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const id =
    payload.ticketId ||
    payload.ticket_id ||
    payload.id ||
    data.ticketId ||
    data.ticket_id ||
    data.id ||
    "";
  return id ? String(id) : "created";
}

async function createPhoneRegistrationTicket(
  details,
  {
    fetchFn = fetch,
    apiKey = env.ticketCreationApiKey,
    baseUrl = env.customerApiUrl || env.clientsApiUrl,
    timeoutMs = env.customerApiTimeoutMs,
  } = {}
) {
  const endpoint = ticketEndpoint(baseUrl);
  if (!endpoint || !apiKey) {
    logger.error("Registration ticket skipped", { reason: "not_configured" });
    return { ok: false, error: "not_configured", ticketId: null };
  }

  const url = new URL(endpoint);
  url.searchParams.set("message", registrationMessage(details));
  if (details.clientName) {
    url.searchParams.set("clientName", details.clientName);
  }
  if (details.clientCompany) {
    url.searchParams.set("clientCompany", details.clientCompany);
  }
  if (details.whatsappPhone) {
    url.searchParams.set("supportContact", details.whatsappPhone);
  }

  try {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Client-Api-Key": apiKey,
      },
      body: new FormData(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    let payload = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      payload = null;
    }

    if (!response.ok || (payload && payload.success === false)) {
      logger.error("Registration ticket rejected", { status: response.status });
      return { ok: false, error: "rejected", ticketId: null };
    }

    logger.info("Registration ticket created", { status: response.status });
    return { ok: true, error: null, ticketId: readTicketId(payload) };
  } catch (error) {
    const timedOut = Boolean(
      error &&
        (error.name === "TimeoutError" ||
          error.name === "AbortError" ||
          /timeout/i.test(error.message || ""))
    );
    logger.error("Registration ticket failed", {
      reason: timedOut ? "timeout" : "unhandled",
    });
    return {
      ok: false,
      error: timedOut ? "timeout" : "unhandled",
      ticketId: null,
    };
  }
}

async function resolvePhoneRegistration({
  message = "",
  history = [],
  phone = "",
  customerName = "",
  conversationId = null,
  loadTicket = getRegistrationTicket,
  saveTicket = saveRegistrationTicket,
  createTicket = createPhoneRegistrationTicket,
} = {}) {
  const decision = assessPhoneRegistration({
    message,
    history,
    phone,
    customerName,
  });

  let existing = null;
  if (conversationId) {
    try {
      existing = await loadTicket(conversationId);
    } catch (_error) {
      logger.error("Registration ticket lookup failed");
      existing = null;
    }
  }

  if (existing && existing.registration_ticket_id) {
    return {
      ok: true,
      reply: replyFor(decision.language, "waiting"),
      contextNote: "",
    };
  }

  if (!decision.ready) {
    return { ok: true, reply: null, contextNote: NOT_CREATED_NOTE };
  }

  const created = await createTicket(decision.details);
  if (!created || !created.ok) {
    return {
      ok: false,
      reply: replyFor(decision.language, "failed"),
      contextNote: "",
    };
  }

  if (conversationId) {
    try {
      await saveTicket(conversationId, created.ticketId || "created");
    } catch (_error) {
      logger.error("Registration ticket save failed");
    }
  }

  return {
    ok: true,
    reply: replyFor(decision.language, "created"),
    contextNote: "",
  };
}

async function applyPhoneRegistration({
  lookup,
  message,
  history,
  phone,
  customerName,
  conversationId,
  resolveFn = resolvePhoneRegistration,
} = {}) {
  const clientContext =
    lookup && typeof lookup.clientContext === "string" ? lookup.clientContext : "";
  if (!lookup || lookup.error !== "not_found") {
    return { clientContext, reply: null, ok: true };
  }

  const registration = await resolveFn({
    message,
    history,
    phone,
    customerName,
    conversationId,
  });
  if (registration && registration.reply) {
    return {
      clientContext,
      reply: registration.reply,
      ok: registration.ok !== false,
    };
  }

  const note = registration && registration.contextNote;
  return {
    clientContext: note ? `${clientContext}\n\n${note}` : clientContext,
    reply: null,
    ok: true,
  };
}

module.exports = {
  NOT_CREATED_NOTE,
  assessPhoneRegistration,
  createPhoneRegistrationTicket,
  resolvePhoneRegistration,
  applyPhoneRegistration,
  registrationMessage,
  ticketEndpoint,
};
