function normalizeChoice(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function choiceLabels(candidate) {
  return [candidate.company, candidate.name, candidate.username]
    .map(normalizeChoice)
    .filter(Boolean);
}

function containsPhrase(text, phrase) {
  if (!phrase || phrase.length < 3) {
    return false;
  }
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(text);
}

function matchChoiceText(text, candidates) {
  const raw = String(text || "").trim();
  const normalized = normalizeChoice(raw);
  if (!normalized || !candidates.length) {
    return null;
  }

  const onlyNumber = raw.match(
    /^(?:(?:i\s+)?(?:choose|want|pick|select|take)\s+)?(?:(?:the\s+)?(?:account|company|option|number|no)\s*|#\s*)?(\d{1,2})\.?$/i
  );
  if (onlyNumber) {
    const index = Number(onlyNumber[1]);
    if (index >= 1 && index <= candidates.length) {
      return candidates[index - 1];
    }
  }

  const withoutPrefix = normalized.replace(/^(?:company|account|option)\s+/, "");
  const exact = candidates.filter((candidate) => {
    const labels = choiceLabels(candidate);
    return labels.includes(normalized) || labels.includes(withoutPrefix);
  });
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    return null;
  }

  const phraseHits = candidates.filter((candidate) =>
    choiceLabels(candidate).some((label) => containsPhrase(normalized, label))
  );
  if (phraseHits.length === 1) {
    return phraseHits[0];
  }
  return null;
}

function userTexts(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((item) => item && (item.role === "user" || item.role === "client"))
    .map((item) => item.content || item.text || "");
}

function matchAccountChoice({ message, history, candidates } = {}) {
  const options = Array.isArray(candidates) ? candidates.filter((item) => item && item.accountId) : [];
  if (!options.length) {
    return null;
  }

  const current = matchChoiceText(message, options);
  if (current) {
    return current;
  }

  const earlier = userTexts(history);
  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const chosen = matchChoiceText(earlier[index], options);
    if (chosen) {
      return chosen;
    }
  }
  return null;
}

module.exports = {
  matchAccountChoice,
  matchChoiceText,
};
