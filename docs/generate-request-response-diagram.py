#!/usr/bin/env python3
"""One-page WhatsApp request-to-response diagram."""

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

OUTPUT_PDF = Path(__file__).with_name("ISHYIGA-WhatsApp-Request-to-Response.pdf")
OUTPUT_PNG = Path(__file__).with_name("ISHYIGA-WhatsApp-Request-to-Response.png")
PAGE = landscape(A4)
WIDTH, HEIGHT = PAGE

NAVY = HexColor("#0B1F3A")
TEAL = HexColor("#0F766E")
GOLD = HexColor("#C4A35A")
INK = HexColor("#1A2332")
MUTED = HexColor("#5B6675")
PAPER = HexColor("#F4F0E6")
BLUE = HexColor("#1D4E89")
ORANGE = HexColor("#C05621")
GREEN = HexColor("#276749")
PURPLE = HexColor("#4C1D95")
LIGHT_GOLD = HexColor("#F4E8C8")
LIGHT_BLUE = HexColor("#D9E6F5")
LIGHT_TEAL = HexColor("#D7EDEA")
LIGHT_GREEN = HexColor("#D8EEDD")
LIGHT_ORANGE = HexColor("#F6E1D4")
LIGHT_PURPLE = HexColor("#E6DFF3")


def rounded(c, x, y, w, h, fill, stroke):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.6)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)


def arrow(c, x1, y1, x2, y2, color=TEAL):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(2)
    c.line(x1, y1, x2, y2)
    dx, dy = x2 - x1, y2 - y1
    length = (dx ** 2 + dy ** 2) ** 0.5 or 1
    ux, uy = dx / length, dy / length
    size = 7
    path = c.beginPath()
    path.moveTo(x2, y2)
    path.lineTo(x2 - ux * size - uy * 3.4, y2 - uy * size + ux * 3.4)
    path.lineTo(x2 - ux * size + uy * 3.4, y2 - uy * size - ux * 3.4)
    path.close()
    c.drawPath(path, fill=1, stroke=0)


def step(c, x, y, w, h, fill, stroke, number, title, meaning):
    rounded(c, x, y, w, h, fill, stroke)
    c.setFillColor(stroke)
    c.circle(x + 8 * mm, y + h - 8 * mm, 5.2 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Times-Bold", 12)
    c.drawCentredString(x + 8 * mm, y + h - 10 * mm, str(number))
    c.setFillColor(NAVY)
    c.setFont("Times-Bold", 12)
    c.drawString(x + 16 * mm, y + h - 11 * mm, title)
    c.setFillColor(INK)
    c.setFont("Times-Roman", 9)
    words = meaning.split()
    line = ""
    text_y = y + h - 22 * mm
    width = w - 12 * mm
    for word in words:
        trial = f"{line} {word}".strip()
        if c.stringWidth(trial, "Times-Roman", 9) <= width:
            line = trial
        else:
            c.drawString(x + 6 * mm, text_y, line)
            text_y -= 12
            line = word
    if line:
        c.drawString(x + 6 * mm, text_y, line)


def build():
    c = canvas.Canvas(str(OUTPUT_PDF), pagesize=PAGE)
    c.setTitle("Ishyiga Assistant — WhatsApp request to response")
    c.setAuthor("Ishyiga Software")

    c.setFillColor(PAPER)
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.rect(0, HEIGHT - 22 * mm, WIDTH, 22 * mm, fill=1, stroke=0)
    c.setFillColor(GOLD)
    c.rect(0, HEIGHT - 24 * mm, WIDTH, 2 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, WIDTH, 10 * mm, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Times-Bold", 18)
    c.drawString(14 * mm, HEIGHT - 13 * mm, "Ishyiga Assistant")
    c.setFont("Times-Italic", 12)
    c.drawRightString(WIDTH - 14 * mm, HEIGHT - 13 * mm, "WhatsApp request  →  WhatsApp response")

    # Top row: request path
    box_w, box_h = 58 * mm, 38 * mm
    top_y = HEIGHT - 78 * mm
    gap = 12 * mm
    start_x = 12 * mm

    tops = [
        (LIGHT_GOLD, GOLD, "1", "Client writes", "The client sends a WhatsApp message to Ishyiga."),
        (LIGHT_BLUE, BLUE, "2", "WhatsApp delivers it", "WhatsApp sends that message to the Ishyiga server."),
        (LIGHT_TEAL, TEAL, "3", "Server reads it", "The server checks the message and opens the client's conversation."),
        (LIGHT_GREEN, GREEN, "4", "Conversation is saved", "The message is stored so the next reply can remember this chat."),
    ]
    xs = []
    for i, (fill, stroke, number, title, meaning) in enumerate(tops):
        x = start_x + i * (box_w + gap)
        xs.append(x)
        step(c, x, top_y, box_w, box_h, fill, stroke, number, title, meaning)
        if i:
            arrow(c, xs[i - 1] + box_w, top_y + box_h / 2, x - 1.5 * mm, top_y + box_h / 2)

    # Mid: client API + OpenAI
    mid_y = HEIGHT - 136 * mm
    mid_w = 88 * mm
    left_x = 48 * mm
    right_x = WIDTH - 48 * mm - mid_w
    step(
        c,
        left_x,
        mid_y,
        mid_w,
        box_h,
        LIGHT_ORANGE,
        ORANGE,
        "5",
        "Load this client",
        "The server asks the client API who this WhatsApp number is, then puts those facts into the AI prompt.",
    )
    step(
        c,
        right_x,
        mid_y,
        mid_w,
        box_h,
        LIGHT_PURPLE,
        PURPLE,
        "6",
        "OpenAI writes the reply",
        "OpenAI reads the support rules, the client record, and the chat, then writes a human reply.",
    )

    # Connect 4 down-split to 5 and 6
    from4_x = xs[3] + box_w / 2
    from4_y = top_y
    split_y = top_y - 10 * mm
    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.line(from4_x, from4_y, from4_x, split_y)
    c.line(left_x + mid_w / 2, split_y, right_x + mid_w / 2, split_y)
    arrow(c, left_x + mid_w / 2, split_y, left_x + mid_w / 2, mid_y + box_h)
    arrow(c, right_x + mid_w / 2, split_y, right_x + mid_w / 2, mid_y + box_h)
    arrow(c, left_x + mid_w, mid_y + box_h / 2, right_x - 1.5 * mm, mid_y + box_h / 2, ORANGE)

    # Bottom row: response path
    bot_y = 28 * mm
    bottoms = [
        (LIGHT_TEAL, TEAL, "7", "Server prepares the answer", "The typed reply is ready to send back on WhatsApp."),
        (LIGHT_BLUE, BLUE, "8", "WhatsApp sends it", "WhatsApp delivers the assistant message to the same chat."),
        (LIGHT_GOLD, GOLD, "9", "Client reads the reply", "The client sees the answer in WhatsApp."),
    ]
    bot_w = 78 * mm
    bot_gap = 16 * mm
    bot_start = (WIDTH - (3 * bot_w + 2 * bot_gap)) / 2
    bot_xs = []
    for i, (fill, stroke, number, title, meaning) in enumerate(bottoms):
        x = bot_start + i * (bot_w + bot_gap)
        bot_xs.append(x)
        step(c, x, bot_y, bot_w, box_h, fill, stroke, number, title, meaning)
        if i:
            arrow(c, bot_xs[i - 1] + bot_w, bot_y + box_h / 2, x - 1.5 * mm, bot_y + box_h / 2)

    join_y = mid_y - 10 * mm
    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.line(right_x + mid_w / 2, mid_y, right_x + mid_w / 2, join_y)
    c.line(right_x + mid_w / 2, join_y, bot_xs[0] + bot_w / 2, join_y)
    arrow(c, bot_xs[0] + bot_w / 2, join_y, bot_xs[0] + bot_w / 2, bot_y + box_h)

    c.setFillColor(white)
    c.setFont("Times-Italic", 9)
    c.drawCentredString(WIDTH / 2, 3.8 * mm, "One WhatsApp message in. One WhatsApp reply out.")

    c.save()
    print(OUTPUT_PDF)


if __name__ == "__main__":
    build()
