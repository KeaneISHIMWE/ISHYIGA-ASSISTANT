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
              schema: { type: "string", example: "250792431896" },
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
                      example: "250792431896",
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
            503: { description: "Groq is not configured" },
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
