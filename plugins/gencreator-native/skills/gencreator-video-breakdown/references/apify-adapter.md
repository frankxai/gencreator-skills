# Apify adapter: collection is a supplier, not the product

The implemented adapter is **offline import + collection planning**. It has no network client or provider credential. It does not verify that a supplied Actor/build exists, authenticate run provenance or validate actor-specific input. Live actor admission is pending. Use an existing authorized Apify connection when available; discover its actual capabilities before calling. No Apify connection was available in the authoring session.

## Import

`python3 scripts/video.py import-apify DATASET.json MAP.json`

The dataset is an exported JSON array of 1–100 objects. Export numeric provider IDs as strings to avoid precision loss. The map has `schema: gencreator.apify-map.v1`, `fields` and `provenance`.

`fields` maps each normalized key to a dot-separated actor-specific field path or null: `id, url, creator, views, published_at, duration_seconds, transcript`. Identity paths cannot be null; absent optional fields stay null. No guessed union of output fields. `provenance` has `actor, build, run_id, dataset_id, observed_at, actual_cost_usd`. Timestamp includes timezone; actual cost is null unless observed in a provider receipt. A dataset is not a payment receipt.

The output preserves dataset/map digests, provider lineage and canonical video identity. Repeated IDs or YouTube/Instagram/TikTok URL aliases fail rather than silently inflating a sample. Signed URLs, tracking parameters and raw actor extras are not copied into the normalized output. No media download occurs. Raw captions/transcripts remain untrusted. Public availability does not establish rights to reuse.

Paid status, audience segment, elapsed measurement window, media inspection and reuse rights are deliberately not inferred. A lifetime play count is not the existing outlier analyzer's matched-age `views_7d` metric. Enrich with verified equal-age snapshots, paid status and segment before using the existing outlier owner. Do not coerce missing values to zero or unknown boosting to organic.

## Proposed run

`python3 scripts/video.py plan REQUEST.json`

Request fields: `actor, build, input, input_schema_ref, max_usd, max_items, timeout_seconds`.

Actor ID is provider ID or `owner~actor`; build is a pinned numeric build, never `latest`. Actor-specific `input` must be independently checked against that build's current input schema and include only authorized public targets. The URL in `input_schema_ref` is a provenance pointer, not an executed verification. Budget is >0 and <=10 USD, item cap 1–100, timeout 1–300 seconds. These are conservative local planning limits, not a pricing claim. Common credential fields in the input are rejected. Output is `planned_only` with a digest, proposed endpoint/body and unresolved execution dependencies.

Before implementing live collection:

- Admit Apify and each specific actor/build in the canonical technology registry; verify actor input/output samples, rights, pricing model and provider processing location. Preserve approved existing runtime and storage. No second media store is introduced here.
- Bind authenticated tenant/workspace, user authorization, allowed targets, map revision, root budget and durable reservation to the plan digest. Use a server-side bearer credential; never a query token or source-file secret.
- Start asynchronously, persist run ID, inspect terminal status, then read bounded dataset pages. `maxItems` limits charged results for pay-per-result actors and does not cap returned rows. `maxTotalChargeUsd` is the provider cost cap. Record run/build/dataset IDs and actual cost separately.
- Never blindly retry an ambiguous POST. Reconcile using durable state and provider receipts; unknown start state blocks another start. Test cancellation, timeout, quota errors, partial datasets, duplicate callbacks, cross-tenant denial and cleanup before enabling watchlists.
- Raw media acquisition needs a separately reviewed allowlisted fetch path with redirect/DNS/private-address checks, MIME/size/time caps and deletion propagation. This package deliberately has no generic URL downloader.

Official API contracts checked 2026-11-05:

- https://docs.apify.com/api/v2/actors-runs-post
- https://docs.apify.com/api/v2/dataset-items-get

No specific Store Actor is endorsed or billed by this package. Current actor schema/build, account terms and costs must be checked on admission. Do not call the planned request a working live integration.
