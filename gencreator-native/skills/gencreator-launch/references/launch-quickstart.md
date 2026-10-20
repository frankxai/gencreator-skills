# Your first launch packet

Start with one owned source, one audience and one offer. This pack creates draft assets and a connection checklist. It does not set up accounts or deliver a live funnel.

Use Node 22 or newer. Keep customer work outside the extracted plugin so upgrades cannot overwrite it. In the commands below, start in your customer workspace with the installed `gencreator-launch` skill folder accessible; replace `../gencreator-launch` with its actual absolute path:

```sh
node ../gencreator-launch/scripts/launch.mjs doctor
node ../gencreator-launch/scripts/launch.mjs init my-launch
```

Open `my-launch/launch.json`. Keep your existing CreatorPack and mission IDs where available. Fill the empty brand and offer fields. Paste an owned or licensed source and change its permission from `unconfirmed` to `owned` or `licensed` only when true. Select an exact `source.excerpt` of at most 1,200 characters and mark `redistribution` as `permitted` only if you have that right. Evidence quotes must occur in this permissioned excerpt. Choose `waitlist` or `lead-magnet`, channels, a lead target/window and the definition of a qualified lead. Provider decisions start as `undecided`; they need not block drafting.

Ask your agent to write and refine the `drafts` fields using the source. They cover page copy, three email subjects/bodies, LinkedIn and a search answer. Empty or whitespace-only drafts use starter copy. Every edited draft is included in the revision digest; the compiler does not paste the full source into output channels. Draft overrides remain your editorial responsibility: review their claims, privacy and rights before sharing. LinkedIn output is capped at 2,800 characters and each compiled file at 40,000. Use `node ../gencreator-launch/scripts/launch.mjs schema` for the machine-readable manifest schema.

```sh
node ../gencreator-launch/scripts/launch.mjs inspect my-launch/launch.json
node ../gencreator-launch/scripts/launch.mjs compile my-launch/launch.json draft-01
```

Inspect reports missing decisions; exit code 2 means the brief needs input. Compile requires those blocking inputs, but account verification can remain pending. You get a source-based brief, website copy, selected channel drafts, relationship worksheet, event contract and experiment definition. Review every file in `draft-01`. Confirm that the source excerpts support the intended meaning in context. Quotation matching does not establish truth or buyer validation. Delivery settings, sender identity, consent and unsubscribe footers must be completed in the provider workflow before sending the clean email drafts.

The CLI prints a `sha256:…` digest. After reviewing the packet, copy its full digest into this command in place of `REVIEWED_DIGEST`:

```sh
node ../gencreator-launch/scripts/launch.mjs export my-launch/launch.json REVIEWED_DIGEST reviewed-01
node ../gencreator-launch/scripts/launch.mjs verify reviewed-01
```

A change to the input invalidates the prior digest. Edit copy in `launch.json.drafts` and compile into `draft-02`; keep earlier directories for comparison. Export state `digest_confirmed` means the supplied digest matches, not that an authenticated person reviewed it. `verify` detects missing, extra, changed files and packet-content tampering; it cannot establish reviewer identity or defeat someone deliberately recomputing all hashes. Never edit `packet.json` to simulate a review. Only a final `packet.json` marks a completed directory; if a disk write fails, inspect the partial directory and choose a fresh output path on retry.

For a fixture run, use `../gencreator-launch/examples/launch.json` instead of your own file. It is a fictional workbook with refined example copy and uses example.com. It demonstrates compilation only; its CTA is not a live capture flow. `doctor` checks runtime compatibility and module loading only, not accounts or output permissions.

## Measure one cohort

Create `metrics.json` with real counts. All counts must describe the same people/cohort, date window and counting unit; deduplicate before using this tool. Use null for unknown counts:

```json
{
  "packId": "my-creator-pack",
  "missionId": "first-launch",
  "cohort": "newsletter-september",
  "start": "2026-09-01",
  "end": "2026-09-30",
  "visitors": 120,
  "leads": 12,
  "qualifiedLeads": null,
  "customers": null,
  "goal": { "target": 10, "windowDays": 30 }
}
```

```sh
node ../gencreator-launch/scripts/launch.mjs measure metrics.json
```

Rates include a reason distinguishing unknown counts from a zero denominator. The result reports target progress and whether the observed window matches the planned one; it still diagnoses known capture problems when sales are unknown. This contract describes a lead-capture cohort: customers must be a subset of its leads. Direct-purchase cohorts require a separate reporting contract. These are descriptive ratios, not attribution or A/B test significance. The example counts above are illustrative.

## Connect the next layer

Use the website you already own; Next.js and Vercel are the default when code ownership matters. Resend is the default delivery adapter, while an existing email platform may already provide segmentation and journeys. Add Supabase only when the workflow needs durable contacts, events, approvals or account state beyond the existing provider. Postiz remains the publishing handoff. Confirm credentials in each provider's own supported connection flow, never in launch.json.

The download is the canonical local runtime. On a host with MCP support, the four launch tools accept the same JSON and return the same packet. Default to local execution. Public MCP sends supplied source text to GenCreator's server; choose it only when you want that material processed there. Check `tools/list` before use. A version 0.4.0 endpoint lacks the launch tools: fall back to the local CLI until the 0.5.0 endpoint is deployed and verified. ChatGPT, Codex and other hosts vary in plugin, script and export support; installation is not evidence of a working provider connection.

