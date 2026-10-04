import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planCreatorOperations, auditCreatorSubscriptions, callOperationsTool, operationsTools, parseOperationsJson } from '../skills/gencreator-operations/scripts/operations-core.mjs'
const brand = { id: 'studio', name: 'Example Studio', audience: 'Independent educators', channels: ['linkedin', 'website'], publisher: 'postiz', weeklyEditions: 1, sourceKind: 'owned_source', connectionState: 'unknown' }
const plan = { asOf: '2026-10-04', workspaceLabel: 'Example creator', dailyCostCapUsd: 2, brands: [brand] }
const sub = { id: 'publisher', vendor: 'Example', owner: 'Jamie', workspaceLabel: 'Example creator', purpose: 'publishing', brandIds: ['studio'], state: 'active', amount: 120, currency: 'USD', billingCycle: 'annual', renewsOn: '2026-10-20', cancellationNoticeDays: 14, evidence: 'invoice' }
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
