# Operations packet contract

JSON intake rejects duplicate fields (including escaped equivalent keys), malformed UTF-8 and nesting beyond 40 levels. Resolve conflicting billing evidence before calculating totals. An active or trial subscription with an unknown cancellation notice is retained in the review queue even when renewal is later.

Engine version: 0.1.0. All objects reject unknown fields. No I/O or model calls occur in the core. The public HTTP/MCP adapters bound the request to 512 KiB; the local CLI applies the same byte ceiling and refuses output overwrite.

## Plan input

Provide `asOf` as a real YYYY-MM-DD date from 2000 onward, `workspaceLabel`, `dailyCostCapUsd` (0–5000) and 1–12 `brands`.

Each brand requires `id` (lowercase letters/digits/underscores/hyphens, unique), `name`, `audience`, `channels`, `publisher`, `weeklyEditions`, `sourceKind` and `connectionState`.

- Channels: linkedin, instagram, x, threads, youtube, tiktok, pinterest, newsletter, website. Each is unique within the brand. Count actual accounts separately before buying a plan; this list is a planning approximation.
- Publisher: postiz, buffer, metricool or manual. Newsletter and website remain native owned destinations and do not consume social-publisher capacity in this estimate.
- Editions: integer 0–7. Zero pauses the brand's planned jobs.
- Source kind: owned_source, research_evidence or fiction_canon. These select different editorial acceptance requirements.
- Connection state: unknown, reported_connected or reported_disconnected. All are caller reports; the engine never verifies accounts.

Example:

```json
{"asOf":"2026-10-04","workspaceLabel":"Example Studio","dailyCostCapUsd":2,"brands":[{"id":"studio","name":"Example Studio","audience":"Independent educators","channels":["linkedin","website"],"publisher":"postiz","weeklyEditions":1,"sourceKind":"owned_source","connectionState":"unknown"}]}
```

Output includes social publisher groups, native destinations, editorial requirements, a portable persistence contract, planned jobs and four inactive role definitions. Cost caps are proposals; no budget is enforced and no agent is launched. The plan is not an account, rights or scientific verification.

## Audit input

Provide `asOf` and 0–200 `subscriptions`. Every row requires:

`id`, `vendor`, `owner`, `workspaceLabel`, `purpose`, `brandIds`, `state`, `amount`, `currency`, `billingCycle`, `renewsOn`, `cancellationNoticeDays`, `evidence`.

Purpose: publishing, research, creation, crm, analytics, hosting, storage, agent_runtime or other. State: active, trial, cancelled or unknown. Amount is the supplied charge per billing cycle (nonnegative number or null). Currency is an uppercase three-letter code. Cycle: monthly, annual, usage or unknown. Renewal is a real YYYY-MM-DD date or null. Cancellation notice is 0–365 whole days or null. Evidence: invoice, provider_export, owner_report or unknown. Do not submit credentials, payment instruments, private URLs or invoice bodies.

```json
{"asOf":"2026-10-04","subscriptions":[{"id":"publisher","vendor":"Example provider","owner":"Jamie","workspaceLabel":"Example Studio","purpose":"publishing","brandIds":["studio"],"state":"active","amount":120,"currency":"USD","billingCycle":"annual","renewsOn":"2026-10-20","cancellationNoticeDays":14,"evidence":"owner_report"}]}
```

Annual costs divide by twelve; monthly equivalents round to two decimals for reporting. Trials with a supplied price are included as exposure, not claimed paid spend. Unknown-state costs are excluded from the known subtotal and retained as incomplete records. Usage-based spend, unknown bills, taxes and foreign exchange are not inferred. Each currency retains its own subtotal. An empty inventory means no supplied records, not no subscriptions.

Review renewals/notice deadlines within fourteen days. Past dates remain stale rather than being silently advanced. Overlap proposals require the same workspace, publishing purpose and at least one shared brand; they do not inspect actual destination-level duplication. Cancelled records do not contribute costs or renewal actions. The output never cancels, upgrades or buys a subscription.
