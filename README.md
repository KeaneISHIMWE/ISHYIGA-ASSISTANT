# ISHYIGA Assistant

AI-powered WhatsApp assistant for a company. Customers write on WhatsApp; the backend stores the conversation, generates a reply with Groq, and (in a later step) sends that reply back on WhatsApp.

**Repository:** [KeaneISHIMWE/ISHYIGA-ASSISTANT](https://github.com/KeaneISHIMWE/ISHYIGA-ASSISTANT)

## What it does

1. Meta sends incoming WhatsApp events to `POST /webhook`.
2. The server verifies the request, extracts text messages, and logs them.
3. Inbound text is sent to Groq. If Groq fails (timeout, rate limit, or another API error), the customer-facing text is a safe fallback sentence.
4. Conversation tables exist in PostgreSQL (`customers`, `conversations`, `messages`).
5. Node sends that reply back through the WhatsApp Cloud API.
6. Each inbound and outbound text is stored in PostgreSQL.
7. The next reply includes the full saved conversation history.

## Current status

| Area | Status |
| --- | --- |
| Express API | Ready |
| PostgreSQL + migrations | Ready |
| WhatsApp webhook verify (`GET /webhook`) | Ready |
| Incoming WhatsApp events (`POST /webhook`) | Parsed, logged, and sent to Groq |
| Groq replies (`POST /api/messages`) | Ready |
| Insufficient-quota / API fallback | Ready |
| Send WhatsApp replies | Ready |
| Persist inbound/outbound messages from WhatsApp | Ready |
| Full chat memory for Groq | Ready |
| Safer failures (retry + health flags) | Ready |
| Deploy | Next |

Health endpoint reports `phase: 11`.

## Tech stack

- **Runtime:** Node.js 20+
- **API:** Express 5
- **Database:** PostgreSQL 16 (`pg`), hosted (Neon) or local Docker
- **AI:** Groq Chat Completions via the OpenAI-compatible `openai` SDK
- **Messaging:** WhatsApp Business Cloud API (Meta)
- **Tests:** Node.js built-in test runner

## Project layout

```
ISHYIGA/
├── README.md
├── .gitignore
└── backend/
    ├── src/
    │   ├── server.js              # process entry
    │   ├── app.js                 # Express app and routes
    │   ├── config/                # env + database
    │   ├── controllers/
    │   ├── routes/
    │   ├── services/              # Groq + WhatsApp
    │   ├── models/                # customers, conversations, messages
    │   ├── db/migrations/         # SQL schema
    │   ├── middleware/
    │   └── utils/
    ├── tests/
    ├── docker-compose.yml         # local Postgres
    ├── .env.example
    └── package.json
```

## Prerequisites

- Node.js 20 or newer
- A PostgreSQL database (Neon, another host, or Docker)
- A Groq API key (free tier at [console.groq.com](https://console.groq.com))
- A Meta WhatsApp Business app (for live webhook traffic)

Docker is optional. `backend/docker-compose.yml` starts a local Postgres 16 container when you want one.

## Setup

```bash
git clone https://github.com/KeaneISHIMWE/ISHYIGA-ASSISTANT.git
cd ISHYIGA-ASSISTANT/backend
npm install
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env` instead of `copy`.

Fill in `.env` (never commit this file):

```
PORT=4000
NODE_ENV=development
DATABASE_URL=
WHATSAPP_VERIFY_TOKEN=
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
```

Create the tables:

```bash
npm run db:migrate
```

Start the server:

```bash
npm run dev
```

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

A healthy response looks like:

```json
{
  "status": "ok",
  "service": "ishyiga-whatsapp-assistant",
  "phase": 6,
  "database": {
    "connected": true,
    "schemaReady": true
  }
}
```

### Local Postgres with Docker

```bash
cd backend
docker compose up -d
```

Then set:

```
DATABASE_URL=postgresql://ishyiga:ishyiga@localhost:5432/ishyiga
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No (default `4000`) | HTTP port |
| `NODE_ENV` | No (default `development`) | Runtime mode |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `WHATSAPP_VERIFY_TOKEN` | Yes | Token Meta uses for `GET /webhook` |
| `WHATSAPP_APP_SECRET` | No | If set, `POST /webhook` checks `X-Hub-Signature-256` |
| `WHATSAPP_ACCESS_TOKEN` | For sending replies | Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | For sending replies | WhatsApp sender phone |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Later | Meta business account |
| `GROQ_API_KEY` | For AI replies | Groq authentication |
| `GROQ_MODEL` | No (default `openai/gpt-oss-20b`) | Groq chat model |

Do not commit real keys, tokens, or a live `DATABASE_URL`. `.env` is gitignored; `.env.example` is the template.

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service + database + schema status |
| `POST` | `/api/messages` | Generate a Groq reply from `{ "message": "..." }` |
| `GET` | `/webhook` | Meta webhook verification handshake |
| `POST` | `/webhook` | Incoming WhatsApp events |

Unknown routes return `404`. Unhandled errors return `500` without leaking internals.

### Generate a reply locally

With `npm run dev` running and `GROQ_API_KEY` set:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/messages -ContentType "application/json" -Body '{"message":"Hello, what services do you offer?"}'
```

Expect JSON with a `reply`. Server logs should include `Groq request started` and `Groq response received`.

If Groq is down, times out, or is not configured, the API still returns a safe fallback message instead of crashing.

### WhatsApp webhook verification

Meta calls `GET /webhook` with `hub.mode`, `hub.verify_token`, and `hub.challenge`. The response body must be the **raw challenge string**, not JSON.

```powershell
Invoke-WebRequest -Uri "http://localhost:4000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=1158201444"
```

The body must be exactly `1158201444`.

For live traffic, expose the local server (for example with ngrok) and set the callback URL to `https://<your-host>/webhook`. Subscribe to the `messages` field in the Meta dashboard. Use the same `WHATSAPP_VERIFY_TOKEN` there as in `.env`.

`POST /webhook` accepts WhatsApp Business Account payloads, extracts inbound text, asks Groq for a reply, and sends that reply through the Cloud API.

## Database

Migration: `backend/src/db/migrations/001_create_core_tables.sql`

- **customers** — unique WhatsApp number, optional name
- **conversations** — one open conversation per customer
- **messages** — inbound/outbound text, optional WhatsApp message id

Run `npm run db:migrate` after changing the schema.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with `--watch` on `src/` (restart after `.env` changes) |
| `npm start` | Start without watch |
| `npm test` | Run Groq and WhatsApp service tests |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:up` | Start local Postgres |
| `npm run db:down` | Stop local Postgres |

```bash
cd backend
npm test
```

## Security

- `.env` is never committed.
- Webhook tokens are compared with a timing-safe check.
- Optional HMAC verification of Meta signatures when `WHATSAPP_APP_SECRET` is set.
- Phone numbers are masked in logs.
- Groq errors are classified (timeout, rate limit, auth, quota) and not dumped to clients.

## License

Private / unlicensed. All rights reserved.
