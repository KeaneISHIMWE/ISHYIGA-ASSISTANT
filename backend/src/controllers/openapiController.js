function requestBaseUrl(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
  return `${proto}://${host}`;
}

function getOpenApi(req, res) {
  const baseUrl = requestBaseUrl(req);

  return res.status(200).json({
    openapi: "3.0.3",
    info: {
      title: "Ishyiga Assistant Conversation API",
      version: "1.0.0",
      description:
        "Read WhatsApp conversations between clients and the Ishyiga Assistant. Use this to list chats and fetch the full message thread.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/conversations": {
        get: {
          summary: "List conversations",
          description:
            "Returns every stored WhatsApp conversation, newest activity first. Optionally filter by phone number.",
          parameters: [
            {
              name: "phone",
              in: "query",
              required: false,
              schema: { type: "string", example: "250792431896" },
              description: "WhatsApp number. Spaces and + are ignored.",
            },
          ],
          responses: {
            200: { description: "Conversation inbox" },
          },
        },
      },
      "/api/conversations/{conversationId}": {
        get: {
          summary: "Get one conversation with all messages",
          parameters: [
            {
              name: "conversationId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            200: { description: "Full conversation thread" },
            400: { description: "Invalid conversation id" },
            404: { description: "Conversation not found" },
          },
        },
      },
      "/api/dashboard": {
        get: {
          summary: "Get conversation totals",
          responses: {
            200: { description: "Counts of customers, chats, and messages" },
          },
        },
      },
    },
  });
}

module.exports = { getOpenApi, requestBaseUrl };
