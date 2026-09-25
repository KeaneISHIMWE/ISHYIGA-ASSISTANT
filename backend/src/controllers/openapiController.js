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
        "Read WhatsApp conversations and send a client message to the Ishyiga Assistant. Every conversation and message endpoint requires Authorization: Bearer <CONVERSATIONS_API_KEY>. Traffic is HTTPS on Railway.",
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "The CONVERSATIONS_API_KEY value.",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
        },
      },
    },
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
              schema: { type: "string", example: "250788000000" },
              description: "WhatsApp number. Spaces and + are ignored.",
            },
          ],
          responses: {
            200: { description: "Conversation inbox" },
            401: { description: "Missing or wrong API key" },
          },
        },
      },
      "/api/conversations/by-phone": {
        get: {
          summary: "Get one conversation by WhatsApp number",
          description:
            "Returns the most recent conversation for a phone number, including every stored message as a line-by-line thread. Accepts 078, +250, or 250 formats.",
          parameters: [
            {
              name: "phone",
              in: "query",
              required: true,
              schema: { type: "string", example: "0781111111" },
              description: "WhatsApp number. Spaces and + are ignored.",
            },
          ],
          responses: {
            200: { description: "Full conversation thread" },
            400: { description: "Phone number is missing" },
            401: { description: "Missing or wrong API key" },
            404: { description: "Conversation not found" },
          },
        },
      },
      "/api/messages": {
        post: {
          summary: "Send a client message to the assistant",
          description:
            "The client writes a message and the assistant replies. Include phone to keep the conversation and use CARE plus chat history.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["message"],
                  properties: {
                    message: {
                      type: "string",
                      example: "Hello, what services do you offer?",
                    },
                    phone: {
                      type: "string",
                      example: "250788000000",
                    },
                    name: {
                      type: "string",
                      example: "Alex",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Assistant reply and line-by-line thread" },
            400: { description: "message is required" },
            401: { description: "Missing or wrong API key" },
            503: { description: "OpenAI is not configured" },
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
      "/api/support": {
        get: {
          summary: "List support agents",
          description:
            "Returns distinct support agents derived from imported WOLF visits. Filter by agent name (search), client, location, sector, status, approval, active, contact, or visit date.",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "agent", in: "query", schema: { type: "string" } },
            { name: "client", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "approval", in: "query", schema: { type: "string" } },
            { name: "active", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: {
            200: { description: "Support agent list" },
            401: { description: "Missing or wrong API key" },
          },
        },
      },
      "/api/support/{agentId}": {
        get: {
          summary: "Get one support agent and assigned clients",
          parameters: [
            {
              name: "agentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            { name: "client", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "approval", in: "query", schema: { type: "string" } },
            { name: "active", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: {
            200: { description: "Support agent with assigned clients" },
            400: { description: "Invalid support agent id" },
            404: { description: "Support agent not found" },
          },
        },
      },
      "/api/support/{agentId}/clients": {
        get: {
          summary: "List clients assigned to a support agent",
          parameters: [
            {
              name: "agentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            { name: "client", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "sector", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "approval", in: "query", schema: { type: "string" } },
            { name: "active", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
          ],
          responses: {
            200: { description: "Assigned client list" },
            400: { description: "Invalid support agent id" },
            404: { description: "Support agent not found" },
          },
        },
      },
    },
  });
}

module.exports = { getOpenApi, requestBaseUrl };
