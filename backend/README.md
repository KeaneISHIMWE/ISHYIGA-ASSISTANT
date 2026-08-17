# Ishyiga WhatsApp AI Assistant

Backend for a company WhatsApp assistant: customers message WhatsApp, the server replies with GPT-5.

## Phase 1 — Express server

```bash
cd backend
npm install
npm run dev
```

Health check: [http://localhost:4000/api/health](http://localhost:4000/api/health)

## Phase 2 — PostgreSQL

The app reads `DATABASE_URL` from `.env` and pings the database from `/api/health`.

Docker is **not required** to continue. This machine did not have Docker or a local Postgres install, so Phase 2 uses a hosted Postgres URL. `docker-compose.yml` is ready for later:

```bash
cd backend
docker compose up -d
```

Then set:

```
DATABASE_URL=postgresql://ishyiga:ishyiga@localhost:5432/ishyiga
```

Never commit real API keys or the live `DATABASE_URL`.

## Phase 3 — tables

Create `customers`, `conversations`, and `messages`:

```bash
cd backend
npm run db:migrate
```

Then check [http://localhost:4000/api/health](http://localhost:4000/api/health). `database.schemaReady` should be `true`.

## Phase 4 — WhatsApp webhook

`GET /webhook` is Meta's verification handshake. `POST /webhook` receives incoming events.

The verify token lives in `.env` as `WHATSAPP_VERIFY_TOKEN`. Use the same string later in the Meta dashboard.

Simulate verification:

```powershell
Invoke-WebRequest -Uri "http://localhost:4000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=1158201444"
```

The response body must be the raw challenge `1158201444`, not JSON.

```bash
npm test
```

## Phase 6 — OpenAI (GPT-5)

`POST /api/messages` calls GPT-5 through a dedicated OpenAI service. WhatsApp still does not send a reply.

Put your key in `.env` (do not paste it into chat):

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
```

Run tests:

```powershell
cd backend
npm test
```

Live local check, with `npm run dev` running:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/messages -ContentType "application/json" -Body '{"message":"Hello, what services do you offer?"}'
```

Expect JSON with a `reply` from GPT-5. The server log should include `OpenAI request started` and `OpenAI response received`.
