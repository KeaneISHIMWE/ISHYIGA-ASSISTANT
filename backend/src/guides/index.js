const { loadGuideFiles } = require("./loader");
const { chunkDocuments } = require("./chunker");
const { buildIndex, retrieveChunks } = require("./retriever");
const { resolveGuidesDir } = require("./paths");
const { logger } = require("../utils/logger");

let cachedIndex = {
  chunks: [],
  tokenized: [],
  documentFrequency: new Map(),
  avgLength: 1,
};
let loadedAt = 0;

async function loadGuideIndex(guidesDir = resolveGuidesDir()) {
  const documents = await loadGuideFiles(guidesDir);
  const chunks = chunkDocuments(documents);
  cachedIndex = buildIndex(chunks);
  loadedAt = Date.now();
  logger.info("Guide index loaded", {
    dir: guidesDir,
    files: documents.length,
    chunks: chunks.length,
  });
  return {
    dir: guidesDir,
    files: documents.length,
    chunks: chunks.length,
    loadedAt,
  };
}

function searchGuides(query, options) {
  return retrieveChunks(cachedIndex, query, options);
}

function guideIndexStats() {
  return {
    chunks: cachedIndex.chunks.length,
    loadedAt,
  };
}

module.exports = {
  loadGuideIndex,
  searchGuides,
  guideIndexStats,
};
