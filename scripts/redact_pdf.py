#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PDF redaction helper for Kanyanbao.

It redacts lines containing sensitive literals / regex rules, strips PDF metadata,
and outputs a JSON result to stdout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import defaultdict
from typing import Dict, List, Tuple

import fitz  # PyMuPDF


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Redact sensitive text in PDF")
    parser.add_argument("--input", required=True, help="Raw PDF path")
    parser.add_argument("--output", required=True, help="Sanitized PDF path")
    parser.add_argument("--rules-file", required=True, help="JSON file containing redaction rules")
    return parser.parse_args()


def _load_rules(file_path: str) -> Dict:
    with open(file_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    fixed_prefix = str(payload.get("fixed_prefix", "")).strip()
    fixed_suffix = str(payload.get("fixed_suffix", "")).strip()
    literals = [str(item).strip() for item in payload.get("literal_terms", []) if str(item).strip()]
    regex_patterns = [str(item).strip() for item in payload.get("regex_patterns", []) if str(item).strip()]
    require_hit = bool(payload.get("require_hit", False))

    if fixed_prefix:
        literals.append(fixed_prefix)
    if fixed_suffix:
        literals.append(fixed_suffix)

    # Preserve order but de-duplicate.
    seen = set()
    dedup_literals = []
    for term in literals:
        if term not in seen:
            seen.add(term)
            dedup_literals.append(term)

    compiled_regex = []
    invalid_regex = []
    for pattern in regex_patterns:
        try:
            compiled_regex.append(re.compile(pattern, re.IGNORECASE))
        except re.error:
            invalid_regex.append(pattern)

    return {
        "literals": dedup_literals,
        "compiled_regex": compiled_regex,
        "regex_patterns": regex_patterns,
        "invalid_regex": invalid_regex,
        "require_hit": require_hit,
    }


def _line_hits(text: str, text_nospace: str, rules: Dict) -> List[Tuple[str, str]]:
    hits: List[Tuple[str, str]] = []
    lowered = text.lower()
    lowered_nospace = text_nospace.lower()

    for literal in rules["literals"]:
        needle = literal.lower()
        if needle in lowered or needle in lowered_nospace:
            hits.append(("literal", literal))

    for pattern in rules["compiled_regex"]:
        if pattern.search(text) or pattern.search(text_nospace):
            hits.append(("regex", pattern.pattern))

    return hits


def _to_rect(word_entry: Tuple) -> fitz.Rect:
    return fitz.Rect(float(word_entry[0]), float(word_entry[1]), float(word_entry[2]), float(word_entry[3]))


def _rect_key(rect: fitz.Rect) -> Tuple[float, float, float, float]:
    return (
        round(rect.x0, 2),
        round(rect.y0, 2),
        round(rect.x1, 2),
        round(rect.y1, 2),
    )


def _redact_pdf(input_path: str, output_path: str, rules: Dict) -> Dict:
    warnings: List[str] = []
    watermark_hits: List[Dict] = []
    redaction_count = 0

    doc = fitz.open(input_path)

    try:
        for page_index in range(doc.page_count):
            page = doc[page_index]
            words = page.get_text("words")

            grouped: Dict[Tuple[int, int], List[Tuple]] = defaultdict(list)
            for word in words:
                # x0, y0, x1, y1, word, block_no, line_no, word_no
                if len(word) < 8:
                    continue
                block_no = int(word[5])
                line_no = int(word[6])
                grouped[(block_no, line_no)].append(word)

            redaction_rects = {}
            for _, line_words in grouped.items():
                line_words_sorted = sorted(line_words, key=lambda item: int(item[7]))
                line_text_tokens = [str(item[4]) for item in line_words_sorted]
                line_text = " ".join(line_text_tokens).strip()
                line_text_nospace = "".join(line_text_tokens).strip()

                if not line_text and not line_text_nospace:
                    continue

                hits = _line_hits(line_text, line_text_nospace, rules)
                if not hits:
                    continue

                rect = None
                for w in line_words_sorted:
                    w_rect = _to_rect(w)
                    if rect is None:
                        rect = w_rect
                    else:
                        rect.include_rect(w_rect)

                if rect is None:
                    continue

                key = _rect_key(rect)
                redaction_rects[key] = rect
                for hit_type, hit_text in hits:
                    watermark_hits.append(
                        {
                            "page": page_index + 1,
                            "rule_id": hit_type,
                            "text": hit_text,
                        }
                    )

            # Additional literal search on text layer for higher precision.
            for literal in rules["literals"]:
                for rect in page.search_for(literal):
                    key = _rect_key(rect)
                    redaction_rects[key] = rect
                    watermark_hits.append(
                        {
                            "page": page_index + 1,
                            "rule_id": "literal_search",
                            "text": literal,
                        }
                    )

            if redaction_rects:
                for rect in redaction_rects.values():
                    page.add_redact_annot(rect, fill=(0, 0, 0))
                page.apply_redactions()
                redaction_count += len(redaction_rects)

        # Remove metadata / xml metadata to avoid identity leaks.
        doc.set_metadata({})
        try:
            doc.del_xml_metadata()
        except Exception:
            pass

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.save(output_path, garbage=4, clean=True, deflate=True)
    finally:
        doc.close()

    output_sha256 = ""
    if os.path.exists(output_path):
        with open(output_path, "rb") as f:
            output_sha256 = hashlib.sha256(f.read()).hexdigest()

    status = "completed"
    if redaction_count == 0:
        warnings.append("No redaction hit found in this PDF.")
        if rules["require_hit"]:
            status = "needs_review"

    page_count = 0
    if os.path.exists(output_path):
        out_doc = fitz.open(output_path)
        try:
            page_count = out_doc.page_count
        finally:
            out_doc.close()

    return {
        "ok": True,
        "status": status,
        "page_count": page_count,
        "watermark_hits": watermark_hits,
        "redaction_count": redaction_count,
        "output_sha256": output_sha256,
        "warnings": warnings,
        "invalid_regex": rules["invalid_regex"],
    }


def main() -> int:
    args = _parse_args()
    try:
        rules = _load_rules(args.rules_file)
        result = _redact_pdf(args.input, args.output, rules)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as exc:
        result = {
            "ok": False,
            "status": "failed",
            "error": str(exc),
        }
        print(json.dumps(result, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
