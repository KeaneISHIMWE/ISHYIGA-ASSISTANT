const { searchGuides, guideIndexStats } = require("./index");
const {
  formatGuideContext,
  noGuideMatchReply,
  detectLanguage,
} = require("./promptBuilder");

const GREETING_ONLY_PATTERN =
  /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|bonjour|salut|muraho|habari)(?:\s+there)?[!.,\s]*$/i;

function isGreetingOnly(message) {
  return typeof message === "string" && GREETING_ONLY_PATTERN.test(message.trim());
}

function retrieveGuideContext(message) {
  const chunks = searchGuides(message, { limit: 6, minScore: 1.2 });
  return {
    chunks,
    guideContext: formatGuideContext(chunks),
  };
}

function missingGuideReply(message) {
  return noGuideMatchReply(detectLanguage(message));
}

function shouldRequireGuides(message, hasImage) {
  if (hasImage) {
    return false;
  }
  if (isGreetingOnly(message)) {
    return false;
  }
  if (guideIndexStats().chunks === 0) {
    return false;
  }
  return true;
}

module.exports = {
  retrieveGuideContext,
  missingGuideReply,
  shouldRequireGuides,
};
