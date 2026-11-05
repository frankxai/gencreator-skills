# GenCreator native workflows

Private alpha candidate: three local skills for creators with owned source material. Named creator job: Frank prepares one source-based edition per active brand, keeps research evidence separate from fiction canon, and reviews publishing ownership and subscription exposure each week. Python 3.10+ runs source/revision checks. Node 22+ runs the existing GenCreator v0.5.0 launch engine and v0.2.0 operations engine. No API key or GenCreator account is required for local workflows.

- GenCreator Producer: editorial drafting in the host model, exact source spans, voice preservation, draft review receipts and production handoffs.
- GenCreator Launch: editable page/email/social/search copy, local compilation, integrity verification and supplied-metric calculations.
- GenCreator Operations: separate brand lanes, proposed weekly jobs and four agent roles, plus a supplied-record subscription audit with currency subtotals, renewal/notice windows and publishing-overlap candidates, plus CreatorStack decisions using supplied entitlements and dated offers. Stack design allocates brand quotas and shared credit pools, compares fixed/upfront reserves and prepares workflow dependency graphs; it does not discover accounts, buy tools or execute jobs.

The model writes and judges creative work. The scripts validate and arrange inputs. Source substring matches do not prove truth, entailment or ownership. Confirmation receipts do not verify reviewer identity or authorize publication.

## Installation

Supported local clients can add the repository marketplace with `codex plugin marketplace add frankxai/gencreator-skills --ref <reviewed-release-ref>` and install GenCreator from that source. This candidate must land before main includes it. Root plugin.json and mcp.json follow the portable Agent Plugins formats. Skill installations alone work in ChatGPT Work with filesystem execution.

For ChatGPT remote tools, enable developer mode when available and register `https://gencreator.ai/api/mcp` through Plugins → plus. This package does not invent a registered app ID or silently connect an account. Test initialization, tools/list and representative calls in the actual host; this candidate is not directory-published. Workflows remain usable locally when remote tools are disabled.

Public remote operations process submitted data on GenCreator infrastructure. Use them only when the user chooses that processing path. Private workspace tools remain HOLD while OAuth and managed readiness are unproven. On 2026-10-02 the production manifest and v0.5.0 bundle responded 200; OAuth metadata responded 503.

## Verify

Run `python3 -m unittest discover -s plugins/gencreator-native/tests -v`, `node --test plugins/gencreator-native/tests/operations.test.mjs` and `node plugins/gencreator-native/scripts/verify-projections.mjs`. Validate all three skills and exercise the launch CLI against a new output directory. A private Plugin Creator import is distinct from a customer-paid release or remote connection. The second-provider review and actual creator-media dogfood remain release gates. No migration, billing changes, agent launch or publishing are bundled.

## Scope and ownership

This package distributes the existing GenCreator launch and operations runtimes and includes a local source/evidence receipt workflow. The product and managed APIs remain owned by frankxai/gencreator.ai. The operations source projection records its origin and hashes in `operations-provenance.json`. These local receipts are separate from authenticated CreatorPack and Mission records. No customer sources, invoices, account IDs or private operator context ship in the package.

Public remote operations process supplied inputs on GenCreator infrastructure. Prefer the local Operations CLI for private billing and research records. Installing this candidate does not mean new remote tools are deployed: inspect `tools/list`, and use local execution if absent. Planned agent roles are not live deployments, a proposed budget is not enforced, and a prepared plan is not a publishing approval.
