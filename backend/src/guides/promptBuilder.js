function formatGuideContext(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "";
  }

  const labeled = chunks.map((chunk, index) => {
    const source = `[${index + 1}] ${chunk.fileName} — ${chunk.sectionTitle}`;
    return `${source}\n${chunk.text}`;
  });

  return `GUIDE CONTEXT:\n${labeled.join("\n\n---\n\n")}`;
}

function detectLanguage(text) {
  const value = String(text || "").toLowerCase();
  if (
    /\b(muraho|mwaramutse|mwiriwe|ndabishaka|mfite|nta|kubera|kugira)\b/.test(
      value
    )
  ) {
    return "rw";
  }
  if (
    /\b(bonjour|merci|comment|s'il vous plaît|s'il vous plait|pourquoi)\b/.test(
      value
    )
  ) {
    return "fr";
  }
  return "en";
}

function noGuideMatchReply(language = "en") {
  if (language === "rw") {
    return "Nta makuru mfite kuri icyo mu buyobozi bwa Ishyiga. Nshobora kuguhuza n'umukozi w'ubufasha.";
  }
  if (language === "fr") {
    return "Je n'ai pas cette information dans les guides Ishyiga. Je peux vous mettre en relation avec le support humain.";
  }
  return "I don't have that information in the Ishyiga support guides. I can connect you to human support.";
}

module.exports = {
  formatGuideContext,
  detectLanguage,
  noGuideMatchReply,
};
