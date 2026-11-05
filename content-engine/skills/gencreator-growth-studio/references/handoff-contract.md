# Search evidence → CreatorGrowthPack contract v1

## Minimal incoming packet

```json
{
  "schema": "starlight.growth.handoff.v1",
  "brand": "Example Brand",
  "audience": "technical founders choosing observability stacks",
  "opportunity_id": "ranking-content-example-1",
  "subject": "production-ready autonomous agent observability",
  "customer_decision": "compare deployment and runtime evidence",
  "source_evidence": [{"source":"manual","ref":"source-document-v1","observed_at":"2026-10-27T13:00:00Z"}],
  "provenance_status": "observed-or-supplied",
  "canonical_destination": "https://example.com/observability",
  "conversion_event": "demo_request",
  "rights": "owned",
  "publish_authority": "draft-only"
}
```

This is a **schema illustration with synthetic values**. `source_evidence` must refer to reachable original records in the authorized work context, not mere strings manufactured by a model. Metadata never substitutes for verified permission. Unknown canonical destination may be null with a separately defined launch task. A packet imported from another tenant is not authorized without the host's tenant checks.

## Outgoing CreatorGrowthPack

Required conceptual fields:

- `schema=gencreator.growth.pack.v1`; `campaign_id`; `brand`; `audience`; `source_evidence`; `original_thesis`; `canonical_asset` (draft text/brief, target URI and exact content digest if computed)
- `channel_derivatives[]`: channel, purpose, editable draft text, citations, asset references, rights and `state=draft`
- `experiment`: hypothesis, query/prompt cohort, original baseline refs, `conversion_event`, attribution/UTM proposal, measurement horizon and proposed decision threshold
- `publication`: exact target account/URL, requested permission, current state (`draft`, `queued`, `published`, `unknown`), confirmed platform receipt only if returned
- `quality_review`: facts, originality, voice, accessibility, link check, personal-data boundary, sponsor disclosures, policy status and unrun checks

Never generate platform confirmation IDs, verified rankings, conversion totals or ROI claims as placeholders. Content proof and revenue proof are separate.

## Owning services

Starlight: search measurement, raw snapshots, product/provider cost and ranking evidence. GenCreator: CMS, DAM, video/visual editorial development, cross-channel drafts and publisher consent. FrankX: public educational proof and original founder perspective. Each existing system retains its permissions, version control and account integrations.

## Acceptance scenario

With one rights-cleared verified SEO opportunity, produce a useful draft guide and two distinct channel derivatives with evidence links, a declared conversion event, clear unknowns and no posted/scheduled state. With empty evidence, produce a research request + speculative draft only; block performance case-study claims. With an AI answer sample of n=2, state `1/2 observed citations in this specific sample` rather than `50% AI visibility`.
