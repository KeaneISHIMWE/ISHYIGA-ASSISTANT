const STOP_WORDS = new Set(
  `
  a an the and or of to for in on at is are was were be been being this that those
  with from by as it its if not no we you they i me my our your how do does did
  le la les un une des de du et ou en au aux ce ces dans pour par
  ni na ku mu ya
  `.trim().split(/\s+/)
);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function buildIndex(chunks) {
  const documents = Array.isArray(chunks) ? chunks : [];
  const documentFrequency = new Map();
  const tokenized = documents.map((chunk) => tokenize(chunk.text));

  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const avgLength =
    tokenized.reduce((sum, tokens) => sum + tokens.length, 0) /
      Math.max(tokenized.length, 1) || 1;

  return {
    chunks: documents,
    tokenized,
    documentFrequency,
    avgLength,
  };
}

function bm25Score(queryTokens, docTokens, index) {
  const k1 = 1.2;
  const b = 0.75;
  const n = index.chunks.length || 1;
  const tfMap = new Map();
  for (const token of docTokens) {
    tfMap.set(token, (tfMap.get(token) || 0) + 1);
  }

  let score = 0;
  for (const token of queryTokens) {
    const tf = tfMap.get(token) || 0;
    if (!tf) {
      continue;
    }
    const df = index.documentFrequency.get(token) || 0;
    const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);
    const denom =
      tf + k1 * (1 - b + (b * docTokens.length) / index.avgLength);
    score += idf * ((tf * (k1 + 1)) / denom);
  }
  return score;
}

function retrieveChunks(index, query, { limit = 6, minScore = 1.2 } = {}) {
  if (!index || !Array.isArray(index.chunks) || index.chunks.length === 0) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (!queryTokens.length) {
    return [];
  }

  return index.chunks
    .map((chunk, i) => ({
      ...chunk,
      score: bm25Score(queryTokens, index.tokenized[i] || [], index),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  tokenize,
  buildIndex,
  retrieveChunks,
};
