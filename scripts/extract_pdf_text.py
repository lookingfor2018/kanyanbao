#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Extract text from PDF pages for lightweight downstream matching.
"""

from __future__ import annotations

import argparse
import json
import sys

import fitz  # PyMuPDF


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract text from PDF")
    parser.add_argument("--input", required=True, help="Input PDF path")
    parser.add_argument("--max-pages", type=int, default=8, help="Max pages to extract")
    parser.add_argument("--max-chars", type=int, default=120000, help="Max chars to keep")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        doc = fitz.open(args.input)
        try:
            pages = []
            chunks = []
            page_limit = max(1, args.max_pages)
            char_limit = max(1000, args.max_chars)
            total_chars = 0

            for page_index in range(min(doc.page_count, page_limit)):
                page = doc[page_index]
                text = page.get_text("text") or ""
                if not text.strip():
                    continue
                if total_chars + len(text) > char_limit:
                    text = text[: max(0, char_limit - total_chars)]
                total_chars += len(text)
                pages.append({"page": page_index + 1, "text": text})
                chunks.append(text)
                if total_chars >= char_limit:
                    break

            payload = {
                "ok": True,
                "page_count": doc.page_count,
                "pages": pages,
                "text": "\n".join(chunks),
                "chars": total_chars,
            }
            print(json.dumps(payload, ensure_ascii=False))
            return 0
        finally:
            doc.close()
    except Exception as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())

