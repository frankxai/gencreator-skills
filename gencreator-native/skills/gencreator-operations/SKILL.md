---
name: gencreator-operations
description: Prepare a creator's multi-brand research, content, publishing, agent and SaaS operating plan. Use for stack selection, owned subscriptions, brand quotas, workflow bindings, source and IP lineage, channel ownership and renewal reviews. Runs locally without inference keys; never implies connected accounts or permission to publish.
---

# GenCreator operations

Keep the creator's sources, content revisions, research evidence and results portable across tools. Use one publishing owner for each exact destination; keep the existing provider when it works. Read the supplied account and brand records before recommending a purchase or migration.

## Prepare the operating packet

Resolve brand, audience, source kind, channels and weekly edition count from current supplied records. Label proposed channels explicitly. Keep documentary research and fictional canon separate. Do not invent handles, account connections, rights, receipts, scientific findings, invoices or agent deployments.

Run the dependency-free engine from this skill directory:

```bash
node scripts/operations.mjs plan /absolute/path/brands.json /absolute/path/operations-plan.json
node scripts/operations.mjs audit /absolute/path/subscriptions.json /absolute/path/subscription-audit.json
node scripts/operations.mjs stack /absolute/path/stack-input.json /absolute/path/creator-stack.json
```

The CLI refuses to overwrite an existing output. Preserve earlier plans and give each revision a new path. Local files contain supplied records; keep private billing and source data out of public repositories and publish only an intentionally selected projection. Save the final user-facing packet using the host's persistent file workflow.

Read [the contract](references/operations-contract.md) for exact input fields. When these public tools are actually exposed by the connected server, use `gencreator_plan_operations`, `gencreator_audit_subscriptions` or `gencreator_design_stack` with the same input. A repository change does not make the tools available on the production endpoint. Use the local engine when the remote version does not expose them.

## Design the creator's stack

Treat CreatorStack as the creator-owned inventory, requirements, tool decisions and workflow bindings alongside the source-bound CreatorPack. Start with supplied subscriptions and actual brand requirements, not a list of vendors to buy. Record entitlement capacity by unit and period, brand scope, available access mode and dated evidence. UI access does not imply API access. Unknown quota is not unlimited capacity. Record an explicit shared quota pool when different capabilities consume one credit balance; if pooling is unknown, retain unknown capacity.

Reuse suitable owned tools first; examine included entitlements and free options before proposing an additional license. The engine compares up to twelve supplied offers under monthly and upfront limits, counting a shared subscription once and allocating quota across brands. Its deterministic allocation produces a cost proposal. It leaves vendor quality to editorial judgment and does not guarantee a global optimum. Report omitted usage, tax and FX. Unknown current costs block additional paid proposals; a supplied empty ledger is not account discovery. Read current primary provider sources before supplying quotes, limits or feature claims; preserve the evidence reference and check date.

Bind each workflow step to a requirement, brand, agent role, dependency and intended effect. The compiler rejects missing dependencies, cycles, scope mismatches and ambiguous publishing ownership. Its graph is prepared, not executed. Show unresolved gaps and separate owner purchase decisions, verified connections, source rights and exact revision publication approval. Keep credentials in the authenticated connection service, never in the stack packet.

## Apply editorial judgment

Choose one lead edition per active brand, bound to owned source or reviewed evidence. Prepare distinct channel treatments; retain an editable master, source links, rights state and exact revision. For science, preserve claim-level support, method, dataset/experiment artifacts and uncertainty. A benchmark proposal is not a result. For fiction, preserve canon and contribution history without presenting lore as research evidence.

Use the host model for writing and editorial decisions. Use deterministic code for parsing, deduplication, hashing, totals, queue state and receipts. Propose a workhorse model for normal production; reserve stronger reasoning for contested claims, important research decisions and release review. Read current official pricing before producing an inference estimate. A proposed daily ceiling is not an enforced budget.

Treat the four engine roles as planned jobs, not running agents. Create runtime deployments only through the owning product's authorized workflow. Local workers own private intake and media work; cloud jobs own bounded, durable execution. Keep a single orchestrator per workflow and record provider/model, tokens, spend, attempts and final artifact ID.

## Review costs and delivery

Use only supplied billing evidence in the audit. Report fixed-cost subtotals separately by currency. Retain unknown costs, usage spend, stale renewals, trials and cancellation notice windows. Potential overlapping publishers are review candidates; do not claim savings before an owner decision and measured migration. Never cancel, upgrade or purchase through this workflow.

Route approved text and selected media to the chosen publisher. Resolve exact destination IDs, current rights and an unchanged review before any external write. Draft creation, scheduling and publication are distinct actions. Do not use a local digest or a prepared handoff as publishing authority.

Close the packet with current state, unresolved evidence and one next gate. A provider accepted response is not a published post. Results need a reconciled provider post ID, URL and measurement window. Propose changes to future voice/strategy; preserve the creator's current canon until reviewed.
