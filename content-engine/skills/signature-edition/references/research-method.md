# Research that earns its place in the work

Start with a question that can change the piece or the product decision. Research is useful when it helps the reader choose or do something. Stop when the material claims and serious alternatives are covered; more sources do not establish a better result.

Use the host's native search and fetch first, then existing authenticated tools when private context is necessary. Read current primary documentation for technical features. Seek a contrary result or limitation. Vendor documentation establishes a vendor's stated capability, not customer preference or comparative quality. An unavailable page remains unread. Never invent a retrieval or buy connector credits to hide a failed native fetch.

## Preserve evidence and uncertainty

Use `examples/research.json` beside the existing fictional edition as the smallest contract example. For real work:

- Preserve a permitted source snapshot, stable URL, retrieval date, review date, declared source type and usage. Use a short permitted excerpt where full text cannot be retained. Keep private inputs in the user's workspace. A public URL does not confer redistribution rights.
- Record material claims as exact Unicode code-point spans in each artifact. Facts and inferences need supporting source spans. Proposals and opinions must remain visibly framed that way in the prose.
- Inspect whether each passage supports the claim, rather than just sharing keywords. Record the reason. Include contrary evidence when found. A contradicted claim cannot be labelled supported; qualification still leaves research work visible.
- Choose `review_after` based on volatility. Platform rules and deployment readiness often need short review windows; stable craft may justify longer ones. The checker trusts supplied dates and metadata. It does not authenticate retrieval or verify meaning.
- Include the useful choice, two serious alternatives, evidence basis, limits and next test. These are candidate lessons until an observed outcome supports reuse.

The dossier binds to the complete edition digest. Any edition change, including confirmations, requires an explicit dossier revision and recheck. Do not regenerate the digest alone to conceal changed meaning: re-inspect every claim and source span. Keep earlier revisions.

## Check and deliver

Resolve script paths from the skill directory. Python 3.10+ and the standard library suffice.

~~~bash
python -B scripts/research_evidence.py --edition edition.json --research research.json --as-of 2026-11-08 --require-current
python -B scripts/edition_bundle.py review --edition edition.json --brief brief.json --research research.json --as-of 2026-11-08
python -B scripts/edition_bundle.py export --edition edition.json --brief brief.json --research research.json --as-of 2026-11-08 --output edition-v2.zip
python -B scripts/edition_bundle.py verify edition-v2.zip
~~~

Omit `--as-of` for today's UTC date. Pin it to reproduce a historical check, and disclose that date. `research_evidence.py` exits 2 for malformed or stale revision bindings; `--require-current` exits 3 for valid dossiers with outstanding research gaps. It emits actionable claim and decision IDs. No output is written by this checker.

Exports preserve valid drafts even when research has gaps. Their state remains draft. Verification reports both the original research state and a fresh assessment at the requested date; a byte-consistent archive can contain expired research. Archive integrity never authorizes publication.

The ZIP adds `research.json` with snapshots and `research.md` with claim links and decisions. Review every material claim for coverage and meaning, then inspect the actual Markdown assets. The existing web import accepts the edition alone and does not consume this dossier. Carry the research files beside the returned Studio project; never claim the web application stored or applied them.
