# Operations packet contract

JSON intake rejects duplicate fields (including escaped equivalent keys), malformed UTF-8 and nesting beyond 40 levels. Resolve conflicting billing evidence before calculating totals. An active or trial subscription with an unknown cancellation notice is retained in the review queue even when renewal is later.

Engine version: 0.2.0. All objects reject unknown fields. No I/O or model calls occur in the core. The public HTTP/MCP adapters bound the request to 512 KiB; the local CLI applies the same byte ceiling and refuses output overwrite.

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

## CreatorStack input

Use CLI command `stack`, MCP tool `gencreator_design_stack` or HTTP `POST /api/creator-operations` with `{ "operation": "stack", "input": ... }`. Every field below is required, including empty arrays and nullable values. The result is `gencreator.creator-stack.v1`, a prepared proposal based on supplied inventory. Account connections and runtime execution require separate verification.

Top level: `asOf`, `workspaceLabel`, `budget`, `subscriptions`, `requirements`, `ownedTools`, `offers`, `workflows`. Budget: `currency`, `maxMonthlyStackCost` and `maxNewUpfrontCost`, each nonnegative and at most 100,000,000. Subscriptions use the audit row schema above; all rows must match this workspace. Record shared invoices once, with stable IDs and explicit eligible brands. Empty supplied records do not prove that the creator has no subscriptions.

Requirements (1–36): `id`, `capability`, `unit`, `period`, `units`, `brandIds`, `allowedAccess`. Capabilities: research, science_review, writing, image, video, audio, design, asset_storage, ip_registry, publishing, analytics, crm, email, commerce, community, workflow_runtime. Access: local, native, api, mcp, manual. Period: day, month, run, total. Units are whole quantities from 1 to 1,000,000,000,000; convert fractional measurements to an appropriate whole unit before intake (for example, seconds or bytes). Unit labels must match exactly between requirements and coverage.

One group comprises a capability and the same brand set. Give each quota axis (capability, unit, period) once within that group; its one chosen tool must satisfy all axes and access constraints. Across groups, a brand may have only one owner for a capability. Separate brands may use different providers. At most 18 groups are supported. Groups do not represent exact destination IDs; publishing preflight must still resolve those IDs.

Every owned tool (0–60) requires `id`, `vendor`, `brandIds`, `coverage`, `access`, `checkedOn`, `evidenceRef`, `connectionState`, `costState`, `subscriptionId`. Coverage (1–36 entries): `capability`, `unit`, `period`, `capacity`, `quotaPoolId`. Pool ID is a lowercase identifier or null. Use the same nonnull pool ID whenever multiple capabilities or tools consume one shared balance (for example, image and video credits); preserve independent pool IDs only with supplied entitlement evidence. Capacity is a whole nonnegative quantity up to 1,000,000,000,000 or null; null is unknown, never unlimited. Check date is a real date or null; evidence reference is nonempty text up to 500 characters or null. Never include credentials, private capability URLs or invoice bodies. Connection state: unknown, reported_connected, reported_disconnected, reported_local. Cost state: subscription, included, free, local, unknown. Subscription/included tools reference an existing ledger row; other states require a null subscription ID. Eligible bill state is active or trial, and its brand scope must cover the tool. All connections and evidence remain independently unverified.

Every offer (0–12) requires the same first eight fields as an owned tool, plus `amount`, `currency`, `billingCycle`, `coveredBySubscriptionId`. Cycle: monthly, annual, free, included, usage, unknown. Amount is a nonnegative supplied price up to 100,000,000 or null. Free offers require zero. Included offers require zero incremental price and an active/trial, brand-eligible supplied subscription; all other offers require a null reference. Price and entitlement evidence must be dated no later than `asOf` and within 31 days. The 31-day window defines comparison freshness. Provider verification remains a separate check. No vendor prices, plan features or API entitlements are inferred by the engine.

Selection first reuses eligible owned tools with adequate scope, capacity and access. Reported connected/local views precede others, then active precedes trial for the same connection rank, then tool ID; most-constrained groups precede others. It compares at most 4,096 subsets of eligible offers, allocating remaining groups in a deterministic most-constrained-first order. It maximizes covered groups, then minimizes additional monthly reserve, upfront commitment, number of new tools and stable IDs. This is not a guaranteed global allocation optimum, a quality comparison or a recommendation from the whole market. An unsuitable or expensive supplied offer is not proof that no better vendor exists.

Quota usage uses an explicit named pool when supplied, otherwise subscription ID plus capability/unit/period across its access views and included offers. Named pools require consistent unit and period across capabilities. The smallest supplied known capacity across eligible views is used conservatively. Independent tools without a subscription or named pool default to tool ID plus axis. This prevents counting one shared balance twice. The engine cannot discover whether balances are shared; mark unknown cross-capability pooling as unknown capacity rather than inventing independent quotas. Unknown current price, cost state, usage cost, billing evidence or mixed currencies block additional positive-price proposals. Zero-cost additions may still be proposed while an existing budget is incomplete or exceeded. No cancellation is assumed to free budget.

Fixed monetary obligations reserve two decimal places upward using decimal arithmetic; annual prices divide by twelve before reserving. Shared invoices and selected offers are counted once. The upfront limit covers each newly selected annual commitment in full or the first monthly payment. It excludes existing renewals and future monthly payments. Neither cap is enforced during execution. Model/API/media usage, tax, FX and unreported bills are omitted and remain separate cost gaps. Audit subtotals retain the audit's reporting rounding; reserves serve the stricter proposal budget.

Workflows (0–12): `id`, `name`, `brandId`, `steps` (1–48). Each step requires `id`, `requirementId`, `agentRole`, `dependsOn`, `effect`. Roles: scout, editor, producer, reviewer, courier, analyst. Effects: read, create, publish. Requirement must include this brand; publication must bind the publishing capability. Dependencies must reference distinct local step IDs. Duplicate IDs, missing nodes and cycles fail validation. Output steps are ordered by dependencies. Missing tool bindings block a step; blocked upstream nodes propagate to downstream nodes and workflow state. Every graph remains `not_deployed`.

Example uses synthetic prices and entitlements, not a recommendation or the creator's actual inventory:

```json
{"asOf":"2026-10-05","workspaceLabel":"Example creator","budget":{"currency":"USD","maxMonthlyStackCost":30,"maxNewUpfrontCost":30},"subscriptions":[],"requirements":[{"id":"publish","capability":"publishing","unit":"channels","period":"total","units":2,"brandIds":["studio"],"allowedAccess":["api"]}],"ownedTools":[],"offers":[{"id":"example-offer","vendor":"Synthetic publisher","brandIds":["studio"],"coverage":[{"capability":"publishing","unit":"channels","period":"total","capacity":4,"quotaPoolId":null}],"access":"api","checkedOn":"2026-10-05","evidenceRef":"Synthetic fixture, not an actual provider quote","amount":15,"currency":"USD","billingCycle":"monthly","coveredBySubscriptionId":null}],"workflows":[{"id":"weekly","name":"Weekly handoff","brandId":"studio","steps":[{"id":"handoff","requirementId":"publish","agentRole":"courier","dependsOn":[],"effect":"publish"}]}]}
```

The response retains supplied quote references, selected offer obligations, per-brand decisions, renewal/overlap reviews and blocked workflow steps. Every new license requires a separate owner decision. Connections, per-run limits, current rights, exact revision/destination approval, idempotency preflight and provider receipt reconciliation are gates before execution. The compiler supplies no purchase, cancellation or publication authority.
