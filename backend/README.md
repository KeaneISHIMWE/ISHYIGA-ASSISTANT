# Ishyiga WhatsApp AI Assistant

Backend for a company WhatsApp assistant: customers message WhatsApp, the server replies with OpenAI GPT-5.6 Sol.

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

## Phase 6 — OpenAI

`POST /api/messages` calls OpenAI through the official SDK. WhatsApp still does not send a reply.

Put your OpenAI key in `.env` (do not paste it into chat):

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-sol
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

Expect JSON with `"ok": true` and a real `reply`. The server log should include `OpenAI request started` and `OpenAI response received`.

If OpenAI returns a rate limit, timeout, or another API error, the reply is this fallback (the process does not crash):

`Sorry, I didn't get that properly. Could you please explain it to me again?`

## Phase 7 — Webhook to OpenAI

`POST /webhook` still answers Meta with `{ "status": "received" }` first. Then each inbound text is sent to the same OpenAI service. The reply is logged.

Unsupported message types (images, stickers, and so on) are skipped.

## Phase 8 — Send the reply on WhatsApp

After OpenAI returns text, Node calls the WhatsApp Cloud API:

`POST https://graph.facebook.com/{version}/{phone-number-id}/messages`

Meta then delivers that text to the customer. The webhook still answers `{ "status": "received" }` first so Meta does not retry while OpenAI and the send are running.

Needs `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in `.env`. Temporary Meta tokens expire (often about 24 hours). If send logs `auth`, generate a new token in Graph API Explorer and save it locally. Do not paste it into chat.

Live check: keep `npm run dev` and one ngrok tunnel running, then send a text to the test WhatsApp number. Expect logs `OpenAI response received` and `WhatsApp send completed`. The same text should appear in WhatsApp.

If Meta send fails (expired token, rate limit, timeout), the process does not crash. The customer may not see a reply that time.

## Phase 9 — Persist the conversation

After Meta is acknowledged, each text event is stored:

1. Find or create the `customers` row for the WhatsApp number.
2. Find or create one `open` conversation.
3. Save the inbound text as `sender_type = customer`.
4. After OpenAI and the WhatsApp send, save the reply as `sender_type = assistant`.

A database write failure is logged and does not block the WhatsApp reply. Duplicate inbound WhatsApp message ids are ignored.

Health reports `phase: 9`.

## Phase 10 — Chat memory

Before OpenAI runs, the webhook loads every saved message for that open conversation (not including the current inbound text). Those turns are passed as `history` so the model can use the full WhatsApp thread.

If history cannot be loaded, OpenAI still runs with only the current message. The server log `OpenAI request started` includes `historyCount`.

Health reports `phase: 10`.

## Phase 11 — Safer failures

`GET /api/health` now includes `integrations.openaiConfigured` and `integrations.whatsappSendConfigured` (booleans only, no secrets).

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
| `OPENAI_API_KEY` | OpenAI key |
| `OPENAI_MODEL` | Default `gpt-5.6-sol` |

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

## Support visits

`support` is a separate table from WhatsApp `customers`. It stores WOLF admin client visits imported from Excel. There is no foreign key to `customers`, because those rows are WhatsApp numbers, not the Excel client list.

### Table

| Column | Type | Source |
| --- | --- | --- |
| `id` | UUID | Generated |
| `source_row` | integer, unique | Excel `#` |
| `client_name` | text | Client Name |
| `support_agent` | text, nullable | Support Agent |
| `location` | text, nullable | Location |
| `sector` | text, nullable | Sector |
| `visit_at` | timestamptz, nullable | Visit Date (`No date set` → null) |
| `branches` | integer | Branches |
| `status` | text | Status |
| `approval` | text | Approval |
| `active` | boolean | Active / Inactive |
| `contact` | text, nullable | contact |

Duplicates are blocked by `source_row` and by `client_name + support_agent + visit_at`.

### Import

```bash
cd backend
npm run db:migrate
npm run db:import-support
```

Default file: `docs/WOLF_Admin_Clients_September_contacts_filled.xlsx`  
Default sheet: `WOLF_Admin_Clients_September_20`

Optional:

```
SUPPORT_EXCEL_PATH=
SUPPORT_EXCEL_SHEET=
```

The import is safe to run again. Existing `source_row` values are updated, not duplicated. Empty cells, replacement-character locations, and `No date set` are stored as null. Those rows are imported and listed as warnings, not dropped.

### API

Requires `Authorization: Bearer <CONVERSATIONS_API_KEY>` or `X-Api-Key`. Missing or wrong key returns `401`. If the key is not configured, these routes return `503`.

Support agents are not a separate table. They are distinct `support_agent` names on imported visit rows. Agent IDs are slugs of that name, for example `uwimanikunda-lucie`. There is no users/employees table, so agent phone and email are not stored and are not returned.

Client contact comes from `support.contact` on each visit row. 151 of 565 imported rows have no contact. WhatsApp `customers` and CARE profiles are a different domain and are not joined here.

- `GET /api/support` — list agents. Query: `search` (or `agent`), `client`, `location`, `sector`, `status`, `approval`, `active`, `contact`, `from`, `to`. Filters keep agents who have at least one matching visit. `clientsCount` is the matching visit count.
- `GET /api/support/:id` — one agent plus assigned clients. Same visit filters apply to the client list.
- `GET /api/support/:id/clients` — assigned clients only. Same visit filters, including `status=Done`.

Example:

```bash
curl -H "Authorization: Bearer $CONVERSATIONS_API_KEY" \
  "https://<host>/api/support?search=lucie"
```

```json
{
  "agents": [
    {
      "id": "uwimanikunda-lucie",
      "name": "Uwimanikunda lucie",
      "clientsCount": 44
    }
  ],
  "count": 1
}
```

```bash
curl -H "Authorization: Bearer $CONVERSATIONS_API_KEY" \
  "https://<host>/api/support/uwimanikunda-lucie"
```

```json
{
  "agent": {
    "id": "uwimanikunda-lucie",
    "name": "Uwimanikunda lucie",
    "clientsCount": 1,
    "clients": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "TRUSTED PHARMACY LIMITED",
        "location": "KIREHE",
        "sector": "PHARMACY",
        "visitAt": "2026-09-16T13:57:00.000Z",
        "branches": 0,
        "status": "Done",
        "approval": "needs_approval",
        "active": true,
        "contact": "250789220619"
      }
    ]
  }
}
```

Errors:

| Status | Body |
| --- | --- |
| 400 | `{ "error": "Invalid support agent id" }` |
| 401 | `{ "error": "Unauthorized. Send Authorization: Bearer <CONVERSATIONS_API_KEY>." }` |
| 404 | `{ "error": "Support agent not found" }` |
| 503 | `{ "error": "Conversations API is locked. CONVERSATIONS_API_KEY is not configured." }` |

An agent with no visit rows cannot exist in this API, because agents are derived from those rows. Unknown slugs return 404. Filters that match no visits return `200` with an empty list.

