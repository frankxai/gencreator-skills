---
name: gencreator-growth-studio
description: Turn verified SEO, AEO, GEO, AI Search Visibility and audience-demand opportunities into original GenCreator content editions, channel-native campaigns and measurable conversion experiments. Use when the user asks to turn Starlight Search Intelligence evidence into creator work, content, posts, videos, guides or launches; do not claim live rankings or publish without permission.
---

# GenCreator Growth Studio

Convert one *evidence-backed discovery* into a useful, original campaign. GenCreator owns creator experience and the final edition; Starlight owns search research, raw observations and opportunity provenance. FrankX is one possible publishing brand, not the mandatory voice.

## Input and boundary

Accept the `starlight.growth.handoff.v1` packet from [the handoff contract](references/handoff-contract.md), or assemble the same fields from a clearly cited user request and actual connected evidence. Resolve brand, intended audience, conversion outcome, target content page, source rights and available channel accounts. If connected Semrush/GSC/PostHog data is absent, use only supplied evidence and label the remaining metrics unknown. Do not claim that the Starlight plugin was invoked merely because its name appears in a packet.

Priority scores are *analyst heuristics*, not expected traffic or revenue. GEO and AI Search Visibility observations are specific sampled engine/model/surface/prompt results—not general AI rankings. Never turn a 2/2 citation sample into “100% AI visibility” marketing copy.

## Claude Code marketplace routing

In the `content-engine` plugin this skill is a downstream campaign producer: **run `search-authority` first** for any new durable search page and require its `PASS` commission gate (12/16 with no critical zeros). Use the local `content-creation` skill for channel-native complete drafts. The separately installed account plugin can instead route to `gencreator-produce`, `gencreator-launch` and `gencreator-operations`. Never assume cross-plugin skills are installed or that a passing commission means publication authorization.

## Make the campaign worth publishing

1. Identify the real decision the intended reader is facing and an original claim we can demonstrate. Verify any competitive, technical or quantitative claims with their original source. Separate sponsor/affiliate disclosures. When proof is missing, request proof or write a hypothesis, not a case study.
2. Produce one authoritative **canonical asset**: a guide, comparison, integration walkthrough, calculator, video, or public evidence page selected for user utility. Explicitly select the winning content type; do not generate an article by default when a tool or demonstration would be superior.
3. For durable search pages run this repository's `search-authority` commission gate; `HOLD`, `MERGE` and `KILL` decisions stop new page creation. For approved pages and creator campaigns use `content-creation` to produce complete editable native drafts. Where the separate GenCreator account plugin is installed, its `gencreator-produce`, `gencreator-launch` and `gencreator-operations` skills may accept this packet. Check actual availability before routing and record any unrun local-engine checks.
4. Build channel-native derivatives, each with its own job and hook: an insightful LinkedIn native post, an educational video/demo concept, newsletter learning, and social visual when justified. Reuse the original source, not syndicated boilerplate. Preserve tone/canon boundaries for FrankX, GenCreator, Arcanea and Starlight.
5. Prepare metadata: target queries/prompts, intent, public URL/CTA, supporting assets, source links, UTM campaign and chosen conversion event. Before sending or publishing verify exact platform account, URL, current draft revision, authorization and provider cost.
6. Produce a measurement packet with 7/28-day windows *as proposed review intervals* (not scheduled automations): first-party landing-page impressions/clicks or analytics, qualified actions and confirmed customer outcomes. Mark unavailable data as unknown; attribution to a single post is not causal proof.

## Handoff and quality gate

Return a `CreatorGrowthPack`: original campaign thesis, evidence ledger, canonical page brief or complete draft, chosen channel-ready deliverables, rights state, publish status, experiment ID, evaluation plan, and blockers. Use the schema and example in the reference. Work is `draft` until an actual publisher confirms the exact URL/post ID and review requirements. Nothing here grants scheduler, CMS, media rendering, account publishing or external spend authority.

For a product build, connect through the existing GenCreator production workflow and API only after discovering its actual tools and version; do not assume a local skill is a deployed server feature. Always include a concrete reviewable first artifact rather than stopping at strategy.
