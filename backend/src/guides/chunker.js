const TARGET_MIN_CHARS = 2000;
const TARGET_MAX_CHARS = 3200;
const OVERLAP_CHARS = 320;

function headingFromLine(line) {
  const trimmed = line.trim();
  const markdown = trimmed.match(/^(#{1,3})\s+(.+)$/);
  if (markdown) {
    return markdown[2].trim();
  }

  if (
    trimmed.length > 3 &&
    trimmed.length <= 90 &&
    /[A-Za-z]/.test(trimmed) &&
    trimmed === trimmed.toUpperCase() &&
    !trimmed.endsWith(".")
  ) {
    return trimmed;
  }

  return "";
}

function pathStem(fileName) {
  return String(fileName || "guide").replace(/\.[^.]+$/, "");
}

function splitIntoSections(text, fileName) {
  const lines = String(text || "").split("\n");
  const sections = [];
  let title = pathStem(fileName);
  let buffer = [];

  function pushSection() {
    const body = buffer.join("\n").trim();
    if (!body) {
      return;
    }
    sections.push({ title, text: body });
  }

  for (const line of lines) {
    const heading = headingFromLine(line);
    if (heading) {
      pushSection();
      title = heading;
      buffer = [`${heading}\n`];
      continue;
    }
    buffer.push(line);
  }

  pushSection();
  return sections;
}

function windowChunks(sectionText, fileName, sectionTitle) {
  const text = sectionText.trim();
  if (!text) {
    return [];
  }

  if (text.length <= TARGET_MAX_CHARS) {
    return [{ fileName, sectionTitle, text }];
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + TARGET_MAX_CHARS);
    if (end < text.length) {
      const breakAt = text.lastIndexOf("\n", end);
      if (breakAt > start + TARGET_MIN_CHARS) {
        end = breakAt;
      }
    }

    chunks.push({
      fileName,
      sectionTitle,
      text: text.slice(start, end).trim(),
    });

    if (end >= text.length) {
      break;
    }
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }

  return chunks.filter((chunk) => chunk.text);
}

function chunkDocuments(documents) {
  const chunks = [];

  for (const document of documents || []) {
    const sections = splitIntoSections(document.text, document.fileName);
    for (const section of sections) {
      chunks.push(
        ...windowChunks(section.text, document.fileName, section.title)
      );
    }
  }

  return chunks.map((chunk, index) => ({
    id: `${chunk.fileName}:${index}`,
    ...chunk,
  }));
}

module.exports = {
  chunkDocuments,
  splitIntoSections,
  TARGET_MIN_CHARS,
  TARGET_MAX_CHARS,
};
