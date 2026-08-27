#!/usr/bin/env python3
"""Generate the Ishyiga Assistant logic-architecture PDF."""

from pathlib import Path

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUTPUT = Path(__file__).with_name("ISHYIGA-Assistant-Logic-Architecture.pdf")
PAGE = A4
WIDTH, HEIGHT = PAGE

NAVY = HexColor("#0B1F3A")
TEAL = HexColor("#0F766E")
GOLD = HexColor("#C4A35A")
INK = HexColor("#1A2332")
MUTED = HexColor("#5B6675")
PAPER = HexColor("#F7F4EE")
CARD = HexColor("#FFFFFF")
SOFT = HexColor("#E8E2D6")
BLUE = HexColor("#1D4E89")
ORANGE = HexColor("#C05621")
RED = HexColor("#9B2C2C")
GREEN = HexColor("#276749")
PURPLE = HexColor("#553C9A")
LIGHT_TEAL = HexColor("#D7EDEA")
LIGHT_GOLD = HexColor("#F4E8C8")
LIGHT_BLUE = HexColor("#D9E6F5")
LIGHT_ORANGE = HexColor("#F6E1D4")
LIGHT_RED = HexColor("#F5D6D6")
LIGHT_PURPLE = HexColor("#E6DFF3")
LIGHT_GREEN = HexColor("#D8EEDD")


def draw_background(c):
    c.setFillColor(PAPER)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, HEIGHT - 16 * mm, WIDTH, 16 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, WIDTH, 8 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, 8 * mm, WIDTH, 1.2 * mm, fill=1, stroke=0)


def header(c, title, page, total):
    c.setFillColor(white)
    c.setFont("Times-Bold", 11)
    c.drawString(16 * mm, HEIGHT - 10 * mm, "ISHYIGA ASSISTANT")
    c.setFont("Times-Italic", 9)
    c.drawRightString(WIDTH - 16 * mm, HEIGHT - 10 * mm, title)
    c.setFillColor(white)
    c.setFont("Times-Roman", 8)
    c.drawCentredString(WIDTH / 2, 3 * mm, f"Confidential internal architecture  ·  Page {page} of {total}")


def h1(c, text, y):
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 18)
    c.drawString(16 * mm, y, text)
    c.setStrokeColor(GOLD)
    c.setLineWidth(1.4)
    c.line(16 * mm, y - 3 * mm, 70 * mm, y - 3 * mm)
    return y - 12 * mm


def paragraph(c, text, x, y, width, size=9.5, leading=13, color=INK):
    c.setFillColor(color)
    c.setFont("Times-Roman", size)
    words = text.split()
    line = ""
    for word in words:
        trial = f"{line} {word}".strip()
        if c.stringWidth(trial, "Times-Roman", size) <= width:
            line = trial
        else:
            c.drawString(x, y, line)
            y -= leading
            line = word
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y


def rounded_box(c, x, y, w, h, fill, stroke, radius=6):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def box_label(c, x, y, w, h, title, subtitle=None, title_size=8.5, sub_size=7):
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", title_size)
    c.drawCentredString(x + w / 2, y + h / 2 + (4 if subtitle else 0), title)
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("Times-Roman", sub_size)
        c.drawCentredString(x + w / 2, y + h / 2 - 8, subtitle)


def arrow(c, x1, y1, x2, y2, color=TEAL):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.4)
    c.line(x1, y1, x2, y2)
    angle_dx = x2 - x1
    angle_dy = y2 - y1
    length = (angle_dx ** 2 + angle_dy ** 2) ** 0.5 or 1
    ux, uy = angle_dx / length, angle_dy / length
    size = 5
    path = c.beginPath()
    path.moveTo(x2, y2)
    path.lineTo(x2 - ux * size - uy * 3, y2 - uy * size + ux * 3)
    path.lineTo(x2 - ux * size + uy * 3, y2 - uy * size - ux * 3)
    path.close()
    c.drawPath(path, fill=1, stroke=0)


def down_arrow(c, x, y1, y2, color=TEAL):
    arrow(c, x, y1, x, y2, color)


def right_arrow(c, x1, x2, y, color=TEAL):
    arrow(c, x1, y, x2, y, color)


def diamond(c, cx, cy, w, h, fill, stroke, text):
    path = c.beginPath()
    path.moveTo(cx, cy + h / 2)
    path.lineTo(cx + w / 2, cy)
    path.lineTo(cx, cy - h / 2)
    path.lineTo(cx - w / 2, cy)
    path.close()
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.drawPath(path, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 7.5)
    for i, line in enumerate(text.split("\n")):
        c.drawCentredString(cx, cy + 4 - i * 9, line)


def legend_item(c, x, y, color, label):
    c.setFillColor(color)
    c.roundRect(x, y, 8, 8, 2, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8)
    c.drawString(x + 12, y + 1, label)


def cover(c, total):
    c.setFillColor(NAVY)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, 18 * mm, HEIGHT, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(18 * mm, 0, 3 * mm, HEIGHT, fill=1, stroke=0)

    c.setFillColor(GOLD)
    c.setFont("Times-Italic", 12)
    c.drawString(36 * mm, HEIGHT - 42 * mm, "INTERNAL ARCHITECTURE DOCUMENT")

    c.setFillColor(white)
    c.setFont("Times-Bold", 32)
    c.drawString(36 * mm, HEIGHT - 62 * mm, "Ishyiga Assistant")
    c.setFont("Times-Bold", 20)
    c.drawString(36 * mm, HEIGHT - 74 * mm, "End-to-end logic structure")

    c.setStrokeColor(GOLD)
    c.setLineWidth(1.2)
    c.line(36 * mm, HEIGHT - 80 * mm, 120 * mm, HEIGHT - 80 * mm)

    c.setFillColor(HexColor("#D7E3F0"))
    c.setFont("Times-Roman", 12)
    c.drawString(36 * mm, HEIGHT - 94 * mm, "WhatsApp Cloud API  →  Express backend  →  Neon Postgres")
    c.drawString(36 * mm, HEIGHT - 102 * mm, "Groq AI  →  Client-info API  →  Personalized system prompt")

    items = [
        "1.  Current live message path, from Meta webhook to WhatsApp reply",
        "2.  Decision tree: duplicates, screenshots, contact rules, fallbacks",
        "3.  Planned / now-wired client API that fills the AI system prompt",
        "4.  Data model, components, failure modes, and how to plug the API in",
    ]
    y = HEIGHT - 128 * mm
    c.setFont("Times-Roman", 11)
    c.setFillColor(white)
    for item in items:
        c.drawString(36 * mm, y, item)
        y -= 9 * mm

    c.setFillColor(GOLD)
    c.setFont("Times-Italic", 10)
    c.drawString(36 * mm, 28 * mm, "23 August 2026  ·  Ishyiga Software  ·  Version 1.0")
    c.setFillColor(HexColor("#9BB0C7"))
    c.setFont("Times-Roman", 8)
    c.drawString(36 * mm, 20 * mm, f"{total} pages  ·  Source of truth: backend/src in the ISHYIGA-ASSISTANT repository")


def page_context(c, page, total):
    draw_background(c)
    header(c, "01  ·  System context", page, total)
    y = h1(c, "Who talks to whom", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "A client writes to the Ishyiga WhatsApp business number. Meta delivers that event to the Railway backend. The backend stores the conversation, looks up the client record when the client API is configured, asks Groq for a reply, and sends that reply back through the WhatsApp Cloud API.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    actors = [
        (18 * mm, y - 42 * mm, 36 * mm, 28 * mm, LIGHT_GOLD, GOLD, "Client", "WhatsApp on phone"),
        (64 * mm, y - 42 * mm, 40 * mm, 28 * mm, LIGHT_BLUE, BLUE, "Meta Cloud API", "Webhook + send + media"),
        (114 * mm, y - 42 * mm, 42 * mm, 28 * mm, LIGHT_TEAL, TEAL, "Ishyiga Backend", "Express on Railway"),
        (166 * mm, y - 42 * mm, 30 * mm, 28 * mm, LIGHT_PURPLE, PURPLE, "Groq", "Chat + vision"),
    ]
    for x, by, w, h, fill, stroke, title, sub in actors:
        rounded_box(c, x, by, w, h, fill, stroke)
        box_label(c, x, by, w, h, title, sub)

    right_arrow(c, 54 * mm, 64 * mm, y - 28 * mm)
    right_arrow(c, 104 * mm, 114 * mm, y - 28 * mm)
    right_arrow(c, 156 * mm, 166 * mm, y - 28 * mm)

    neon_x, neon_y, neon_w, neon_h = 72 * mm, y - 94 * mm, 48 * mm, 26 * mm
    api_x, api_y, api_w, api_h = 132 * mm, y - 94 * mm, 50 * mm, 26 * mm
    rounded_box(c, neon_x, neon_y, neon_w, neon_h, LIGHT_GREEN, GREEN)
    box_label(c, neon_x, neon_y, neon_w, neon_h, "Neon Postgres", "customers / chats / messages")
    rounded_box(c, api_x, api_y, api_w, api_h, LIGHT_ORANGE, ORANGE)
    box_label(c, api_x, api_y, api_w, api_h, "Client info API", "company, TIN, version, plan")

    backend_cx = 135 * mm
    split_y = y - 54 * mm
    neon_cx = neon_x + neon_w / 2
    api_cx = api_x + api_w / 2
    c.setStrokeColor(GREEN)
    c.setLineWidth(1.4)
    c.line(backend_cx, y - 42 * mm, backend_cx, split_y)
    c.line(backend_cx, split_y, neon_cx, split_y)
    arrow(c, neon_cx, split_y, neon_cx, neon_y + neon_h, GREEN)
    c.setStrokeColor(ORANGE)
    c.setDash(3, 2)
    c.setLineWidth(1.4)
    c.line(backend_cx, split_y, api_cx, split_y)
    c.line(api_cx, split_y, api_cx, api_y + api_h + 3)
    c.setDash()
    arrow(c, api_cx, api_y + api_h + 6, api_cx, api_y + api_h, ORANGE)

    c.setFillColor(MUTED)
    c.setFont("Times-Italic", 8)
    c.drawCentredString(neon_x + neon_w / 2, neon_y - 6 * mm, "Always used")
    c.drawCentredString(api_x + api_w / 2, api_y - 6 * mm, "Used when CLIENTS_API_URL is set")

    y = y - 116 * mm
    y = paragraph(
        c,
        "The client API is optional today. If the URL is empty, missing, slow, or returns 404, the assistant still replies using the base Ishyiga support prompt. When you provide the live URL, the same path starts injecting that client's facts into the system prompt automatically.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    legend_item(c, 16 * mm, 16 * mm, GOLD, "Human")
    legend_item(c, 46 * mm, 16 * mm, BLUE, "Meta")
    legend_item(c, 72 * mm, 16 * mm, TEAL, "Backend")
    legend_item(c, 102 * mm, 16 * mm, PURPLE, "AI")
    legend_item(c, 124 * mm, 16 * mm, GREEN, "Database")
    legend_item(c, 158 * mm, 16 * mm, ORANGE, "Client API")


def page_architecture(c, page, total):
    draw_background(c)
    header(c, "02  ·  High-level architecture", page, total)
    y = h1(c, "Layers inside the backend", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "HTTP enters Express. Routes only dispatch. Controllers own the conversation. Services talk to Meta, Groq, Postgres, and the future client API. Models are the only SQL layer.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    layers = [
        (LIGHT_BLUE, BLUE, "HTTP edge", "app.js  ·  /webhook  ·  /api/health  ·  /api/messages"),
        (LIGHT_TEAL, TEAL, "Controllers", "webhookController  ·  healthController  ·  messagesController"),
        (LIGHT_GOLD, GOLD, "Domain services", "whatsappService  ·  conversationService  ·  contactRules  ·  clientProfileService  ·  openaiService"),
        (LIGHT_GREEN, GREEN, "Persistence", "customer / conversation / message models  →  Neon Postgres"),
        (LIGHT_PURPLE, PURPLE, "External AI + Meta", "Groq chat + vision  ·  Graph API v23+ send / typing / media"),
    ]

    box_y = y - 8 * mm
    for fill, stroke, title, body in layers:
        rounded_box(c, 16 * mm, box_y - 22 * mm, WIDTH - 32 * mm, 20 * mm, fill, stroke)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 11)
        c.drawString(22 * mm, box_y - 8 * mm, title)
        c.setFillColor(MUTED)
        c.setFont("Times-Roman", 9)
        c.drawString(22 * mm, box_y - 16 * mm, body)
        box_y -= 26 * mm

    y = box_y - 4 * mm
    paragraph(
        c,
        "Production host: Railway at /webhook and /api/health. Meta live webhook points at Railway, not ngrok. Local development still uses port 4000 plus a tunnel when needed.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )


def page_inbound(c, page, total):
    draw_background(c)
    header(c, "03  ·  Inbound webhook", page, total)
    y = h1(c, "POST /webhook — accept, then work", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "Meta must receive HTTP 200 quickly. The controller verifies the signature, parses the payload, answers 200, and only then processes text and image events. GET /webhook is the one-time verify handshake.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    steps = [
        (LIGHT_BLUE, "1. Raw body kept", "express.json verify stores req.rawBody"),
        (LIGHT_GOLD, "2. HMAC check", "X-Hub-Signature-256 vs WHATSAPP_APP_SECRET"),
        (LIGHT_TEAL, "3. Parse events", "object=whatsapp_business_account, field=messages"),
        (LIGHT_ORANGE, "4. Drop noise", "echo of our own number, stale > 10 min, unsupported types"),
        (LIGHT_GREEN, "5. Reply 200", "JSON { status: received } — Meta is done"),
        (LIGHT_PURPLE, "6. processTextEvents", "async work after the HTTP response"),
    ]

    col_w = 56 * mm
    start_x = 16 * mm
    start_y = y - 8 * mm
    for i, (fill, title, body) in enumerate(steps):
        col = i % 3
        row = i // 3
        x = start_x + col * (col_w + 8 * mm)
        by = start_y - row * 42 * mm - 32 * mm
        rounded_box(c, x, by, col_w, 32 * mm, fill, NAVY)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 10)
        c.drawString(x + 4 * mm, by + 20 * mm, title)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 8)
        paragraph(c, body, x + 4 * mm, by + 12 * mm, col_w - 8 * mm, size=8, leading=11)

    y = start_y - 92 * mm
    y = h1(c, "Filters before a message is treated as work", y + 6 * mm)
    bullets = [
        "Missing from/id, or payload not a WhatsApp business account → reject or ignore.",
        "from equals the business display number → echo ignored.",
        "timestamp older than 10 minutes → stale ignored (avoids replay storms).",
        "Text, image, or image-as-document is kept. Other types become kind=unsupported and never get a reply.",
    ]
    c.setFillColor(INK)
    c.setFont("Times-Roman", 10)
    for bullet in bullets:
        y = paragraph(c, "•  " + bullet, 16 * mm, y, WIDTH - 32 * mm, size=10, leading=14)


def page_message_flow(c, page, total):
    draw_background(c)
    header(c, "04  ·  One inbound message", page, total)
    y = h1(c, "processTextEvents — the live path", HEIGHT - 28 * mm)

    steps = [
        (16 * mm, y - 18 * mm, LIGHT_BLUE, "Mark read + typing", "Graph API typing indicator"),
        (16 * mm, y - 42 * mm, LIGHT_GREEN, "Persist inbound", "customer → open conversation → message"),
        (16 * mm, y - 66 * mm, LIGHT_ORANGE, "Duplicate?", "same WhatsApp message id → stop"),
        (16 * mm, y - 90 * mm, LIGHT_TEAL, "Load history", "prior customer + assistant turns"),
        (16 * mm, y - 114 * mm, LIGHT_GOLD, "CARE lookup", "by this WhatsApp contact only"),
        (16 * mm, y - 138 * mm, LIGHT_PURPLE, "Image?", "download media → vision model"),
        (16 * mm, y - 162 * mm, LIGHT_ORANGE, "Client API", "lookup by WhatsApp number"),
        (16 * mm, y - 186 * mm, LIGHT_TEAL, "Groq generateReply", "base prompt + client record + history"),
        (16 * mm, y - 210 * mm, LIGHT_BLUE, "Wait typing window", "minimum 2 seconds visible"),
        (16 * mm, y - 234 * mm, LIGHT_GREEN, "Send + persist outbound", "only persist if Meta accepted the send"),
    ]

    for x, by, fill, title, sub in steps:
        rounded_box(c, x, by - 8 * mm, 88 * mm, 18 * mm, fill, NAVY, 5)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 9)
        c.drawString(x + 4 * mm, by + 2 * mm, title)
        c.setFillColor(MUTED)
        c.setFont("Times-Roman", 7.5)
        c.drawString(x + 4 * mm, by - 5 * mm, sub)

    notes = [
        (112 * mm, y - 18 * mm, "Typing starts immediately so the client sees activity while we work."),
        (112 * mm, y - 50 * mm, "Unique WhatsApp message ids prevent double replies on Meta retries."),
        (112 * mm, y - 90 * mm, "History excludes the current inbound id so Groq does not see it twice."),
        (112 * mm, y - 122 * mm, "Every contact uses CARE + Groq. There is no test-number shortcut."),
        (112 * mm, y - 154 * mm, "Unreadable screenshot → fixed sentence, no Groq call."),
        (112 * mm, y - 186 * mm, "Client API failure is fail-open: empty context, still call Groq."),
        (112 * mm, y - 218 * mm, "If send fails, the assistant text is not stored as a delivered reply."),
    ]
    for x, ny, text in notes:
        rounded_box(c, x, ny - 14 * mm, 82 * mm, 22 * mm, CARD, SOFT, 4)
        paragraph(c, text, x + 3 * mm, ny + 2 * mm, 76 * mm, size=8, leading=11, color=INK)


def page_decision(c, page, total):
    draw_background(c)
    header(c, "05  ·  Reply decision tree", page, total)
    y = h1(c, "What reply is sent?", HEIGHT - 28 * mm)

    diamond(c, 105 * mm, y - 8 * mm, 52 * mm, 22 * mm, LIGHT_GOLD, GOLD, "Inbound kind\ntext or image?")
    rounded_box(c, 16 * mm, y - 18 * mm, 42 * mm, 16 * mm, LIGHT_RED, RED, 4)
    box_label(c, 16 * mm, y - 18 * mm, 42 * mm, 16 * mm, "Ignore", "unsupported / empty")
    arrow(c, 79 * mm, y - 8 * mm, 58 * mm, y - 8 * mm, RED)

    diamond(c, 105 * mm, y - 42 * mm, 52 * mm, 20 * mm, LIGHT_ORANGE, ORANGE, "Duplicate\nWhatsApp id?")
    down_arrow(c, 105 * mm, y - 19 * mm, y - 32 * mm)
    rounded_box(c, 158 * mm, y - 50 * mm, 36 * mm, 16 * mm, LIGHT_RED, RED, 4)
    box_label(c, 158 * mm, y - 50 * mm, 36 * mm, 16 * mm, "Stop", "no second reply")
    right_arrow(c, 131 * mm, 158 * mm, y - 42 * mm, RED)

    diamond(c, 105 * mm, y - 76 * mm, 52 * mm, 20 * mm, LIGHT_GOLD, GOLD, "CARE record\nfor this phone?")
    down_arrow(c, 105 * mm, y - 52 * mm, y - 66 * mm)
    rounded_box(c, 16 * mm, y - 84 * mm, 42 * mm, 16 * mm, LIGHT_GREEN, GREEN, 4)
    box_label(c, 16 * mm, y - 84 * mm, 42 * mm, 16 * mm, "Add context", "this contact only")
    arrow(c, 79 * mm, y - 76 * mm, 58 * mm, y - 76 * mm, GREEN)

    diamond(c, 105 * mm, y - 110 * mm, 52 * mm, 20 * mm, LIGHT_PURPLE, PURPLE, "Image and\nmedia failed?")
    down_arrow(c, 105 * mm, y - 86 * mm, y - 100 * mm)
    rounded_box(c, 158 * mm, y - 118 * mm, 36 * mm, 16 * mm, LIGHT_ORANGE, ORANGE, 4)
    box_label(c, 158 * mm, y - 118 * mm, 36 * mm, 16 * mm, "Resend text", "fixed sentence")
    right_arrow(c, 131 * mm, 158 * mm, y - 110 * mm, ORANGE)

    diamond(c, 105 * mm, y - 144 * mm, 52 * mm, 20 * mm, LIGHT_TEAL, TEAL, "Client API\nhas a record?")
    down_arrow(c, 105 * mm, y - 120 * mm, y - 134 * mm)
    rounded_box(c, 16 * mm, y - 152 * mm, 42 * mm, 16 * mm, LIGHT_ORANGE, ORANGE, 4)
    box_label(c, 16 * mm, y - 152 * mm, 42 * mm, 16 * mm, "Base prompt", "API empty / down")
    rounded_box(c, 158 * mm, y - 152 * mm, 36 * mm, 16 * mm, LIGHT_TEAL, TEAL, 4)
    box_label(c, 158 * mm, y - 152 * mm, 36 * mm, 16 * mm, "Prompt + facts", "name, TIN, version")
    arrow(c, 79 * mm, y - 144 * mm, 58 * mm, y - 144 * mm, MUTED)
    right_arrow(c, 131 * mm, 158 * mm, y - 144 * mm, TEAL)

    rounded_box(c, 74 * mm, y - 190 * mm, 62 * mm, 20 * mm, LIGHT_PURPLE, PURPLE, 5)
    box_label(c, 74 * mm, y - 190 * mm, 62 * mm, 20 * mm, "Groq completion", "chat or vision model")
    down_arrow(c, 105 * mm, y - 154 * mm, y - 170 * mm)

    diamond(c, 105 * mm, y - 220 * mm, 48 * mm, 18 * mm, LIGHT_BLUE, BLUE, "Model empty\nor error?")
    down_arrow(c, 105 * mm, y - 190 * mm, y - 211 * mm)
    rounded_box(c, 16 * mm, y - 228 * mm, 42 * mm, 16 * mm, LIGHT_RED, RED, 4)
    box_label(c, 16 * mm, y - 228 * mm, 42 * mm, 16 * mm, "Fallback sentence", "safe, no secrets")
    rounded_box(c, 158 * mm, y - 228 * mm, 36 * mm, 16 * mm, LIGHT_GREEN, GREEN, 4)
    box_label(c, 158 * mm, y - 228 * mm, 36 * mm, 16 * mm, "Model reply", "send on WhatsApp")
    arrow(c, 81 * mm, y - 220 * mm, 58 * mm, y - 220 * mm, RED)
    right_arrow(c, 129 * mm, 158 * mm, y - 220 * mm, GREEN)


def page_client_api(c, page, total):
    draw_background(c)
    header(c, "06  ·  Client API → system prompt", page, total)
    y = h1(c, "How client facts enter the AI", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "This is the path that becomes live the moment you give CLIENTS_API_URL. The backend looks up the sender's WhatsApp number, normalizes whatever JSON the API returns, and appends a CURRENT CLIENT RECORD block under the fixed Ishyiga support prompt.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    boxes = [
        (16 * mm, y - 36 * mm, 40 * mm, 28 * mm, LIGHT_BLUE, "WhatsApp from", "2507XXXXXXXX"),
        (64 * mm, y - 36 * mm, 44 * mm, 28 * mm, LIGHT_ORANGE, "GET client API", "?phone= or /{phone}"),
        (116 * mm, y - 36 * mm, 40 * mm, 28 * mm, LIGHT_GOLD, "Normalize fields", "name, company, TIN…"),
        (164 * mm, y - 36 * mm, 30 * mm, 28 * mm, LIGHT_TEAL, "5 min cache", "same number"),
    ]
    for x, by, w, h, fill, title, sub in boxes:
        rounded_box(c, x, by, w, h, fill, NAVY, 5)
        box_label(c, x, by, w, h, title, sub)
    right_arrow(c, 56 * mm, 64 * mm, y - 22 * mm)
    right_arrow(c, 108 * mm, 116 * mm, y - 22 * mm)
    right_arrow(c, 156 * mm, 164 * mm, y - 22 * mm)

    y = y - 52 * mm
    rounded_box(c, 16 * mm, y - 52 * mm, WIDTH - 32 * mm, 48 * mm, CARD, TEAL, 6)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 11)
    c.drawString(22 * mm, y - 10 * mm, "Assembled Groq input")
    c.setFillColor(INK)
    c.setFont("Times-Roman", 9)
    c.drawString(22 * mm, y - 22 * mm, "1. SYSTEM  =  fixed Ishyiga support prompt  +  optional CURRENT CLIENT RECORD")
    c.drawString(22 * mm, y - 32 * mm, "2. HISTORY = previous customer and assistant messages from Postgres")
    c.drawString(22 * mm, y - 42 * mm, "3. USER    =  this inbound text, plus screenshot bytes when the message is an image")

    y = y - 68 * mm
    y = h1(c, "Accepted API shapes (no rewrite when you send the URL)", y)
    bullets = [
        "GET {CLIENTS_API_URL}?phone=2507…   or   GET https://host/clients/{phone}",
        "Optional header: Authorization: Bearer {CLIENTS_API_KEY}",
        "JSON may be flat, or wrapped as data / client / customer / profile.",
        "Field aliases are accepted: full_name, business_name, tin_number, app_version, city, package…",
        "404 or empty object → no client block. Timeout or 5xx → no client block, Groq still runs.",
        "Nothing is invented. The model is told to ask the client if a field is missing.",
    ]
    for bullet in bullets:
        y = paragraph(c, "•  " + bullet, 16 * mm, y, WIDTH - 32 * mm, size=10, leading=13.5)


def page_sequence(c, page, total):
    draw_background(c)
    header(c, "07  ·  Sequence", page, total)
    y = h1(c, "Happy-path timing", HEIGHT - 28 * mm)

    actors = ["Client", "Meta", "Backend", "Postgres", "Client API", "Groq"]
    xs = [24 * mm, 56 * mm, 90 * mm, 124 * mm, 158 * mm, 190 * mm]
    top = y - 4 * mm
    bottom = 28 * mm

    for x, name in zip(xs, actors):
        rounded_box(c, x - 14 * mm, top, 28 * mm, 10 * mm, LIGHT_TEAL, TEAL, 3)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 7)
        c.drawCentredString(x, top + 3.5 * mm, name)
        c.setStrokeColor(SOFT)
        c.setDash(1, 2)
        c.setLineWidth(0.8)
        c.line(x, top, x, bottom)
        c.setDash()

    events = [
        (0, 1, "WhatsApp text / screenshot", 0),
        (1, 2, "POST /webhook  +  200 received", 1),
        (2, 1, "read + typing", 2),
        (2, 3, "save inbound + load history", 3),
        (2, 4, "GET client by phone", 4),
        (4, 2, "profile JSON or 404", 5),
        (2, 5, "system + history + user", 6),
        (5, 2, "assistant reply", 7),
        (2, 1, "Cloud API send text", 8),
        (1, 0, "deliver to phone", 9),
        (2, 3, "save outbound if send ok", 10),
    ]

    start_y = top - 16 * mm
    for i, (a, b, label, _idx) in enumerate(events):
        ey = start_y - i * 14
        x1, x2 = xs[a], xs[b]
        c.setStrokeColor(TEAL if a < b else GOLD)
        c.setFillColor(TEAL if a < b else GOLD)
        c.setLineWidth(1.1)
        c.line(x1, ey, x2, ey)
        c.circle(x2, ey, 1.6, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 7)
        mid = (x1 + x2) / 2
        c.drawCentredString(mid, ey + 2.4, label)


def page_data(c, page, total):
    draw_background(c)
    header(c, "08  ·  Data model", page, total)
    y = h1(c, "What Postgres remembers", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "The client API is a live lookup. It is not copied into these tables. Postgres only stores the WhatsApp identity and the chat so the next Groq call has memory.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    tables = [
        (16 * mm, "customers", ["id  UUID PK", "whatsapp_number  UNIQUE", "name", "created_at / updated_at"], LIGHT_GREEN),
        (76 * mm, "conversations", ["id  UUID PK", "customer_id  FK", "status  open | closed", "one open row per customer"], LIGHT_TEAL),
        (136 * mm, "messages", ["id  UUID PK", "conversation_id  FK", "whatsapp_message_id UNIQUE", "sender_type  customer | assistant", "message + message_type"], LIGHT_GOLD),
    ]
    for x, title, rows, fill in tables:
        rounded_box(c, x, y - 78 * mm, 56 * mm, 74 * mm, fill, NAVY, 6)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 11)
        c.drawString(x + 4 * mm, y - 10 * mm, title)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 8)
        ty = y - 22 * mm
        for row in rows:
            c.drawString(x + 4 * mm, ty, "•  " + row)
            ty -= 10 * mm

    y = y - 96 * mm
    y = h1(c, "Runtime cache (not in Postgres)", y)
    paragraph(
        c,
        "clientProfileService keeps a 5-minute in-memory cache keyed by digits-only phone. A 404 is also cached so a unknown number does not hit the client API on every follow-up message. Process restart clears the cache. This is safe: the next message simply refetches.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )


def page_components(c, page, total):
    draw_background(c)
    header(c, "09  ·  Files and responsibilities", page, total)
    y = h1(c, "Where each rule lives", HEIGHT - 28 * mm)

    rows = [
        ("routes/webhook.js", "GET verify + POST receive"),
        ("controllers/webhookController.js", "Orchestrates one inbound event end to end"),
        ("services/whatsappService.js", "Signature, parse, typing, media, send"),
        ("services/conversationService.js", "Find/create customer + conversation + messages"),
        ("services/contactRules.js", "Normalize WhatsApp phone digits"),
        ("services/clientProfileService.js", "Client API lookup, normalize, prompt block"),
        ("services/openaiService.js", "Base SYSTEM_PROMPT + Groq chat/vision"),
        ("config/env.js", "CLIENTS_API_URL / KEY / TIMEOUT_MS"),
        ("models/* + migrations", "Postgres schema and queries"),
        ("/api/messages", "Local Groq test without WhatsApp"),
        ("/api/health", "DB + Groq + WhatsApp + clientsApiConfigured"),
    ]

    for i, (left, right) in enumerate(rows):
        by = y - i * 14 * mm
        fill = LIGHT_TEAL if i % 2 == 0 else CARD
        rounded_box(c, 16 * mm, by - 10 * mm, WIDTH - 32 * mm, 12 * mm, fill, SOFT, 3)
        c.setFillColor(NAVY)
        c.setFont("Times-Bold", 8.5)
        c.drawString(20 * mm, by - 6 * mm, left)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 8.5)
        c.drawString(92 * mm, by - 6 * mm, right)


def page_failures(c, page, total):
    draw_background(c)
    header(c, "10  ·  Failure modes", page, total)
    y = h1(c, "The process stays up", HEIGHT - 28 * mm)

    rows = [
        ("Invalid Meta signature", "403, no processing"),
        ("Malformed payload", "400, no processing"),
        ("Echo / stale / unsupported", "Logged, no reply"),
        ("Duplicate WhatsApp id", "Inbound saved once, no second reply"),
        ("Read/typing fails", "Continue; still generate and send"),
        ("History load fails", "Empty history, still reply"),
        ("Client API down / timeout", "Empty client block, still Groq"),
        ("Client API 404", "Unknown client, still Groq"),
        ("Screenshot download fails", "Fixed resend sentence, no Groq"),
        ("Groq timeout / 429 / auth", "Safe fallback sentence"),
        ("WhatsApp send fails", "Reply not persisted as delivered"),
        ("Special contact rule", "Bypasses Groq and client API"),
    ]

    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 10)
    c.drawString(18 * mm, y, "If this happens")
    c.drawString(110 * mm, y, "What the system does")
    y -= 8 * mm
    for i, (left, right) in enumerate(rows):
        by = y - i * 11 * mm
        if i % 2 == 0:
            c.setFillColor(SOFT)
            c.rect(16 * mm, by - 4 * mm, WIDTH - 32 * mm, 11 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Times-Roman", 9)
        c.drawString(18 * mm, by, left)
        c.drawString(110 * mm, by, right)


def page_plug_in(c, page, total):
    draw_background(c)
    header(c, "11  ·  How to plug in the client API", page, total)
    y = h1(c, "When you give the API, this is all that changes", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "The lookup, prompt assembly, cache, and fail-open behaviour are already in the backend. You do not need a new webhook path. Set three environment variables on Railway (and locally) and restart.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    rounded_box(c, 16 * mm, y - 48 * mm, WIDTH - 32 * mm, 44 * mm, NAVY, NAVY, 6)
    c.setFillColor(GOLD)
    c.setFont("Times-Bold", 9)
    c.drawString(22 * mm, y - 10 * mm, "Environment")
    c.setFillColor(white)
    c.setFont("Courier", 8.5)
    c.drawString(22 * mm, y - 20 * mm, "CLIENTS_API_URL=https://your-host/api/clients")
    c.drawString(22 * mm, y - 28 * mm, "CLIENTS_API_URL=https://your-host/api/clients/{phone}")
    c.drawString(22 * mm, y - 36 * mm, "CLIENTS_API_KEY=optional-bearer-token")
    c.drawString(22 * mm, y - 44 * mm, "CLIENTS_API_TIMEOUT_MS=8000")

    y = y - 62 * mm
    y = h1(c, "Preferred JSON (any extra fields are ignored)", y)
    rounded_box(c, 16 * mm, y - 58 * mm, WIDTH - 32 * mm, 54 * mm, CARD, TEAL, 6)
    c.setFillColor(INK)
    c.setFont("Courier", 8)
    sample = [
        "{",
        '  "name": "Jean Uwimana",',
        '  "company": "Kigali Mart",',
        '  "tin": "102345678",',
        '  "software": "Ishyiga",',
        '  "version": "4.2.1",',
        '  "plan": "Standard",',
        '  "location": "Kigali",',
        '  "notes": "Prefers Kinyarwanda"',
        "}",
    ]
    sy = y - 8 * mm
    for line in sample:
        c.drawString(22 * mm, sy, line)
        sy -= 4.6 * mm

    y = y - 70 * mm
    y = paragraph(
        c,
        "If your API already uses different names (full_name, business_name, tin_number, app_version), leave it as-is. The adapter maps those aliases. If the contract is completely different (POST body, nested list, custom auth header), send the spec and only the adapter in clientProfileService.js needs a small update.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )
    paragraph(
        c,
        "Health check: GET /api/health → integrations.clientsApiConfigured becomes true once CLIENTS_API_URL is set. The WhatsApp number used for lookup is digits-only, so +250 788 880 066 and 250788880066 are the same client.",
        16 * mm,
        y - 4 * mm,
        WIDTH - 32 * mm,
    )


def page_prompt(c, page, total):
    draw_background(c)
    header(c, "12  ·  What the model is allowed to know", page, total)
    y = h1(c, "Two-layer system prompt", HEIGHT - 28 * mm)
    y = paragraph(
        c,
        "Layer A is always present. It is the Ishyiga Software support constitution: personality, troubleshooting method, RRA rules, security, language, and WhatsApp style. Layer B is only present when the client API returned a usable record for this contact.",
        16 * mm,
        y,
        WIDTH - 32 * mm,
    )

    rounded_box(c, 16 * mm, y - 70 * mm, 88 * mm, 66 * mm, LIGHT_TEAL, TEAL, 6)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 11)
    c.drawString(22 * mm, y - 10 * mm, "Layer A — always")
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8.5)
    lines_a = [
        "Role: Ishyiga support assistant",
        "Tone: patient, human, not robotic",
        "Diagnose before assuming cause",
        "Network, version, DB, RRA, credentials",
        "Ask for screenshots when useful",
        "Never invent status, versions, tickets",
        "Never request passwords or tokens",
        "Match the client's language",
        "Use CARE facts for this contact only",
    ]
    ay = y - 22 * mm
    for line in lines_a:
        c.drawString(22 * mm, ay, "•  " + line)
        ay -= 5.2 * mm

    rounded_box(c, 110 * mm, y - 70 * mm, 84 * mm, 66 * mm, LIGHT_ORANGE, ORANGE, 6)
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 11)
    c.drawString(116 * mm, y - 10 * mm, "Layer B — when API hits")
    c.setFillColor(INK)
    c.setFont("Times-Roman", 8.5)
    lines_b = [
        "Name and company",
        "TIN if the API sent it",
        "Installed product / version",
        "Plan or license",
        "Location / branch",
        "Support notes",
        "Do not invent missing fields",
        "Do not leak identifiers casually",
        "Use facts already known",
    ]
    by = y - 22 * mm
    for line in lines_b:
        c.drawString(116 * mm, by, "•  " + line)
        by -= 5.2 * mm

    y = y - 86 * mm
    y = h1(c, "Security boundaries", y)
    bullets = [
        "Phone numbers are masked in logs (**** last 4).",
        "Client API key stays in environment variables, never in git.",
        "Webhook HMAC is checked when WHATSAPP_APP_SECRET is set.",
        "The model is forbidden from asking for passwords, tokens, or database secrets.",
        "TIN and email from the client API are for the model's context, not for broadcasting.",
    ]
    for bullet in bullets:
        y = paragraph(c, "•  " + bullet, 16 * mm, y, WIDTH - 32 * mm, size=10, leading=14)


def build():
    pages = [
        cover,
        page_context,
        page_architecture,
        page_inbound,
        page_message_flow,
        page_decision,
        page_client_api,
        page_sequence,
        page_data,
        page_components,
        page_failures,
        page_plug_in,
        page_prompt,
    ]
    total = len(pages)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=PAGE)
    c.setTitle("Ishyiga Assistant — Logic Architecture")
    c.setAuthor("Ishyiga Software")
    c.setSubject("End-to-end WhatsApp AI logic, including client-API system prompt injection")

    cover(c, total)
    c.showPage()
    for index, draw in enumerate(pages[1:], start=2):
        draw(c, index, total)
        c.showPage()
    c.save()
    print(OUTPUT)


if __name__ == "__main__":
    build()
