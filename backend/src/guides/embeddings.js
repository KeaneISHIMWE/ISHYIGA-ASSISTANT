const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const OpenAI = require("openai");
const { logger } = require("../utils/logger");

const DEFAULT_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 64;
const MAX_INPUT_CHARS = 12000;

function embeddingModel() {
  return process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;
}

function cachePath() {
  return path.join(__dirname, "..", "..", ".cache", "guide-embeddings.json");
}

function chunkKey(chunk) {
  return crypto
    .createHash("sha256")
    .update(`${chunk.fileName}\n${chunk.sectionTitle}\n${chunk.text}`)
    .digest("hex");
}

function inputText(chunk) {
  const text = `${chunk.fileName}\n${chunk.sectionTitle}\n${chunk.text}`;
  return text.slice(0, MAX_INPUT_CHARS);
}

async function readCache(model) {
  try {
    const raw = await fs.readFile(cachePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.model !== model || !parsed.vectors) {
      return new Map();
    }
    return new Map(Object.entries(parsed.vectors));
  } catch (_error) {
    return new Map();
  }
}

async function writeCache(model, vectors) {
  const filePath = cachePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify({ model, vectors: Object.fromEntries(vectors) })
  );
}

async function embedBatch(client, model, texts) {
  const response = await client.embeddings.create({
    model,
    input: texts,
  });
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => row.embedding);
}

async function embedChunks(chunks, { client } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(chunks) || chunks.length === 0) {
    return null;
  }

  const model = embeddingModel();
  const openai = client || new OpenAI({ apiKey, timeout: 60_000 });
  const cached = await readCache(model);
  const embeddings = new Array(chunks.length);
  const missing = [];

  chunks.forEach((chunk, index) => {
    const key = chunkKey(chunk);
    const vector = cached.get(key);
    if (Array.isArray(vector) && vector.length > 0) {
      embeddings[index] = vector;
      return;
    }
    missing.push({ index, key, text: inputText(chunk) });
  });

  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const batch = missing.slice(start, start + BATCH_SIZE);
    const vectors = await embedBatch(
      openai,
      model,
      batch.map((item) => item.text)
    );
    batch.forEach((item, offset) => {
      const vector = vectors[offset];
      if (!Array.isArray(vector)) {
        throw new Error("Embedding response was incomplete");
      }
      embeddings[item.index] = vector;
      cached.set(item.key, vector);
    });
  }

  if (missing.length > 0) {
    await writeCache(model, cached);
  }

  logger.info("Guide embeddings ready", {
    model,
    chunks: chunks.length,
    embeddedNow: missing.length,
  });

  return embeddings;
}

async function embedQuery(query, { client } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const text = String(query || "").trim();
  if (!apiKey || !text) {
    return null;
  }

  const openai = client || new OpenAI({ apiKey, timeout: 30_000 });
  const vectors = await embedBatch(openai, embeddingModel(), [
    text.slice(0, MAX_INPUT_CHARS),
  ]);
  return vectors[0] || null;
}

module.exports = {
  embedChunks,
  embedQuery,
  embeddingModel,
  chunkKey,
};
