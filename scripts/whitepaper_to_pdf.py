#!/usr/bin/env python3
"""
Build docs/whitepaper.pdf — a print-quality whitepaper rendered from
docs/whitepaper.md via styled HTML, printed to PDF with Chrome headless.

Output goal: looks like a real published whitepaper (cover page,
running header/footer, page numbers, proper typography, brand colors,
clean tables, code blocks in a monospace box).

Workflow:
    Edit docs/whitepaper.md   ← the source of truth
    Run this script           → writes docs/whitepaper.html + .pdf
    Edit docs/whitepaper.docx in Word for free-form changes
    (Then re-export to PDF from Word's "Save as PDF" if you edited the docx)
"""

import re
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SRC  = ROOT / "docs" / "whitepaper.md"
HTML = ROOT / "docs" / "whitepaper.html"
PDF  = ROOT / "docs" / "whitepaper.pdf"

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def build_html():
    md_text = SRC.read_text(encoding="utf-8")

    # Pull the title + subtitle from the first two lines for a cover page,
    # then leave them in the body too so the doc still reads top-to-bottom.
    lines = md_text.split("\n")
    title = next((l[2:].strip() for l in lines if l.startswith("# ")), "Dunper AI")
    subtitle = ""
    for l in lines[:10]:
        m = re.match(r"^##\s+(.*)$", l)
        if m:
            subtitle = m.group(1).strip()
            break

    # Strip the literal first H1+H2 from the body since we render them
    # explicitly on the cover page.
    body_md = re.sub(r"^# .+\n", "", md_text, count=1)
    body_md = re.sub(r"^## .+\n", "", body_md, count=1)

    html_body = markdown.markdown(
        body_md,
        extensions=["tables", "fenced_code", "sane_lists"],
        output_format="html5",
    )

    css = """
    @page {
      size: A4;
      margin: 22mm 20mm 22mm 20mm;
      @top-left { content: "Dunper AI"; font-family: 'Georgia', serif; font-size: 9pt; color: #94a3b8; }
      @top-right { content: "Whitepaper · v1.0"; font-family: 'Georgia', serif; font-size: 9pt; color: #94a3b8; }
      @bottom-center { content: counter(page) " / " counter(pages); font-family: 'Georgia', serif; font-size: 9pt; color: #94a3b8; }
    }
    @page :first {
      margin: 0;
      @top-left { content: ""; }
      @top-right { content: ""; }
      @bottom-center { content: ""; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Georgia", "Times New Roman", serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #0a1430;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cover {
      page: first;
      width: 100%;
      height: 297mm; /* A4 height */
      padding: 0 24mm;
      background:
        radial-gradient(ellipse 80% 50% at 100% 0%, rgba(30,58,138,0.10) 0%, transparent 60%),
        radial-gradient(ellipse 60% 60% at 0% 100%, rgba(46,120,212,0.08) 0%, transparent 60%),
        #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-after: always;
    }
    .cover-top { padding-top: 28mm; }
    .cover-eyebrow {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #1e3a8a;
      font-weight: 600;
    }
    .cover-eyebrow::before {
      content: "";
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #3b82f6;
      margin-right: 10px;
      vertical-align: middle;
    }
    .cover h1 {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-weight: 800;
      font-size: 56pt;
      line-height: 1.02;
      letter-spacing: -0.02em;
      color: #0a1430;
      margin: 18mm 0 6mm;
    }
    .cover h1 em {
      font-style: normal;
      color: #1e3a8a;
    }
    .cover-sub {
      font-family: "Georgia", serif;
      font-style: italic;
      font-size: 18pt;
      color: #475569;
      max-width: 140mm;
      line-height: 1.35;
      margin-bottom: 10mm;
    }
    .cover-meta {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 10pt;
      color: #475569;
      margin-top: 30mm;
    }
    .cover-meta strong { color: #0a1430; }
    .cover-footer {
      padding: 0 0 24mm;
      display: flex;
      justify-content: space-between;
      align-items: end;
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 9pt;
      color: #475569;
      border-top: 1px solid rgba(15,23,42,0.10);
      padding-top: 6mm;
    }
    .cover-footer .lhs strong { color: #0a1430; font-size: 11pt; }
    .cover-footer .rhs { text-align: right; }

    /* Body content */
    .body { padding: 0; }
    .body h1 {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-weight: 800;
      font-size: 22pt;
      color: #0a1430;
      letter-spacing: -0.01em;
      margin: 0 0 6mm;
      padding-top: 4mm;
      border-bottom: 0.5pt solid rgba(15,23,42,0.10);
      padding-bottom: 2mm;
    }
    .body h2 {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-weight: 700;
      font-size: 16pt;
      color: #0a1430;
      margin: 9mm 0 3mm;
      page-break-after: avoid;
    }
    .body h3 {
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-weight: 600;
      font-size: 12.5pt;
      color: #1e3a8a;
      margin: 6mm 0 2mm;
      page-break-after: avoid;
    }
    .body p { margin: 0 0 3.2mm; text-align: justify; hyphens: auto; }
    .body strong { color: #0a1430; }
    .body em { color: #1e3a8a; }
    .body a { color: #1e3a8a; text-decoration: none; border-bottom: 0.5pt solid rgba(30,58,138,0.4); }
    .body ul, .body ol { margin: 0 0 4mm 6mm; padding: 0; }
    .body li { margin-bottom: 1.5mm; }
    .body li::marker { color: #1e3a8a; }

    .body code {
      font-family: "Menlo", "Courier New", monospace;
      font-size: 9pt;
      background: #f1f5f9;
      color: #1e3a8a;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .body pre {
      font-family: "Menlo", "Courier New", monospace;
      font-size: 8.5pt;
      line-height: 1.45;
      background: #f8fafc;
      border: 0.5pt solid rgba(15,23,42,0.10);
      border-radius: 4px;
      padding: 4mm;
      overflow-x: auto;
      page-break-inside: avoid;
      color: #0a1430;
    }
    .body pre code { background: none; padding: 0; font-size: 8.5pt; color: #0a1430; }
    .body blockquote {
      margin: 0 0 4mm;
      padding: 2mm 6mm;
      border-left: 2pt solid #1e3a8a;
      color: #475569;
      font-style: italic;
      background: #f8fafc;
    }
    .body hr {
      border: 0;
      border-top: 0.5pt solid rgba(15,23,42,0.15);
      margin: 6mm 0;
    }

    /* Tables */
    .body table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 5mm;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    .body table th {
      background: #0a1430;
      color: #ffffff;
      text-align: left;
      padding: 2.2mm 3mm;
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-weight: 600;
      font-size: 9pt;
      letter-spacing: 0.04em;
    }
    .body table td {
      padding: 2mm 3mm;
      border-bottom: 0.5pt solid rgba(15,23,42,0.08);
      vertical-align: top;
    }
    .body table tr:nth-child(even) td { background: #f8fafc; }

    /* Italic-only paragraphs at the very end (the doc footer line) */
    .body em + em, .body p > em:only-child { color: #94a3b8; font-size: 9pt; }
    """

    cover = f"""
    <div class="cover">
      <div class="cover-top">
        <div class="cover-eyebrow">Whitepaper · v1.0 · May 2026</div>
        <h1>Dunper <em>AI</em></h1>
        <div class="cover-sub">{subtitle or "An always-on AI receptionist for small businesses."}</div>
        <div class="cover-meta">
          Prepared by the Dunper AI team · Jakarta, Indonesia<br/>
          <strong>dunper.com</strong> · dunperai@gmail.com · @dunper.ai
        </div>
      </div>
      <div class="cover-footer">
        <div class="lhs">
          <strong>Dunper AI</strong><br/>
          Always-on AI receptionist for small businesses.
        </div>
        <div class="rhs">
          © 2026 Dunper AI<br/>
          All rights reserved.
        </div>
      </div>
    </div>
    """

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>{css}</style>
</head>
<body>
{cover}
<div class="body">
{html_body}
</div>
</body>
</html>
"""
    HTML.write_text(html, encoding="utf-8")
    return HTML


def print_to_pdf(html_path: Path, pdf_path: Path):
    if not Path(CHROME).exists():
        print(f"Chrome not found at {CHROME}", file=sys.stderr)
        sys.exit(1)
    cmd = [
        CHROME,
        "--headless",
        "--disable-gpu",
        "--no-pdf-header-footer",
        "--no-margins",
        f"--print-to-pdf={pdf_path}",
        html_path.as_uri(),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if res.returncode != 0 or not pdf_path.exists():
        print("Chrome failed:", res.returncode, file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    html_path = build_html()
    print_to_pdf(html_path, PDF)
    size = PDF.stat().st_size
    print(f"wrote {PDF} ({size//1024} KB)")
