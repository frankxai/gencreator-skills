#!/usr/bin/env python3
"""Inspect supplied research and bind evidence to exact edition revisions.

No fetches, model calls, execution of source text, or publication actions.
Support labels are editorial assertions; matching bytes do not prove meaning.
"""
import argparse
from datetime import date, datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit

spec = importlib.util.spec_from_file_location("research_edition_core", Path(__file__).with_name("edition_core.py"))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def day(value):
    require(isinstance(value, str), "Date must be YYYY-MM-DD")
    result = date.fromisoformat(value)
    require(result.isoformat() == value, "Date must be YYYY-MM-DD")
    return result


def today():
    return datetime.now(timezone.utc).date().isoformat()


def rows(value, maximum, label, minimum=1):
    require(isinstance(value, list) and minimum <= len(value) <= maximum, label + ": invalid count")
    return value


def span(value, text):
    core.obj(value, ("start", "end", "quote"), "span")
    start, end = value["start"], value["end"]
    require(type(start) is int and type(end) is int and 0 <= start < end <= len(text), "Invalid span bounds")
    core.text(value["quote"], "quote")
    require(text[start:end] == value["quote"], "Quote does not match exact revision")


def inspect(dossier, edition, as_of=None):
    core.review(edition)
    as_of = as_of or today()
    checked = day(as_of)
    core.obj(dossier, ("schema", "edition_digest", "question", "created_on", "sources", "claims", "decisions"), "research")
    require(dossier["schema"] == "gencreator.research-dossier.v1", "Unsupported research schema")
    require(dossier["edition_digest"] == core.digest(edition), "Research is stale: edition revision changed")
    require(day(dossier["created_on"]) <= checked, "Research creation date is in the future")
    core.text(dossier["question"], "research question", 4000)
    sources, source_rows = {}, []
    gaps = []
    for source in rows(dossier["sources"], 25, "sources"):
        core.obj(source, ("id", "title", "url", "kind", "retrieved_on", "review_after", "visibility", "usage", "text", "digest"), "source")
        key = core.identifier(source["id"])
        require(key not in sources, "Duplicate source id")
        core.text(source["title"], "source title", 300)
        require(source["kind"] in ("primary", "secondary", "owned"), "Invalid source kind")
        require(source["visibility"] in ("public", "private"), "Invalid source visibility")
        require(source["usage"] in ("quotation_only", "owned", "permitted", "unknown"), "Invalid source usage")
        core.text(source["text"], "source snapshot", 200_000)
        require(source["digest"] == core.digest(source["text"]), "Source snapshot digest mismatch")
        core.text(source["url"], "source URL", 2000)
        url = urlsplit(source["url"])
        local = source["url"] == "urn:gencreator:owned:" + key and source["kind"] == "owned"
        require(local or (url.scheme == "https" and url.hostname and not url.username and not url.password
                         and not url.query and not url.fragment and not any(c.isspace() for c in source["url"])),
                "Use a stable HTTPS source URL without credentials/query/fragment, or an owned-source URN")
        retrieved, expires = day(source["retrieved_on"]), day(source["review_after"])
        require(retrieved <= checked and expires >= retrieved, "Invalid source review dates")
        stale = checked > expires
        sources[key] = source
        source_rows.append({"id": key, "digest": source["digest"], "stale": stale,
                            "visibility": source["visibility"], "usage": source["usage"]})
    require(sum(len(s["text"]) for s in sources.values()) <= core.LIMIT, "Research snapshots exceed size budget")
    artifacts = {a["id"]: a for a in edition["artifacts"]}
    claims, claim_rows = {}, []
    stale_ids = {r["id"] for r in source_rows if r["stale"]}
    for claim in rows(dossier["claims"], 100, "claims"):
        core.obj(claim, ("id", "artifact_id", "span", "kind", "assessment", "reason", "evidence"), "claim")
        key = core.identifier(claim["id"])
        require(key not in claims, "Duplicate claim id")
        require(claim["artifact_id"] in artifacts, "Claim refers to an unknown artifact")
        span(claim["span"], artifacts[claim["artifact_id"]]["content"])
        require(claim["kind"] in ("fact", "inference", "proposal", "opinion"), "Invalid claim kind")
        require(claim["assessment"] in ("supported", "qualified", "unresolved"), "Invalid assessment")
        core.text(claim["reason"], "editorial reasoning", 4000)
        used, supports, contradicts = set(), set(), set()
        for ref in rows(claim["evidence"], 20, "claim evidence", minimum=0):
            core.obj(ref, ("source_id", "relation", "span"), "evidence")
            source_id = ref["source_id"]
            require(source_id in sources, "Evidence refers to an unknown source")
            require(ref["relation"] in ("supports", "contradicts"), "Invalid evidence relation")
            span(ref["span"], sources[source_id]["text"])
            fingerprint = (source_id, ref["relation"], ref["span"]["start"], ref["span"]["end"])
            require(fingerprint not in used, "Duplicate evidence reference")
            used.add(fingerprint)
            (supports if ref["relation"] == "supports" else contradicts).add(source_id)
        reasons = []
        if claim["kind"] in ("fact", "inference") and not supports:
            reasons.append("support_missing")
        if contradicts:
            reasons.append("contradicting_evidence_requires_resolution")
            require(claim["assessment"] != "supported", "A contradicted claim cannot be marked supported")
        if claim["assessment"] == "unresolved":
            reasons.append("editorial_assessment_unresolved")
        source_ids = supports | contradicts
        if source_ids & stale_ids:
            reasons.append("source_review_expired")
        if any(sources[s]["usage"] == "unknown" for s in source_ids):
            reasons.append("source_usage_unknown")
        if claim["kind"] in ("fact", "inference") and supports and all(sources[s]["kind"] == "secondary" for s in supports):
            reasons.append("primary_source_missing")
        for reason in reasons:
            gaps.append({"claim_id": key, "reason": reason})
        claims[key] = claim
        claim_rows.append({"id": key, "artifact_id": claim["artifact_id"], "kind": claim["kind"],
                           "assessment": claim["assessment"], "source_ids": sorted(source_ids), "gaps": reasons})
    decisions = set()
    for decision in rows(dossier["decisions"], 30, "decisions"):
        core.obj(decision, ("id", "choice", "alternatives", "basis", "boundary", "next_test"), "decision")
        key = core.identifier(decision["id"])
        require(key not in decisions, "Duplicate decision id")
        decisions.add(key)
        for field in ("choice", "boundary", "next_test"):
            core.text(decision[field], field, 4000)
        alternatives = rows(decision["alternatives"], 5, "alternatives", minimum=2)
        for alternative in alternatives:
            core.text(alternative, "alternative", 4000)
        require(len(set(a.strip().casefold() for a in alternatives)) == len(alternatives), "Duplicate alternatives")
        basis = rows(decision["basis"], 30, "decision basis")
        require(all(isinstance(c, str) and c in claims for c in basis) and len(set(basis)) == len(basis),
                "Decision basis must name unique known claims")
        if any(g.get("claim_id") in basis for g in gaps):
            gaps.append({"decision_id": key, "reason": "decision_depends_on_unresolved_research"})
    return {
        "schema": "gencreator.research-review.v1", "as_of": as_of,
        "dossier_digest": core.digest(dossier), "edition_digest": dossier["edition_digest"],
        "state": "needs_research" if gaps else "ready_for_editorial_review",
        "gaps": gaps, "sources": source_rows, "claims": claim_rows,
        "semantics_verified": False, "coverage_verified": False, "human_identity_verified": False,
        "publication_authorized": False, "learning_status": "candidate",
        "limitations": [
            "Claims and support labels are supplied editorial judgments, not model-independent verification.",
            "Unlisted claims, omitted contradictions and inaccurate source metadata cannot be detected here.",
            "A retrieval date is a declaration; the checker does not fetch or authenticate the source.",
            "Research can inform a candidate decision; accepted wisdom requires observed outcome evidence.",
            "Snapshots may contain private or copyrighted text. Research export is private and needs a sharing review.",
        ],
    }


def markdown(dossier, review):
    lines = ["# Research behind this edition", "", dossier["question"], "",
             "Checked as of: " + review["as_of"], "State: " + review["state"],
             "Editorial judgments are supplied; semantic and coverage review remain required.", ""]
    sources = {s["id"]: s for s in dossier["sources"]}
    for claim in dossier["claims"]:
        lines += ["## " + claim["id"], "", claim["span"]["quote"], "",
                  "Type: " + claim["kind"] + "; assessment: " + claim["assessment"], claim["reason"], ""]
        for ref in claim["evidence"]:
            s = sources[ref["source_id"]]
            lines += [ref["relation"].capitalize() + ": " + s["title"] + " (" + s["url"] + ")",
                      "Retrieved: " + s["retrieved_on"] + "; review after: " + s["review_after"], ""]
    lines += ["## Decisions to test", ""]
    for d in dossier["decisions"]:
        lines += ["### " + d["id"], "", d["choice"], "", "Alternatives: " + "; ".join(d["alternatives"]),
                  "Basis: " + ", ".join(d["basis"]), "Boundary: " + d["boundary"], "Next test: " + d["next_test"], ""]
    lines += ["## Remaining research work", ""]
    lines += [json.dumps(g, ensure_ascii=False) for g in review["gaps"]] or ["No mechanical gaps found; independent editorial review remains."]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edition", required=True)
    parser.add_argument("--research", required=True)
    parser.add_argument("--as-of")
    parser.add_argument("--require-current", action="store_true")
    args = parser.parse_args()
    try:
        read = lambda p: json.loads(core.read_file(p), object_pairs_hook=core.unique_object,
                                   parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))
        result = inspect(read(args.research), read(args.edition), args.as_of)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 3 if args.require_current and result["gaps"] else 0
    except (ValueError, TypeError, KeyError, OSError, UnicodeError, OverflowError):
        print(json.dumps({"error": "Invalid research input. Check exact revisions, source spans, dates and claim references."}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
