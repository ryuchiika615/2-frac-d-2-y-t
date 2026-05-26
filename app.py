from __future__ import annotations

import html
import os
import re
import unicodedata
from dataclasses import dataclass

from flask import Flask, jsonify, render_template, request
from latex2mathml.converter import convert as latex_to_mathml


app = Flask(__name__)


ZERO_WIDTH_CHARS = {
    "\u200b",
    "\u200c",
    "\u200d",
    "\ufeff",
    "\u2060",
}


@dataclass
class Segment:
    kind: str
    value: str
    display: bool = False


def clean_input(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    for char in ZERO_WIDTH_CHARS:
        normalized = normalized.replace(char, "")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"[ \t]+\n", "\n", normalized)
    normalized = re.sub(r"\n{4,}", "\n\n\n", normalized)
    return normalized.strip()


def split_latex_segments(text: str) -> list[Segment]:
    segments: list[Segment] = []
    buffer: list[str] = []
    i = 0

    while i < len(text):
        if text.startswith("$$", i):
            if buffer:
                segments.append(Segment("text", "".join(buffer)))
                buffer = []
            end = text.find("$$", i + 2)
            if end == -1:
                buffer.append(text[i:])
                break
            segments.append(Segment("math", text[i + 2 : end].strip(), True))
            i = end + 2
            continue

        if text[i] == "$":
            if i > 0 and text[i - 1] == "\\":
                buffer.append("$")
                i += 1
                continue
            if buffer:
                segments.append(Segment("text", "".join(buffer)))
                buffer = []
            end = _find_inline_dollar(text, i + 1)
            if end == -1:
                buffer.append(text[i])
                i += 1
                continue
            segments.append(Segment("math", text[i + 1 : end].strip(), False))
            i = end + 1
            continue

        buffer.append(text[i])
        i += 1

    if buffer:
        segments.append(Segment("text", "".join(buffer)))

    return segments


def _find_inline_dollar(text: str, start: int) -> int:
    i = start
    while i < len(text):
        if text[i] == "$" and (i == 0 or text[i - 1] != "\\"):
            return i
        i += 1
    return -1


def mathml_for_latex(latex: str, display: bool) -> str:
    cleaned = latex.strip()
    if not cleaned:
        return ""
    return latex_to_mathml(cleaned, display="block" if display else "inline")


def text_to_html(text: str) -> str:
    lines = html.escape(text).split("\n")
    out: list[str] = []
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            out.append(f"<p>{'<br>'.join(paragraph)}</p>")
            paragraph.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            continue

        heading_match = re.fullmatch(r"【(.+?)】", stripped)
        answer_match = re.fullmatch(r"(問\d+.*|\(\d+\).*)", stripped)
        if heading_match or answer_match:
            flush_paragraph()
            out.append(f"<h2>{stripped}</h2>")
        else:
            paragraph.append(line)

    flush_paragraph()
    return "".join(out)


def convert_to_word_html(source: str) -> dict[str, str | list[str]]:
    cleaned = clean_input(source)
    segments = split_latex_segments(cleaned)
    html_parts: list[str] = []
    plain_parts: list[str] = []
    warnings: list[str] = []

    for segment in segments:
        if segment.kind == "text":
            html_parts.append(text_to_html(segment.value))
            plain_parts.append(segment.value)
            continue

        try:
            mathml = mathml_for_latex(segment.value, segment.display)
            class_name = "equation display" if segment.display else "equation inline"
            html_parts.append(f'<div class="{class_name}">{mathml}</div>' if segment.display else mathml)
            plain_parts.append(segment.value)
        except Exception:
            fallback = html.escape(segment.value)
            html_parts.append(f"<code>{fallback}</code>")
            plain_parts.append(segment.value)
            warnings.append(f"変換できない数式がありました: {segment.value[:40]}")

    body = "".join(html_parts)
    document_html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Yu Gothic', 'Meiryo', sans-serif; font-size: 11pt; line-height: 1.55; color: #111; }}
    p {{ margin: 0 0 8pt; }}
    h2 {{ font-size: 12pt; margin: 12pt 0 6pt; font-weight: 700; }}
    .equation.display {{ text-align: center; margin: 10pt 0 12pt; }}
    math {{ font-family: Cambria Math, serif; }}
    code {{ font-family: Consolas, monospace; background: #f2f2f2; padding: 1pt 3pt; }}
  </style>
</head>
<body>{body}</body>
</html>
""".strip()

    return {
        "cleanText": cleaned,
        "wordHtml": document_html,
        "previewHtml": body,
        "plainText": "".join(plain_parts),
        "warnings": warnings,
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/convert")
def convert():
    payload = request.get_json(silent=True) or {}
    source = payload.get("text", "")
    if not isinstance(source, str):
        return jsonify({"error": "text must be a string"}), 400
    return jsonify(convert_to_word_html(source))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
