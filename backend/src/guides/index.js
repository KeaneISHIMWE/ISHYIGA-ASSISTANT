const { loadGuideFiles } = require("./loader");
const { chunkDocuments } = require("./chunker");
const { buildIndex, retrieveChunks, retrieveByEmbedding } = require("./retriever");
const { embedChunks, embedQuery } = require("./embeddings");
const { resolveGuidesDir } = require("./paths");
const { logger } = require("../utils/logger");

let cachedIndex = {
  chunks: [],
  tokenized: [],
  documentFrequency: new Map(),
  avgLength: 1,
  embeddings: null,
};
let loadedAt = 0;
let retrievalMode = "bm25";

async function loadGuideIndex(guidesDir = resolveGuidesDir()) {
  const documents = await loadGuideFiles(guidesDir);
  const chunks = chunkDocuments(documents);
  cachedIndex = buildIndex(chunks);
  retrievalMode = "bm25";

  try {
    const embeddings = await embedChunks(chunks);
    if (embeddings) {
      cachedIndex.embeddings = embeddings;
      retrievalMode = "embeddings";
    }
  } catch (error) {
    logger.error("Guide embeddings failed, using keyword retrieval", {
      message: error.message,
    });
  }

  loadedAt = Date.now();
  logger.info("Guide index loaded", {
    dir: guidesDir,
    files: documents.length,
    chunks: chunks.length,
    retrieval: retrievalMode,
  });
  return {
    dir: guidesDir,
    files: documents.length,
    chunks: chunks.length,
    retrieval: retrievalMode,
    loadedAt,
  };
}

async function searchGuides(query, options = {}) {
  const limit = options.limit || 6;

  if (retrievalMode === "embeddings" && cachedIndex.embeddings) {
    const vector = await embedQuery(query);
    if (vector) {
      return retrieveByEmbedding(cachedIndex, vector, {
        limit,
        minScore: options.minScore == null ? 0.32 : options.minScore,
      });
    }
  }

  return retrieveChunks(cachedIndex, query, {
    limit,
    minScore: options.minScore == null ? 1.2 : options.minScore,
  });
}

function guideIndexStats() {
  return {
    chunks: cachedIndex.chunks.length,
    loadedAt,
    retrieval: retrievalMode,
  };
}

module.exports = {
  loadGuideIndex,
  searchGuides,
  guideIndexStats,
};
