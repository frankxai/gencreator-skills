# Portable edition contract

This is a local evidence/check receipt, not a replacement for the server CreatorPack/Mission contract. The producing model writes the drafts. The engine checks exact source spans and binds supplied confirmations to complete artifact JSON. No network, model inference, publication or authenticated approval is performed by the engine.

Use Python 3.10+. Offsets are Python Unicode code points in the exact source string, with an exclusive end. The source digest hashes its exact UTF-8 bytes; newline changes alter the digest.

```json
{
  "schema": "gencreator.local-edition.v1",
  "creator": "Example educator",
  "audience": "Independent expert founders",
  "source": {
    "label": "Owned workshop notes",
    "text": "Keep the source. Review the draft. Export the edition.",
    "rights": "owned"
  },
  "artifacts": [{
    "id": "post-1",
    "channel": "linkedin",
    "title": "Keep the source",
    "content": "Keep the source close to every draft you review.",
    "evidence": [{
      "start": 0,
      "end": 16,
      "quote": "Keep the source."
    }]
  }],
  "confirmations": []
}
```

Channels: linkedin, x, instagram, newsletter, video, website, carousel, visual-brief.
Rights: owned, permitted, unknown. Unknown blocks confirmed handoffs.
Each artifact needs evidence from the source; an empty evidence list fails. The producing agent must additionally assess claim coverage and entailment. A perfectly matching quote can still support the wrong argument.

The review output contains sourceDigest, artifact digests, evidence coverage counts, state and gaps. Copy a digest into `confirmations` only following a user decision on that exact revision:

```json
{"id": "post-1", "digest": "sha256:<returned artifact digest>"}
```

All artifacts must have current confirmations and known rights for `content_confirmed`. This state checks supplied assertions; it is not identity verification, publishing authorization or a signature. No source text appears in the receipt. Keep the source-bearing edition private unless its sharing is authorized.

Default delivery includes the finished Markdown, this edition JSON, the mechanical review receipt and a short production handoff. Handoff: format, required assets, method/provider, owner, acceptance, review gaps, budget estimate, measured cost when available, next action. Costs remain estimates without a provider receipt.

Quality rubric (human/model review, not engine assertions):

| Dimension | Pass condition |
| --- | --- |
| Source fidelity | Every material factual claim is traced, verified, qualified or removed |
| Voice | Distinctive phrasing and point of view survive the transformation |
| Usefulness | Each artifact resolves a concrete reader problem |
| Format | Fits the selected channel and reads/sounds naturally |
| Rights | Use and distribution scope is known; likeness/voice grants are separate |
| Completion | Editable work delivered; render/send states backed by receipts |

Fail or inconclusive on a critical dimension prevents a release recommendation. Do not average away a missing source, invalid rights or failed operation.
