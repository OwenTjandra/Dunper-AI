#!/usr/bin/env bash
# build-whitepaper.sh — rebuild whitepaper.docx + whitepaper.pdf from
# docs/whitepaper.md. Run this after any edit to the markdown source.

set -e
cd "$(dirname "$0")/.."

echo "▶ building docs/whitepaper.docx …"
python3 scripts/whitepaper_to_docx.py

echo "▶ building docs/whitepaper.pdf  …"
python3 scripts/whitepaper_to_pdf.py

echo ""
echo "✓ Done. Files:"
ls -lh docs/whitepaper.md docs/whitepaper.docx docs/whitepaper.pdf | awk '{printf "  %-12s %s\n", $5, $9}'
echo ""
echo "Edit any of them:"
echo "  • Source of truth (re-runs preserve all formatting):"
echo "      open -e docs/whitepaper.md"
echo "  • Word doc (edit freely, then re-export to PDF inside Word):"
echo "      open docs/whitepaper.docx"
echo "  • Preview the PDF:"
echo "      open docs/whitepaper.pdf"
