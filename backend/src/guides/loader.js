const fs = require("fs/promises");
const path = require("path");
const { resolveGuidesDir } = require("./paths");

const GUIDE_EXTENSIONS = new Set([".pdf", ".md", ".txt"]);

async function extractPdfText(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return typeof result.text === "string" ? result.text : "";
  } finally {
    if (typeof parser.destroy === "function") {
      await parser.destroy();
    }
  }
}

async function loadGuideFiles(guidesDir = resolveGuidesDir()) {
  let entries = [];
  try {
    entries = await fs.readdir(guidesDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const documents = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!GUIDE_EXTENSIONS.has(extension)) {
      continue;
    }

    const filePath = path.join(guidesDir, entry.name);
    const buffer = await fs.readFile(filePath);
    let text = "";

    if (extension === ".pdf") {
      text = await extractPdfText(buffer);
    } else {
      text = buffer.toString("utf8");
    }

    documents.push({
      fileName: entry.name,
      filePath,
      text: text.replace(/\r\n/g, "\n").trim(),
    });
  }

  return documents;
}

module.exports = {
  loadGuideFiles,
  GUIDE_EXTENSIONS,
};
