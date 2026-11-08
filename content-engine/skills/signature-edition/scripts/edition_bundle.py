#!/usr/bin/env python3
"""Portable editorial delivery using GenCreator's existing edition contract.
The host writes the work. This program checks structure and packages exact bytes.
"""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import sys
import zipfile

spec = importlib.util.spec_from_file_location("signature_edition_core", Path(__file__).with_name("edition_core.py"))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
MAX_ARCHIVE = 16 * 1024 * 1024
AXES = ("composition", "language", "material", "interaction", "motion")


def require(ok, message):
    if not ok:
        raise ValueError(message)


def load_json(raw):
    return json.loads(raw, object_pairs_hook=core.unique_object,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite JSON")))


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def check(edition, brief):
    review = core.review(edition)
    require(isinstance(brief, dict) and brief.get("schema") == "gencreator.signature-brief.v1", "Unsupported creative brief")
    for field in ("brand", "reader_job", "reader_action", "tension", "point_of_view", "reader_change"):
        core.text(brief.get(field), field, 4000)
    voice = brief.get("voice")
    require(isinstance(voice, dict) and voice.get("status") in ("provisional", "calibrated"), "Voice status required")
    for field in ("anchors", "avoid"):
        require(isinstance(voice.get(field), list) and 1 <= len(voice[field]) <= 12, "Voice " + field + " required")
        for item in voice[field]:
            core.text(item, field, 2000)
    directions = brief.get("directions")
    require(isinstance(directions, list) and len(directions) == 3, "Compare three creative directions")
    ids = set()
    for direction in directions:
        require(isinstance(direction, dict), "Invalid direction")
        key = core.identifier(direction.get("id"))
        require(key not in ids, "Duplicate direction")
        ids.add(key)
        for field in ("label", "opening", "tradeoff") + AXES:
            core.text(direction.get(field), field, 4000)
    for i, a in enumerate(directions):
        for b in directions[i + 1:]:
            changed = [k for k in AXES if a[k].strip().casefold() != b[k].strip().casefold()]
            require(len(changed) >= 2, "Directions need different decisions on at least two axes")
    selection = brief.get("selection")
    require(isinstance(selection, dict) and selection.get("direction") in ids, "Select a compared direction")
    require(selection.get("basis") in ("agent_recommendation", "user_selected"), "Selection basis required")
    core.text(selection.get("reason"), "selection reason", 4000)
    critique = brief.get("critique")
    require(isinstance(critique, dict), "Record editorial critique")
    for field in ("weak_passage", "repair", "remaining_gap"):
        core.text(critique.get(field), field, 4000)
    return {
        "schema": "gencreator.signature-review.v1",
        "edition": review,
        "brief_digest": core.digest(brief),
        "selected_direction": selection["direction"],
        "selection_basis": selection["basis"],
        "publication_state": "draft",
        "human_identity_verified": False,
        "semantic_claims_verified": False,
        "taste_independently_reviewed": False,
        "limitations": [
            "Exact source quotes do not establish that a claim follows from them.",
            "Different axis text does not establish creative distinction.",
            "Supplied confirmations do not establish human identity or permission to publish.",
            "The archive includes source text; keep it private until sharing is authorized.",
        ],
    }


def render(edition, brief):
    review = check(edition, brief)
    directions = ["# Creative direction", "", brief["reader_job"], "",
                  "Reader change: " + brief["reader_change"], "",
                  "Point of view: " + brief["point_of_view"], ""]
    for d in brief["directions"]:
        directions += ["## " + d["label"], "", d["opening"], ""]
        directions += [k.capitalize() + ": " + d[k] for k in AXES]
        directions += ["Tradeoff: " + d["tradeoff"], ""]
    directions += ["Selected: " + brief["selection"]["direction"], brief["selection"]["reason"], "",
                   "Selection basis: " + brief["selection"]["basis"], "",
                   "## Review", "", "Original weak passage: " + brief["critique"]["weak_passage"],
                   "", "Repair: " + brief["critique"]["repair"], "",
                   "Remaining gap: " + brief["critique"]["remaining_gap"], ""]
    files = {
        "edition.json": encoded(edition),
        "creative-brief.json": encoded(brief),
        "review.json": encoded(review),
        "source.md": edition["source"]["text"].encode("utf-8"),
        "creative-direction.md": "\n".join(directions).encode("utf-8"),
        "README.md": (
            "# Your signature edition\n\n"
            "Start with the files in assets/, then review creative-direction.md.\n"
            "The source and editable JSON are included. This is a private draft export.\n"
            "No file was posted, scheduled or approved by creating this archive.\n"
            "Keep the originals when revising. Re-run the source checks after edits.\n"
            "A matching checksum proves byte consistency, not identity, truth or authorization.\n"
        ).encode("utf-8"),
    }
    for artifact in edition["artifacts"]:
        files["assets/" + artifact["id"] + ".md"] = (
            "# " + artifact["title"] + "\n\n" + artifact["content"] + "\n"
        ).encode("utf-8")
    manifest = {
        "schema": "gencreator.signature-bundle.v1",
        "brand": brief["brand"],
        "edition_digest": core.digest(edition),
        "brief_digest": core.digest(brief),
        "publication_state": "draft",
        "source_included": True,
        "source_rights_declared": edition["source"]["rights"],
        "files": {name: sha(data) for name, data in sorted(files.items())},
    }
    files["manifest.json"] = encoded(manifest)
    return files


def prepare_web(edition):
    """Prepare a separate draft for the existing web import, preserving originals."""
    core.review(edition)
    result = copy.deepcopy(edition)
    text = result["source"]["text"]
    leading = len(text) - len(text.lstrip())
    normalized = text.strip()
    require(40 <= len(normalized) <= 20000, "Web source must contain 40 to 20000 characters")
    require(len(result["creator"]) <= 100 and len(result["audience"]) <= 240
            and len(result["source"]["label"]) <= 160, "Web metadata exceeds supported bounds")
    require(len(result["artifacts"]) <= 6, "Web supports at most six drafts per edition")
    channels = set()
    for artifact in result["artifacts"]:
        require(artifact["channel"] in ("linkedin", "instagram", "x", "newsletter", "video", "website"),
                "Web does not support this format; retain the local edition")
        require(artifact["channel"] not in channels, "Web supports one draft per format; retain every local draft")
        channels.add(artifact["channel"])
        require(len(artifact["title"]) <= 160 and len(artifact["content"]) <= 24000,
                "Web draft exceeds supported bounds")
        for span in artifact["evidence"]:
            span["start"] -= leading
            span["end"] -= leading
            require(0 <= span["start"] < span["end"] <= len(normalized)
                    and normalized[span["start"]:span["end"]] == span["quote"],
                    "Evidence touches trimmed whitespace; select a supported source span")
    result["source"]["text"] = normalized
    result["confirmations"] = []
    core.review(result)
    return result


def export(edition, brief, output):
    files = render(edition, brief)
    require(sum(map(len, files.values())) <= MAX_ARCHIVE, "Bundle exceeds size limit")
    target = Path(output)
    require(target.parent.is_dir(), "Output parent must already exist")
    require(not target.exists() and not target.is_symlink(), "Output must be new; existing work is preserved")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data, compresslevel=9)
    data = buffer.getvalue()
    with target.open("xb") as stream:
        stream.write(data)
    return {"archive": str(target), "sha256": sha(data), "files": len(files), "publication_state": "draft"}


def verify(path):
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        names = [m.filename for m in members]
        require(1 <= len(members) <= 40 and len(names) == len(set(names)), "Invalid archive inventory")
        require(sum(m.file_size for m in members) <= MAX_ARCHIVE, "Archive exceeds size limit")
        for member in members:
            name = member.filename
            require(name and "\\" not in name and ":" not in name and not name.startswith("/")
                    and all(p not in ("", ".", "..") for p in name.split("/")), "Unsafe member")
            require(stat.S_IFMT(member.external_attr >> 16) in (0, stat.S_IFREG), "Non-regular member")
        require({"manifest.json", "edition.json", "creative-brief.json"} <= set(names), "Incomplete bundle")
        files = {m.filename: archive.read(m) for m in members}
    manifest = load_json(files["manifest.json"].decode("utf-8"))
    require(manifest.get("schema") == "gencreator.signature-bundle.v1", "Unsupported bundle")
    hashes = manifest.get("files")
    require(isinstance(hashes, dict) and set(hashes) == set(files) - {"manifest.json"}, "Manifest inventory mismatch")
    for name, digest in hashes.items():
        require(digest == sha(files[name]), "Checksum mismatch: " + name)
    expected = render(load_json(files["edition.json"].decode("utf-8")),
                      load_json(files["creative-brief.json"].decode("utf-8")))
    require(files == expected, "Bundle does not match its edition and creative brief")
    return {"status": "verified", "files": len(files), "publication_state": "draft",
            "scope": "Structure, exact quotes, revision bindings and archive bytes; semantic and human review remain separate"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("review", "export"):
        p = sub.add_parser(command)
        p.add_argument("--edition", required=True)
        p.add_argument("--brief", required=True)
        if command == "export":
            p.add_argument("--output", required=True)
    p = sub.add_parser("verify")
    p.add_argument("archive")
    p = sub.add_parser("prepare-web")
    p.add_argument("--edition", required=True)
    p.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        if args.command == "verify":
            result = verify(args.archive)
        elif args.command == "prepare-web":
            data = encoded(prepare_web(load_json(core.read_file(args.edition))))
            with Path(args.output).open("xb") as stream:
                stream.write(data)
            result = {"output": args.output, "sha256": sha(data), "publication_state": "draft",
                      "confirmations": "cleared", "source": "trimmed and evidence offsets rechecked"}
        else:
            edition = load_json(core.read_file(args.edition))
            brief = load_json(core.read_file(args.brief))
            result = check(edition, brief) if args.command == "review" else export(edition, brief, args.output)
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, zipfile.BadZipFile):
        print("Edition check failed. Check the source, creative brief, archive and output path.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
