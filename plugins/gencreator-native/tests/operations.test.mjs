import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planCreatorOperations, auditCreatorSubscriptions, designCreatorStack, callOperationsTool, operationsTools, parseOperationsJson } from '../skills/gencreator-operations/scripts/operations-core.mjs'
const brand = { id: 'studio', name: 'Example Studio', audience: 'Independent educators', channels: ['linkedin', 'website'], publisher: 'postiz', weeklyEditions: 1, sourceKind: 'owned_source', connectionState: 'unknown' }
const plan = { asOf: '2026-10-04', workspaceLabel: 'Example creator', dailyCostCapUsd: 2, brands: [brand] }
const sub = { id: 'publisher', vendor: 'Example', owner: 'Jamie', workspaceLabel: 'Example creator', purpose: 'publishing', brandIds: ['studio'], state: 'active', amount: 120, currency: 'USD', billingCycle: 'annual', renewsOn: '2026-10-20', cancellationNoticeDays: 14, evidence: 'invoice' }
const requirement = { id: 'publish', capability: 'publishing', unit: 'channels', period: 'total', units: 2, brandIds: ['studio'], allowedAccess: ['api'] }
const entitlement = { capability: 'publishing', unit: 'channels', period: 'total', capacity: 4, quotaPoolId: null }
const tool = { id: 'owned-publisher', vendor: 'Example', brandIds: ['studio'], coverage: [entitlement], access: 'api', checkedOn: '2026-10-04', evidenceRef: 'Synthetic supplied entitlement', connectionState: 'reported_connected', costState: 'subscription', subscriptionId: 'publisher' }
const offer = { id: 'candidate', vendor: 'Example offer', brandIds: ['studio'], coverage: [entitlement], access: 'api', checkedOn: '2026-10-04', evidenceRef: 'Synthetic supplied quote; not a vendor recommendation', amount: 15, currency: 'USD', billingCycle: 'monthly', coveredBySubscriptionId: null }
const stack = { asOf: '2026-10-05', workspaceLabel: 'Example creator', budget: { currency: 'USD', maxMonthlyStackCost: 30, maxNewUpfrontCost: 30 }, subscriptions: [], requirements: [requirement], ownedTools: [], offers: [], workflows: [] }
test('JSON intake rejects duplicate billing fields, escaped duplicate keys and excessive nesting', () => {
  assert.throws(() => parseOperationsJson('{"amount":348,"amount":0}'), /Duplicate JSON/)
  assert.throws(() => parseOperationsJson('{"amount":348,"\\u0061mount":0}'), /Duplicate JSON/)
  assert.throws(() => parseOperationsJson('['.repeat(42) + '0' + ']'.repeat(42)), /nesting/)
  assert.throws(() => parseOperationsJson('{'), SyntaxError)
  const records = { labels: ['quote: " and brace: }', null, true, -2.5e2], a: { amount: 3 }, b: { amount: 4 } }
  assert.deepEqual(parseOperationsJson(JSON.stringify(records)), records)
})
test('unknown cancellation notice remains a review gap before the renewal window', () => {
  const out = auditCreatorSubscriptions({ asOf: '2026-10-04', subscriptions: [{ ...sub, renewsOn: '2026-11-20', cancellationNoticeDays: null }] })
  assert.equal(out.rows[0].noticeStatus, 'unknown')
  assert.ok(out.rows[0].gaps.includes('cancellation notice unknown'))
  assert.equal(out.reviewQueue[0].id, sub.id)
})
test('plans preserve claimed versus verified connections and launch no agents', () => {
  const out = planCreatorOperations({ ...plan, brands: [{ ...brand, connectionState: 'reported_connected' }] })
  assert.equal(out.brands[0].accountVerification, 'not_checked')
  assert.equal(out.connectedAccountsVerified, false)
  assert.equal(out.costCapEnforced, false)
  assert.equal(out.externalWrites, false)
  assert.ok(out.agents.every(agent => agent.runtimeState === 'not_started'))
})
test('allocates one shared social publisher and excludes native web/email destinations', () => {
  const out = planCreatorOperations({ ...plan, brands: [brand, { ...brand, id: 'lab', channels: ['youtube', 'newsletter'], sourceKind: 'research_evidence' }] })
  assert.equal(out.writerGroups.length, 1)
  assert.equal(out.writerGroups[0].channelsNeeded, 2)
  assert.ok(out.brands[1].acceptance.includes('human scientific review'))
})
test('keeps fiction separate from real research evidence and paused lanes create no jobs', () => {
  const out = planCreatorOperations({ ...plan, brands: [{ ...brand, sourceKind: 'fiction_canon', weeklyEditions: 0 }] })
  assert.equal(out.brands[0].editorialLane, 'authored_fiction')
  assert.equal(out.jobs.length, 0)
})
test('rejects authority injection, duplicate IDs, invalid dates and nonfinite budgets', () => {
  for (const input of [{ ...plan, approved: true }, { ...plan, brands: [brand, brand] }, { ...plan, asOf: '2026-02-30' }, { ...plan, dailyCostCapUsd: Infinity }]) assert.throws(() => planCreatorOperations(input))
  assert.throws(() => planCreatorOperations({ ...plan, brands: [{ ...brand, channels: ['linkedin', 'linkedin'] }] }))
})
test('annual costs normalize without adding EUR to USD; unknown usage is explicit', () => {
  const out = auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: [sub, { ...sub, id: 'other', currency: 'EUR', amount: 25, billingCycle: 'monthly' }, { ...sub, id: 'meter', amount: null, billingCycle: 'usage' }] })
  assert.equal(out.totals.find(total => total.currency === 'USD').knownMonthlyEquivalent, 10)
  assert.equal(out.totals.find(total => total.currency === 'EUR').knownMonthlyEquivalent, 25)
  assert.deepEqual(out.totals.find(total => total.currency === 'USD').incompleteRecordIds, ['meter'])
})
test('notice deadline can precede the renewal window and cancelled costs are excluded', () => {
  const out = auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: [sub, { ...sub, id: 'old', state: 'cancelled', amount: 999 }] })
  assert.equal(out.rows[0].daysUntilRenewal, 16)
  assert.equal(out.rows[0].daysUntilNotice, 2)
  assert.equal(out.rows[0].noticeStatus, 'review_now')
  assert.equal(out.reviewQueue.length, 1)
  assert.equal(out.totals[0].knownMonthlyEquivalent, 10)
})
test('overlaps are proposals only and unrelated workspaces are not consolidated', () => {
  const out = auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: [sub, { ...sub, id: 'buffer' }, { ...sub, id: 'client', workspaceLabel: 'Client B' }] })
  assert.equal(out.overlapCandidates.length, 1)
  assert.equal(out.overlapCandidates[0].savingsVerified, false)
  assert.deepEqual(out.cancellations, [])
})
test('unknown state and missing renewal data remain review gaps', () => {
  const out = auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: [{ ...sub, state: 'unknown', amount: null, renewsOn: null, cancellationNoticeDays: null, evidence: 'unknown' }] })
  assert.equal(out.rows[0].monthlyEquivalent, null)
  assert.ok(out.rows[0].gaps.includes('subscription state unknown'))
  assert.equal(out.rows[0].noticeStatus, 'unknown')
})
test('audit rejects duplicate rows, negative costs, invalid renewal dates and missing fields', () => {
  for (const rows of [[sub, sub], [{ ...sub, amount: -1 }], [{ ...sub, renewsOn: '2026-02-30' }], [{ ...sub, owner: undefined }]]) assert.throws(() => auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: rows }))
})
test('empty inventory is an observed subtotal of no supplied rows, not free SaaS', () => {
  const out = auditCreatorSubscriptions({ asOf: plan.asOf, subscriptions: [] })
  assert.deepEqual(out.totals, [])
  assert.equal(out.accountDiscovery, 'not_performed')
  assert.throws(() => callOperationsTool('unknown', {}))
  assert.ok(operationsTools.every(tool => tool.inputSchema.additionalProperties === false))
})
test('CLI exports portable records and refuses to overwrite existing work', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gencreator-ops-'))
  try {
    const input = join(folder, 'input.json'), output = join(folder, 'output.json')
    writeFileSync(input, JSON.stringify(plan))
    const cli = fileURLToPath(new URL('../skills/gencreator-operations/scripts/operations.mjs', import.meta.url))
    const first = spawnSync(process.execPath, [cli, 'plan', input, output], { encoding: 'utf8' })
    assert.equal(first.status, 0, first.stderr)
    const bytes = readFileSync(output, 'utf8')
    assert.equal(JSON.parse(bytes).state, 'prepared_only')
    const again = spawnSync(process.execPath, [cli, 'plan', input, output], { encoding: 'utf8' })
    assert.equal(again.status, 1)
    assert.equal(readFileSync(output, 'utf8'), bytes)
    const ambiguous = JSON.stringify({ asOf: '2026-10-04', subscriptions: [sub] }).replace('"amount":120', '"amount":120,"amount":0')
    writeFileSync(input, ambiguous)
    const rejected = spawnSync(process.execPath, [cli, 'audit', input], { encoding: 'utf8' })
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /Duplicate JSON/)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

test('stack reuses owned entitlements and counts a shared subscription once across capabilities', () => {
  const writing = { ...requirement, id: 'write', capability: 'writing', unit: 'items', period: 'month' }
  const out = designCreatorStack({ ...stack, subscriptions: [sub], requirements: [requirement, writing], ownedTools: [tool, { ...tool, id: 'included-editor', costState: 'included', coverage: [{ ...entitlement, capability: 'writing', unit: 'items', period: 'month' }] }], offers: [{ ...offer, amount: 1 }] })
  assert.equal(out.costs.baselineMonthlyReserve, 10)
  assert.equal(out.costs.additionalMonthlyReserve, 0)
  assert.ok(out.decisions.every(row => row.action === 'reuse_existing'))
  assert.deepEqual(out.selectedOfferIds, [])
  assert.equal(out.purchaseAuthorized, false)
  assert.equal(out.inventoryEvidence, 'supplied_records_only')
})
test('stack allocates shared quota across brands without assuming unknown capacity is unlimited', () => {
  const lab = { ...requirement, id: 'lab-publish', brandIds: ['lab'], units: 3 }
  const out = designCreatorStack({ ...stack, subscriptions: [{ ...sub, brandIds: ['studio', 'lab'] }], requirements: [requirement, lab], ownedTools: [{ ...tool, brandIds: ['studio', 'lab'] }] })
  assert.equal(out.decisions.filter(row => row.toolId !== null).length, 1)
  const unknown = designCreatorStack({ ...stack, ownedTools: [{ ...tool, costState: 'free', subscriptionId: null, coverage: [{ ...entitlement, capacity: null }] }] })
  assert.equal(unknown.decisions[0].action, 'evaluate')
})
test('included and free offers can close gaps without adding another paid subscription', () => {
  const included = designCreatorStack({ ...stack, subscriptions: [sub], offers: [{ ...offer, amount: 0, billingCycle: 'included', coveredBySubscriptionId: sub.id }] })
  assert.equal(included.decisions[0].action, 'use_included')
  assert.equal(included.costs.proposedMonthlyReserve, 10)
  const free = designCreatorStack({ ...stack, offers: [{ ...offer, amount: 0, billingCycle: 'free' }] })
  assert.equal(free.decisions[0].action, 'try_free')
  assert.equal(free.costs.newUpfrontReserve, 0)
})
test('two views and included offers of one subscription cannot multiply its quota', () => {
  const lab = { ...requirement, id: 'lab-publish', brandIds: ['lab'], allowedAccess: ['native'], units: 3 }
  const subscription = { ...sub, brandIds: ['studio', 'lab'] }
  const api = { ...tool, brandIds: ['studio', 'lab'] }
  const native = { ...api, id: 'native-view', access: 'native', coverage: [{ ...entitlement, capacity: 10 }] }
  const input = { ...stack, requirements: [requirement, lab], subscriptions: [subscription] }
  const owned = designCreatorStack({ ...input, ownedTools: [api, native] })
  assert.equal(owned.decisions.filter(row => row.toolId !== null).length, 1)
  const included = designCreatorStack({ ...input, ownedTools: [api], offers: [{ ...offer, brandIds: ['lab'], access: 'native', billingCycle: 'included', amount: 0, coveredBySubscriptionId: sub.id }] })
  assert.equal(included.decisions.filter(row => row.toolId !== null).length, 1)
  assert.equal(included.costs.baselineMonthlyReserve, 10)
})
test('explicit credit pools conserve a shared balance across image and video capabilities', () => {
  const image = { ...requirement, id: 'image', capability: 'image', unit: 'credits', period: 'month', units: 6 }
  const video = { ...image, id: 'video', capability: 'video' }
  const pool = { ...entitlement, capability: 'image', unit: 'credits', period: 'month', capacity: 10, quotaPoolId: 'shared-media-credits' }
  const out = designCreatorStack({ ...stack, requirements: [image, video], ownedTools: [{ ...tool, costState: 'free', subscriptionId: null, coverage: [pool, { ...pool, capability: 'video' }] }] })
  assert.equal(out.decisions.filter(row => row.toolId !== null).length, 1)
  assert.throws(() => designCreatorStack({ ...stack, ownedTools: [{ ...tool, costState: 'free', subscriptionId: null, coverage: [pool, { ...pool, capability: 'video', period: 'day' }] }] }), /inconsistent unit or period/)
})
test('compares bundled additions once and respects annual cash commitments', () => {
  const analytics = { ...requirement, id: 'metrics', capability: 'analytics', unit: 'items', period: 'month' }
  const analysisCoverage = { ...entitlement, capability: 'analytics', unit: 'items', period: 'month' }
  const input = { ...stack, requirements: [requirement, analytics], offers: [{ ...offer, id: 'bundle', amount: 20, coverage: [entitlement, analysisCoverage] }, { ...offer, id: 'publisher-only', amount: 12 }, { ...offer, id: 'analytics-only', amount: 12, coverage: [analysisCoverage] }] }
  const out = designCreatorStack(input)
  assert.deepEqual(out.selectedOfferIds, ['bundle'])
  assert.equal(out.costs.additionalMonthlyReserve, 20)
  const annual = designCreatorStack({ ...stack, offers: [{ ...offer, id: 'annual', amount: 100, billingCycle: 'annual' }, offer] })
  assert.deepEqual(annual.selectedOfferIds, ['candidate'])
  assert.equal(annual.costs.newUpfrontReserve, 15)
})
test('rounds obligations upward and does not buy against unknown, usage or foreign-currency spend', () => {
  const pennies = designCreatorStack({ ...stack, budget: { ...stack.budget, maxMonthlyStackCost: 0.83, maxNewUpfrontCost: 10 }, offers: [{ ...offer, amount: 10, billingCycle: 'annual' }] })
  assert.deepEqual(pennies.selectedOfferIds, [])
  for (const bill of [{ ...sub, amount: null }, { ...sub, billingCycle: 'usage' }, { ...sub, currency: 'EUR' }, { ...sub, evidence: 'unknown' }, { ...sub, state: 'unknown' }]) {
    const out = designCreatorStack({ ...stack, subscriptions: [bill], offers: [offer] })
    assert.equal(out.costs.baselineComplete, false)
    assert.equal(out.decisions[0].action, 'evaluate')
  }
  const unknownOwned = designCreatorStack({ ...stack, ownedTools: [{ ...tool, costState: 'unknown', subscriptionId: null, coverage: [{ ...entitlement, capability: 'writing' }] }], offers: [offer] })
  assert.deepEqual(unknownOwned.costs.unknownCostToolIds, ['owned-publisher'])
  assert.equal(unknownOwned.decisions[0].action, 'evaluate')
})
test('money reserves preserve exact cents and quotas require whole units', () => {
  const out = designCreatorStack({ ...stack, budget: { ...stack.budget, maxMonthlyStackCost: 1.1, maxNewUpfrontCost: 1.1 }, offers: [{ ...offer, amount: 1.1 }] })
  assert.equal(out.costs.additionalMonthlyReserve, 1.1)
  assert.deepEqual(out.selectedOfferIds, ['candidate'])
  const micro = designCreatorStack({ ...stack, offers: [{ ...offer, amount: 1e-7 }] })
  assert.equal(micro.costs.additionalMonthlyReserve, 0.01)
  const combined = designCreatorStack({ ...stack, subscriptions: [{ ...sub, billingCycle: 'monthly', amount: 1.1 }], budget: { ...stack.budget, maxMonthlyStackCost: 3.3, maxNewUpfrontCost: 2.2 }, offers: [{ ...offer, amount: 2.2 }] })
  assert.deepEqual(combined.selectedOfferIds, ['candidate'])
  assert.equal(combined.costs.proposedMonthlyReserve, 3.3)
  assert.throws(() => designCreatorStack({ ...stack, requirements: [{ ...requirement, units: 1.1 }] }), /integer/)
  assert.throws(() => designCreatorStack({ ...stack, offers: [{ ...offer, coverage: [{ ...entitlement, capacity: 3.3 }] }] }), /allowed value/)
})
test('budget reserves current subscriptions and retains overdue renewal review', () => {
  const out = designCreatorStack({ ...stack, budget: { ...stack.budget, maxMonthlyStackCost: 24 }, subscriptions: [{ ...sub, renewsOn: '2026-09-01' }], offers: [offer] })
  assert.deepEqual(out.selectedOfferIds, [])
  assert.equal(out.subscriptionReview.reviewQueue[0].renewalStatus, 'stale_date')
  assert.equal(out.subscriptionReview.savingsVerified, false)
})
test('brand scope, API access, period and dated evidence constrain tool selection', () => {
  for (const candidate of [{ ...offer, brandIds: ['lab'] }, { ...offer, access: 'manual' }, { ...offer, coverage: [{ ...entitlement, period: 'month' }] }, { ...offer, checkedOn: '2026-09-01' }, { ...offer, checkedOn: '2026-10-06' }, { ...offer, evidenceRef: null }, { ...offer, currency: 'EUR' }]) {
    assert.equal(designCreatorStack({ ...stack, offers: [candidate] }).decisions[0].action, 'evaluate')
  }
  const inactive = designCreatorStack({ ...stack, subscriptions: [{ ...sub, state: 'cancelled' }], ownedTools: [tool] })
  assert.equal(inactive.decisions[0].action, 'evaluate')
})
test('different brands can choose different publishers and all quota axes bind to one provider', () => {
  const posts = { ...requirement, id: 'posts', unit: 'posts', period: 'month', units: 10 }
  const lab = { ...requirement, id: 'lab-publish', brandIds: ['lab'] }
  const out = designCreatorStack({ ...stack, requirements: [requirement, posts, lab], offers: [{ ...offer, id: 'studio-publisher', amount: 10, coverage: [entitlement, { ...entitlement, unit: 'posts', period: 'month', capacity: 10 }] }, { ...offer, id: 'lab-publisher', amount: 10, brandIds: ['lab'] }] })
  assert.equal(out.decisions.length, 2)
  assert.deepEqual(out.selectedOfferIds, ['lab-publisher', 'studio-publisher'])
  const studio = out.decisions.find(row => row.brandIds.includes('studio'))
  assert.deepEqual(studio.requirementIds, ['posts', 'publish'])
  assert.equal(studio.toolId, 'studio-publisher')
})
test('workflow compiler sorts dependencies and separates preparation from publishing authority', () => {
  const out = designCreatorStack({ ...stack, offers: [offer], workflows: [{ id: 'weekly', name: 'Weekly edition', brandId: 'studio', steps: [{ id: 'handoff', requirementId: 'publish', agentRole: 'courier', dependsOn: ['review'], effect: 'publish' }, { id: 'review', requirementId: 'publish', agentRole: 'reviewer', dependsOn: [], effect: 'read' }] }] })
  assert.deepEqual(out.workflows[0].steps.map(row => row.id), ['review', 'handoff'])
  assert.equal(out.workflows[0].runtimeState, 'not_deployed')
  assert.equal(out.publicationAuthorized, false)
  assert.equal(out.externalWrites, false)
  assert.ok(out.workflows[0].steps[1].gates.includes('creator approval bound to exact revision and destination'))
  assert.equal(out.workflows[0].steps[1].stackAction, 'propose_purchase')
})
test('workflow compiler rejects cycles, missing dependencies, scope mismatch and effect mismatch', () => {
  const step = { id: 'one', requirementId: 'publish', agentRole: 'courier', dependsOn: [], effect: 'publish' }
  const flow = { id: 'weekly', name: 'Weekly edition', brandId: 'studio', steps: [step] }
  for (const workflow of [{ ...flow, steps: [{ ...step, dependsOn: ['one'] }] }, { ...flow, steps: [{ ...step, dependsOn: ['absent'] }] }, { ...flow, brandId: 'lab' }, { ...flow, steps: [{ ...step, requirementId: 'missing' }] }, { ...flow, steps: [step, step] }]) assert.throws(() => designCreatorStack({ ...stack, workflows: [workflow] }))
  assert.throws(() => designCreatorStack({ ...stack, requirements: [{ ...requirement, capability: 'writing' }], workflows: [flow] }), /publishing capability/)
})
test('unresolved upstream capability blocks downstream steps and the workflow', () => {
  const writing = { ...requirement, id: 'write', capability: 'writing' }
  const out = designCreatorStack({ ...stack, requirements: [requirement, writing], offers: [offer], workflows: [{ id: 'weekly', name: 'Weekly edition', brandId: 'studio', steps: [{ id: 'draft', requirementId: 'write', agentRole: 'producer', dependsOn: [], effect: 'create' }, { id: 'handoff', requirementId: 'publish', agentRole: 'courier', dependsOn: ['draft'], effect: 'publish' }] }] })
  assert.equal(out.workflows[0].state, 'blocked')
  assert.equal(out.workflows[0].steps[0].state, 'blocked_capability_gap')
  assert.equal(out.workflows[0].steps[1].state, 'blocked_dependency')
  assert.deepEqual(out.workflows[0].steps[1].blockedDependencyIds, ['draft'])
})
test('stack rejects duplicate identifiers, ambiguous ownership, workspace mixing and purchase injection', () => {
  for (const input of [{ ...stack, approved: true }, { ...stack, buy: true }, { ...stack, offers: [offer, offer] }, { ...stack, subscriptions: [{ ...sub, workspaceLabel: 'Other client' }] }, { ...stack, requirements: [requirement, { ...requirement, id: 'duplicate' }] }, { ...stack, requirements: [requirement, { ...requirement, id: 'overlap', brandIds: ['studio', 'lab'] }] }, { ...stack, ownedTools: [tool] }, { ...stack, offers: [{ ...offer, billingCycle: 'free' }] }]) assert.throws(() => designCreatorStack(input))
  assert.equal(operationsTools.find(row => row.name === 'gencreator_design_stack').annotations.readOnlyHint, true)
  assert.deepEqual(callOperationsTool('gencreator_design_stack', stack), designCreatorStack(stack))
})
test('stack output is independent of intake order and owned connections remain unverified', () => {
  const requirements = [requirement, { ...requirement, id: 'metrics', capability: 'analytics' }]
  const offers = [offer, { ...offer, id: 'metrics-offer', coverage: [{ ...entitlement, capability: 'analytics' }], amount: 5 }]
  const first = designCreatorStack({ ...stack, requirements, offers })
  const second = designCreatorStack({ ...stack, requirements: [...requirements].reverse(), offers: [...offers].reverse() })
  assert.deepEqual(first, second)
  assert.equal(first.connectedAccountsVerified, false)
})
test('stack CLI shares the engine and writes a fresh private output without overwriting', () => {
  const folder = mkdtempSync(join(tmpdir(), 'gencreator-stack-'))
  try {
    const input = join(folder, 'input.json'), output = join(folder, 'output.json')
    writeFileSync(input, JSON.stringify({ ...stack, offers: [offer] }))
    const cli = fileURLToPath(new URL('../skills/gencreator-operations/scripts/operations.mjs', import.meta.url))
    const result = spawnSync(process.execPath, [cli, 'stack', input, output], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), designCreatorStack({ ...stack, offers: [offer] }))
    assert.equal(spawnSync(process.execPath, [cli, 'stack', input, output]).status, 1)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})
