# Ishyiga WhatsApp AI Assistant

Backend for a company WhatsApp assistant: customers message WhatsApp, the server replies with Groq.

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

## Phase 6 — Groq

`POST /api/messages` calls Groq through the existing OpenAI-compatible client. WhatsApp still does not send a reply.

Create a free key at [console.groq.com/keys](https://console.groq.com/keys) and put it in `.env` (do not paste it into chat):

```
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
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

Expect JSON with `"ok": true` and a real `reply`. The server log should include `Groq request started` and `Groq response received`.

If Groq returns a rate limit, timeout, or another API error, the reply is this fallback (the process does not crash):

`Sorry, I could not generate a reply just now. Please try again in a moment.`

## Phase 7 — Webhook to Groq

`POST /webhook` still answers Meta with `{ "status": "received" }` first. Then each inbound text is sent to the same Groq service. The reply is logged.

Unsupported message types (images, stickers, and so on) are skipped.

## Phase 8 — Send the reply on WhatsApp

After Groq returns text, Node calls the WhatsApp Cloud API:

`POST https://graph.facebook.com/{version}/{phone-number-id}/messages`

Meta then delivers that text to the customer. The webhook still answers `{ "status": "received" }` first so Meta does not retry while Groq and the send are running.

Needs `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in `.env`. Temporary Meta tokens expire (often about 24 hours). If send logs `auth`, generate a new token in Graph API Explorer and save it locally. Do not paste it into chat.

Live check: keep `npm run dev` and one ngrok tunnel running, then send a text to the test WhatsApp number. Expect logs `Groq response received` and `WhatsApp send completed`. The same text should appear in WhatsApp.

If Meta send fails (expired token, rate limit, timeout), the process does not crash. The customer may not see a reply that time.

## Phase 9 — Persist the conversation

After Meta is acknowledged, each text event is stored:

1. Find or create the `customers` row for the WhatsApp number.
2. Find or create one `open` conversation.
3. Save the inbound text as `sender_type = customer`.
4. After Groq and the WhatsApp send, save the reply as `sender_type = assistant`.

A database write failure is logged and does not block the WhatsApp reply. Duplicate inbound WhatsApp message ids are ignored.

Health reports `phase: 9`.

## Phase 10 — Chat memory

Before Groq runs, the webhook loads every saved message for that open conversation (not including the current inbound text). Those turns are passed as `history` so the model can use the full WhatsApp thread.

If history cannot be loaded, Groq still runs with only the current message. The server log `Groq request started` includes `historyCount`.

Health reports `phase: 10`.

## Phase 11 — Safer failures

`GET /api/health` now includes `integrations.groqConfigured` and `integrations.whatsappSendConfigured` (booleans only, no secrets).

WhatsApp send retries **once** on timeout, rate limit, or Meta 5xx. Auth and bad input are not retried.

An assistant reply is stored only if Meta accepted the send, so memory does not keep a message the customer never saw.

Health reports `phase: 11`.

## Phase 12 — Production deploy

The host must run from the `backend/` folder. On first start it applies migrations, then listens on `0.0.0.0:$PORT`.

```bash
cd backend
npm run start:prod
```

`GET /api/health` is the platform health check. A live service reports `phase: 12`.

### Environment variables on the host

Copy values from local `.env`. Do not commit them.

| Variable | Required |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon (or other hosted Postgres) URL |
| `WHATSAPP_VERIFY_TOKEN` | Same string you will put in Meta |
| `WHATSAPP_ACCESS_TOKEN` | Long-lived Meta token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp sender id |
| `WHATSAPP_APP_SECRET` | Recommended so webhook signatures are checked |
| `GROQ_API_KEY` | Groq key |
| `GROQ_MODEL` | Default `openai/gpt-oss-20b` |

`PORT` is set by Railway/Render. SSL is turned on automatically for Neon URLs and for `NODE_ENV=production`.

### Railway

1. Push this repo to GitHub.
2. New project → Deploy from GitHub.
3. Set **Root Directory** to `backend`.
4. Add the variables above.
5. Deploy. Open `https://<your-app>.up.railway.app/api/health`.

`backend/railway.toml` already sets `npm run start:prod` and the health path.

### Render

1. New **Web Service** from the same GitHub repo, or use the root `render.yaml` blueprint.
2. **Root Directory:** `backend`.
3. **Build:** `npm ci --omit=dev`
4. **Start:** `npm run start:prod`
5. Add the same variables, then deploy.
6. Open `https://<your-app>.onrender.com/api/health`.

### Point Meta at the public URL

In Meta → WhatsApp → Configuration, set the callback URL to:

`https://<your-host>/webhook`

Use the same verify token as `WHATSAPP_VERIFY_TOKEN`. Subscribe to `messages`. After that, ngrok is no longer needed.
