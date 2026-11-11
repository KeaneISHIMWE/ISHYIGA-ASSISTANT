const aiStudio = require("../../models/aiStudio");
const { findByPhone } = require("../../models/customer");

async function loadLearningContext({ phone, question }) {
  const customer = await findByPhone(phone);
  if (!customer) {
    return "";
  }
  const [memories, knowledge] = await Promise.all([
    aiStudio.listMemories(customer.id),
    aiStudio.searchApprovedKnowledge(question, 3),
  ]);
  const lines = [];
  if (memories.length) {
    lines.push("PERSONAL MEMORY (private to this sender, use only when relevant):");
    memories.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.memory_content}`);
    });
  }
  if (knowledge.length) {
    lines.push(
      "APPROVED SHARED KNOWLEDGE (verified by a person; prefer this over a conflicting guess):"
    );
    knowledge.forEach((item) => {
      lines.push(`- ${item.title}: ${item.normalized_content}`);
    });
  }
  return lines.join("\n");
}

module.exports = { loadLearningContext };
