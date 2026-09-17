const INTENTS = {
  GREETING: "GREETING",
  GENERAL_CONVERSATION: "GENERAL_CONVERSATION",
  SUPPORT_REQUEST: "SUPPORT_REQUEST",
  TECHNICAL_ISSUE: "TECHNICAL_ISSUE",
  ACCOUNT_ISSUE: "ACCOUNT_ISSUE",
  REGISTRATION_REQUEST: "REGISTRATION_REQUEST",
  VERIFICATION_REQUEST: "VERIFICATION_REQUEST",
  BILLING_REQUEST: "BILLING_REQUEST",
  INFORMATION_REQUEST: "INFORMATION_REQUEST",
  FOLLOW_UP: "FOLLOW_UP",
  UNKNOWN: "UNKNOWN",
};

const SUPPORT_CAPABLE_INTENTS = new Set([
  INTENTS.SUPPORT_REQUEST,
  INTENTS.TECHNICAL_ISSUE,
  INTENTS.ACCOUNT_ISSUE,
  INTENTS.REGISTRATION_REQUEST,
  INTENTS.VERIFICATION_REQUEST,
  INTENTS.BILLING_REQUEST,
]);

const CONVERSATIONAL_INTENTS = new Set([
  INTENTS.GREETING,
  INTENTS.GENERAL_CONVERSATION,
]);

const GREETING_PATTERN =
  /^(?:hi+|he+l+o+|hey+|yo|hiya|howdy|good\s+(?:morning|afternoon|evening)|bonjour|salut|muraho|mwaramutse|mwiriwe|habari(?:\s+yako)?)(?:\s+there)?[!?.,\s]*$/i;

const SMALL_TALK_PATTERN =
  /^(?:how\s+are\s+you(?:\s+doing)?|how(?:'s|s| is) it going|what(?:'s|s| is)\s+up|amakuru(?:\s+yawe)?|umeze\s+(?:neza|ute)|ni\s+gute|ndabaho|comment\s+(?:allez[\s-]?vous|vas[\s-]?tu)|c(?:'|a)?est\s+comment)[!?.,\s]*$/i;

const TECHNICAL_PATTERN =
  /\b(pos|ebm|rra|stock|inventory|printer|invoice|receipt|login|password|ntikora|ntikora|ikibazo|not working|doesn't work|does not work|down|error|crash|offline|yanjye)\b/i;

const EXPLICIT_SUPPORT_PATTERN =
  /\b(need someone|need (a )?technician|need support|need (an? )?agent|send (an? )?(agent|technician)|come (and )?(fix|check)|check it|talk to support|speak (to|with) support|nshaka umuntu|ndakeneye umuntu|mfasha|nshaka ubufasha)\b/i;

const ACCOUNT_PATTERN =
  /\b(add (a )?user|remove (a )?user|permission|password reset|account (locked|access)|user account)\b/i;

const REGISTRATION_PATTERN =
  /\b(register( this)?( number| contact)?|link (this |my )?number|add (this |my )?number|new number|unregistered)\b/i;

const VERIFICATION_PATTERN =
  /\b(verif(y|ication)|otp|one[- ]time (code|password)|registered phone)\b/i;

const BILLING_PATTERN =
  /\b(payment|paid|billing|invoice paid|receipt of payment|amafranga)\b/i;

const INFORMATION_PATTERN =
  /\b(what (services|products)|how do i|how can i|working hours|price|version|what is ishyiga)\b/i;

const FOLLOW_UP_PATTERN =
  /\b(any update|what happened to (my )?ticket|did you (fix|check)|still waiting on (the )?ticket)\b/i;

const KINYARWANDA_PATTERN =
  /\b(muraho|mwaramutse|mwiriwe|amakuru|umeze|ntikora|nabafasha|murakoze|ikibazo|yanjye|ndabaho|mfite|ubufasha|meze)\b/i;

function normalizeMessage(message) {
  return String(message || "").trim();
}

function detectLanguage(message) {
  return KINYARWANDA_PATTERN.test(normalizeMessage(message)) ? "rw" : "en";
}

function classifyIntent(message) {
  const text = normalizeMessage(message);
  if (!text) {
    return INTENTS.UNKNOWN;
  }

  if (GREETING_PATTERN.test(text)) {
    return INTENTS.GREETING;
  }

  if (SMALL_TALK_PATTERN.test(text)) {
    return INTENTS.GENERAL_CONVERSATION;
  }

  if (FOLLOW_UP_PATTERN.test(text)) {
    return INTENTS.FOLLOW_UP;
  }

  if (VERIFICATION_PATTERN.test(text)) {
    return INTENTS.VERIFICATION_REQUEST;
  }

  if (REGISTRATION_PATTERN.test(text)) {
    return INTENTS.REGISTRATION_REQUEST;
  }

  if (BILLING_PATTERN.test(text)) {
    return INTENTS.BILLING_REQUEST;
  }

  if (ACCOUNT_PATTERN.test(text)) {
    return INTENTS.ACCOUNT_ISSUE;
  }

  if (TECHNICAL_PATTERN.test(text) && EXPLICIT_SUPPORT_PATTERN.test(text)) {
    return INTENTS.SUPPORT_REQUEST;
  }

  if (EXPLICIT_SUPPORT_PATTERN.test(text)) {
    return INTENTS.SUPPORT_REQUEST;
  }

  if (TECHNICAL_PATTERN.test(text)) {
    return INTENTS.TECHNICAL_ISSUE;
  }

  if (INFORMATION_PATTERN.test(text)) {
    return INTENTS.INFORMATION_REQUEST;
  }

  return INTENTS.UNKNOWN;
}

function isSupportCapableIntent(intent) {
  return SUPPORT_CAPABLE_INTENTS.has(intent);
}

function isConversationalIntent(intent) {
  return CONVERSATIONAL_INTENTS.has(intent);
}

function isConversationalMessage(message) {
  return isConversationalIntent(classifyIntent(message));
}

function conversationalFallback(message) {
  const text = normalizeMessage(message);
  const intent = classifyIntent(text);
  const language = detectLanguage(text);

  if (intent === INTENTS.GREETING) {
    return language === "rw"
      ? "Muraho 👋 Nabafasha iki uyu munsi?"
      : "Hello 👋 How can I help you today?";
  }

  if (intent === INTENTS.GENERAL_CONVERSATION) {
    if (/\bamakuru\b/i.test(text)) {
      return "Ni meza neza, murakoze 😊 Nabafasha iki?";
    }
    if (/\bumeze\b/i.test(text)) {
      return "Yego, meze neza 😊 Murakoze kubaza. Nabafasha iki?";
    }
    return language === "rw"
      ? "Yego, meze neza 😊 Murakoze kubaza. Nabafasha iki?"
      : "I'm doing well, thank you 😊 How can I help you?";
  }

  return null;
}

function unknownFallback() {
  return "Sorry, I didn't quite understand that. Could you explain what you need help with?";
}

module.exports = {
  INTENTS,
  SUPPORT_CAPABLE_INTENTS,
  CONVERSATIONAL_INTENTS,
  classifyIntent,
  detectLanguage,
  isSupportCapableIntent,
  isConversationalIntent,
  isConversationalMessage,
  conversationalFallback,
  unknownFallback,
};
