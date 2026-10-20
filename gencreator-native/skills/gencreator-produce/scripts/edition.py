#!/usr/bin/env python3
"""Local source span and exact-revision checks. No inference, network or writes."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

LIMIT = 2_000_000
CHANNELS = {"linkedin", "x", "instagram", "newsletter", "video", "website", "carousel", "visual-brief"}


def digest(value):
    raw = value if isinstance(value, str) else json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def obj(value, required, label):
    if not isinstance(value, dict) or set(value) != set(required):
        raise ValueError(label + ": incorrect fields")


def text(value, label, maximum=100_000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError(label + ": expected bounded nonempty text")
    value.encode("utf-8")
    return value


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", value):
        raise ValueError("Invalid artifact id")
    return value


def index_source(source):
    text(source, "source", LIMIT)
    spans = []
    for match in re.finditer(r"[^\n]+", source):
        if match.group().strip():
            spans.append({"start": match.start(), "end": match.end(), "quote": match.group()})
    if len(spans) > 20_000:
        raise ValueError("Too many source lines")
    return {"sourceDigest": digest(source), "offsetUnit": "unicode_code_points", "spans": spans}


def review(edition):
    obj(edition, ["schema", "creator", "audience", "source", "artifacts", "confirmations"], "edition")
    if edition["schema"] != "gencreator.local-edition.v1":
        raise ValueError("Unsupported edition schema")
    text(edition["creator"], "creator", 160)
    text(edition["audience"], "audience", 1000)
    source = edition["source"]
    obj(source, ["label", "text", "rights"], "source")
    text(source["label"], "source label", 240)
    original = text(source["text"], "source text", LIMIT)
    if source["rights"] not in ["owned", "permitted", "unknown"]:
        raise ValueError("Unsupported source rights")
    artifacts = edition["artifacts"]
    if not isinstance(artifacts, list) or not 1 <= len(artifacts) <= 30:
        raise ValueError("Expected 1–30 artifacts")
    rows, ids = [], set()
    source_digest = digest(original)
    for artifact in artifacts:
        obj(artifact, ["id", "channel", "title", "content", "evidence"], "artifact")
        key = identifier(artifact["id"])
        if key in ids:
            raise ValueError("Duplicate artifact id")
        ids.add(key)
        if not isinstance(artifact["channel"], str) or artifact["channel"] not in CHANNELS:
            raise ValueError("Unsupported channel")
        text(artifact["title"], "title", 240)
        text(artifact["content"], "content")
        evidence = artifact["evidence"]
        if not isinstance(evidence, list) or not 1 <= len(evidence) <= 100:
            raise ValueError("Expected 1–100 evidence spans per artifact")
        for span in evidence:
            obj(span, ["start", "end", "quote"], "evidence span")
            start, end = span["start"], span["end"]
            if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(original):
                raise ValueError("Evidence offsets outside source")
            quote = text(span["quote"], "evidence quote")
            if original[start:end] != quote:
                raise ValueError("Evidence quote does not match source span")
        bound = {"creator": edition["creator"], "audience": edition["audience"], "source": {"label": source["label"], "digest": source_digest, "rights": source["rights"]}, "artifact": artifact}
        rows.append({"id": key, "digest": digest(bound), "evidenceSpans": len(evidence)})
    confirmations = edition["confirmations"]
    if not isinstance(confirmations, list) or len(confirmations) > len(artifacts):
        raise ValueError("Invalid confirmations")
    confirmed = set()
    current = {row["id"]: row["digest"] for row in rows}
    for item in confirmations:
        obj(item, ["id", "digest"], "confirmation")
        key = identifier(item["id"])
        if key in confirmed or key not in current or item["digest"] != current[key]:
            raise ValueError("Stale, duplicate or unknown confirmation")
        confirmed.add(key)
    gaps = []
    if source["rights"] == "unknown":
        gaps.append("source_distribution_rights_unconfirmed")
    if confirmed != ids:
        gaps.append("exact_revision_confirmation_missing")
    return {
        "schema": "gencreator.local-review.v1", "sourceDigest": source_digest,
        "artifacts": rows, "state": "content_confirmed" if not gaps else "draft",
        "gaps": gaps, "authority": "supplied_content_confirmation_only",
        "semanticReview": "required_separately", "identityVerified": False,
        "published": False, "externalWrites": False,
    }


def read_file(path):
    with Path(path).open("rb") as stream:
        raw = stream.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError("Input exceeds 2 MB limit")
    return raw.decode("utf-8")


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON field")
        value[key] = item
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["index", "review"])
    parser.add_argument("input")
    args = parser.parse_args()
    try:
        raw = read_file(args.input)
        result = index_source(raw) if args.command == "index" else review(json.loads(raw, object_pairs_hook=unique_object))
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    except (ValueError, TypeError, OSError, UnicodeError, OverflowError):
        print(json.dumps({"error": "Invalid input. Check the edition contract, source spans and revision confirmations."}), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
