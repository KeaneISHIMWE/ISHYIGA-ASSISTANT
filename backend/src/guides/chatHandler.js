const { searchGuides, guideIndexStats } = require("./index");
const {
  formatGuideContext,
  noGuideMatchReply,
  detectLanguage,
} = require("./promptBuilder");
const {
  matchTutorials,
  formatTutorialContext,
} = require("./tutorials");

const GREETING_ONLY_PATTERN =
  /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|bonjour|salut|muraho|habari)(?:\s+there)?[!.,\s]*$/i;

function isGreetingOnly(message) {
  return typeof message === "string" && GREETING_ONLY_PATTERN.test(message.trim());
}

function retrieveGuideContext(message) {
  const chunks = searchGuides(message, { limit: 6, minScore: 1.2 });
  const tutorials = matchTutorials(message, { limit: 2, minScore: 3 });
  const tutorialBlock = formatTutorialContext(tutorials);
  return {
    chunks,
    tutorials,
    guideContext: formatGuideContext(chunks, tutorialBlock),
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

function hasGuideOrTutorialHelp(message) {
  const { chunks, tutorials } = retrieveGuideContext(message);
  return chunks.length > 0 || (Array.isArray(tutorials) && tutorials.length > 0);
}

module.exports = {
  retrieveGuideContext,
  missingGuideReply,
  shouldRequireGuides,
  hasGuideOrTutorialHelp,
};
