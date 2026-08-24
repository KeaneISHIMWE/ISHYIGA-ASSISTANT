const conversationModel = require("../models/conversation");
const messageModel = require("../models/message");
const { loadClientPromptContext } = require("../services/clientProfileService");
const { logger } = require("../utils/logger");
const {
  toConversationSummary,
  toConversationDetail,
  toStats,
  digitsOnly,
  isUuid,
} = require("../services/dashboardService");

async function listConversations(
  req,
  res,
  {
    listSummaries = conversationModel.listSummaries,
  } = {}
) {
  const phone = digitsOnly(req.query && req.query.phone);
  const rows = await listSummaries({ phoneDigits: phone });

  return res.status(200).json({
    conversations: rows.map(toConversationSummary),
  });
}

async function getConversation(
  req,
  res,
  {
    findByIdWithCustomer = conversationModel.findByIdWithCustomer,
    listMessages = messageModel.listByConversationId,
    loadClientProfileFn = loadClientPromptContext,
  } = {}
) {
  const conversationId = req.params && req.params.id;
  if (!isUuid(conversationId)) {
    return res.status(400).json({ error: "Invalid conversation id" });
  }

  const row = await findByIdWithCustomer(conversationId);
  if (!row) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  const messages = await listMessages(conversationId);
  let clientProfile = null;

  try {
    const lookup = await loadClientProfileFn({
      phoneNumber: row.whatsapp_number,
    });
    clientProfile = lookup && lookup.profile ? lookup.profile : null;
  } catch (_error) {
    logger.error("Client profile lookup failed", { reason: "dashboard" });
  }

  return res.status(200).json({
    conversation: toConversationDetail(row, messages, clientProfile),
  });
}

async function getOverview(
  req,
  res,
  { getStats = conversationModel.getStats } = {}
) {
  const stats = toStats(await getStats());
  return res.status(200).json({ stats });
}

module.exports = {
  listConversations,
  getConversation,
  getOverview,
};
