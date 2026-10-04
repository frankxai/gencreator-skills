/** GenCreator operations planning. Supplied records only; no I/O or inference. */
export const operationsVersion = '0.1.0'

/** Reject ambiguous JSON before a duplicate field can silently replace billing evidence. */
export function parseOperationsJson(source) {
  const parsed = JSON.parse(source)
  let offset = 0
  const space = () => { while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++ }
  function string() {
    const start = offset++
    while (offset < source.length) {
      const char = source[offset++]
      if (char === '\\') offset++
      else if (char === '"') return JSON.parse(source.slice(start, offset))
    }
    throw new Error('Invalid JSON string.')
  }
  function value(depth) {
    if (depth > 40) throw new Error('JSON nesting exceeds 40 levels.')
    space()
    if (source[offset] === '{') {
      offset++; space()
      const keys = new Set()
      if (source[offset] === '}') { offset++; return }
      for (;;) {
        space()
        const key = string()
        if (keys.has(key)) throw new Error('Duplicate JSON field. Preserve and resolve the conflicting evidence before auditing.')
        keys.add(key); space(); offset++ // JSON.parse already checked the colon.
        value(depth + 1); space()
        if (source[offset++] === '}') return
      }
    } else if (source[offset] === '[') {
      offset++; space()
      if (source[offset] === ']') { offset++; return }
      for (;;) {
        value(depth + 1); space()
        if (source[offset++] === ']') return
      }
    } else if (source[offset] === '"') string()
    else while (offset < source.length && !/[\s,\]}]/.test(source[offset])) offset++
  }
  value(0)
  return parsed
}
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })
const text = (maxLength = 160) => ({ type: 'string', minLength: 1, maxLength })
const id = { ...text(80), pattern: '^[a-z0-9][a-z0-9_-]*$' }
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
const nullableDate = { anyOf: [date, { type: 'null' }] }
const channels = ['linkedin', 'instagram', 'x', 'threads', 'youtube', 'tiktok', 'pinterest', 'newsletter', 'website']
const publishers = ['postiz', 'buffer', 'metricool', 'manual']
const sourceKinds = ['owned_source', 'research_evidence', 'fiction_canon']
const planSchema = object({
  asOf: date,
  workspaceLabel: text(100),
  dailyCostCapUsd: { type: 'number', minimum: 0, maximum: 5000 },
  brands: { type: 'array', minItems: 1, maxItems: 12, items: object({
    id, name: text(100), audience: text(300),
    channels: { type: 'array', minItems: 1, maxItems: channels.length, uniqueItems: true, items: { enum: channels } },
    publisher: { enum: publishers },
    weeklyEditions: { type: 'integer', minimum: 0, maximum: 7 },
    sourceKind: { enum: sourceKinds },
    connectionState: { enum: ['unknown', 'reported_connected', 'reported_disconnected'] },
  }) },
})
const auditSchema = object({
  asOf: date,
  subscriptions: { type: 'array', maxItems: 200, items: object({
    id, vendor: text(100), owner: text(100), workspaceLabel: text(100),
    purpose: { enum: ['publishing', 'research', 'creation', 'crm', 'analytics', 'hosting', 'storage', 'agent_runtime', 'other'] },
    brandIds: { type: 'array', maxItems: 12, uniqueItems: true, items: id },
    state: { enum: ['active', 'trial', 'cancelled', 'unknown'] },
    amount: { anyOf: [{ type: 'number', minimum: 0, maximum: 100000000 }, { type: 'null' }] },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    billingCycle: { enum: ['monthly', 'annual', 'usage', 'unknown'] },
    renewsOn: nullableDate,
    cancellationNoticeDays: { anyOf: [{ type: 'integer', minimum: 0, maximum: 365 }, { type: 'null' }] },
    evidence: { enum: ['invoice', 'provider_export', 'owner_report', 'unknown'] },
  }) },
})

function fail(path, message) { throw new Error(`${path}: ${message}`) }
function validate(value, schema, path = 'input') {
  if (schema.anyOf) {
    if (!schema.anyOf.some(option => { try { validate(value, option, path); return true } catch { return false } })) fail(path, 'does not match an allowed value')
    return
  }
  if (schema.enum && !schema.enum.includes(value)) fail(path, 'unsupported value')
  if (schema.type === 'null' && value !== null) fail(path, 'expected null')
  if (schema.type === 'string') {
    if (typeof value !== 'string') fail(path, 'expected text')
    const n = Array.from(value).length
    if (schema.minLength !== undefined && (!value.trim() || n < schema.minLength)) fail(path, 'text is empty')
    if (schema.maxLength !== undefined && n > schema.maxLength) fail(path, 'text is too long')
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(path, 'invalid format')
    if (schema === date && (Number(value.slice(0, 4)) < 2000 || Number.isNaN(Date.parse(value)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) fail(path, 'invalid calendar date')
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number')
    if (schema.type === 'integer' && !Number.isInteger(value)) fail(path, 'expected an integer')
    if (value < schema.minimum || value > schema.maximum) fail(path, 'outside the allowed range')
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) fail(path, 'expected an array')
    if (value.length < (schema.minItems ?? 0) || value.length > schema.maxItems) fail(path, 'outside the item limit')
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail(path, 'duplicate items')
    value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`))
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object')
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) fail(`${path}.${key}`, 'unknown field')
    for (const key of schema.required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'required')
    for (const key of Object.keys(value)) validate(value[key], schema.properties[key], `${path}.${key}`)
  }
}
function uniqueIds(records, path) {
  if (new Set(records.map(row => row.id)).size !== records.length) fail(path, 'duplicate IDs')
}
function round(value) { return Math.round((value + Number.EPSILON) * 100) / 100 }
const boundary = { state: 'prepared_only', externalWrites: false, modelInference: false, persistentWorkspace: false, connectedAccountsVerified: false, publicationAuthorized: false }

export function planCreatorOperations(input) {
  validate(input, planSchema)
  uniqueIds(input.brands, 'input.brands')
  const brands = input.brands.map(brand => ({
    ...brand, accountVerification: 'not_checked',
    editorialLane: brand.sourceKind === 'fiction_canon' ? 'authored_fiction' : brand.sourceKind === 'research_evidence' ? 'evidence_led_research' : 'expert_content',
    publicationState: 'unconfigured',
    nativeDestinations: brand.channels.filter(channel => channel === 'website' || channel === 'newsletter'),
    socialDestinations: brand.channels.filter(channel => channel !== 'website' && channel !== 'newsletter'),
    acceptance: brand.sourceKind === 'research_evidence'
      ? ['source URLs and retrieval dates', 'claim-level supporting evidence', 'methods and reproduction artifacts', 'human scientific review', 'rights and exact edition review']
      : brand.sourceKind === 'fiction_canon'
        ? ['canon version and original contribution', 'source and asset rights', 'character and visual continuity', 'human edition review']
        : ['owned source and rights state', 'source-linked claims', 'creator voice and edit history', 'human edition review'],
  }))
  const writerGroups = publishers.map(provider => ({
    provider, brandIds: brands.filter(brand => brand.publisher === provider && brand.socialDestinations.length).map(brand => brand.id),
    channelsNeeded: brands.filter(brand => brand.publisher === provider).reduce((sum, brand) => sum + brand.socialDestinations.length, 0),
  })).filter(group => group.brandIds.length)
  const active = brands.filter(brand => brand.weeklyEditions > 0)
  return {
    schema: 'gencreator.operations-plan.v1', version: operationsVersion, asOf: input.asOf, workspaceLabel: input.workspaceLabel,
    ...boundary, brands, writerGroups,
    weeklyEditions: active.reduce((sum, brand) => sum + brand.weeklyEditions, 0),
    proposedDailyCostCapUsd: input.dailyCostCapUsd, costCapEnforced: false,
    agents: [
      { role: 'scout', trigger: 'new approved source or bounded source sweep', runtime: 'host or cloud job', modelRoute: 'deterministic first; small model for triage', output: 'source delta and unresolved claims' },
      { role: 'editor', trigger: 'accepted source delta', runtime: 'host or cloud job', modelRoute: 'configured workhorse', output: 'one source-bound edition brief' },
      { role: 'producer', trigger: 'accepted edition brief', runtime: 'host; local media worker when needed', modelRoute: 'configured workhorse; selective strong-model review', output: 'editable artifacts and exact revision receipts' },
      { role: 'analyst', trigger: 'provider receipt or metrics import', runtime: 'cloud job', modelRoute: 'deterministic metrics; model for experiment proposal', output: 'observed results and an unapproved learning proposal' },
    ].map(agent => ({ ...agent, runtimeState: 'not_started' })),
    jobs: active.map(brand => ({ brandId: brand.id, editions: brand.weeklyEditions, steps: ['ingest', 'brief', 'draft', 'review', 'handoff', 'reconcile'], status: 'planned', publisher: brand.publisher })),
    subscriptionsPolicy: 'One publisher owns each destination. Inspect paid overlaps; cancellation and upgrades are separate owner decisions.',
    persistenceContract: ['source_id', 'source_digest', 'claim_id', 'rights_state', 'artifact_id', 'revision_digest', 'brand_id', 'destination_id', 'approval_id', 'provider_receipt_id', 'metric_window', 'run_id', 'cost_receipt'],
    nextGate: 'Resolve actual workspace, exact destination IDs, rights and account access. Save and verify one reviewed edition before enabling a publishing worker.',
  }
}

export function auditCreatorSubscriptions(input) {
  validate(input, auditSchema)
  uniqueIds(input.subscriptions, 'input.subscriptions')
  const asOfMs = Date.parse(`${input.asOf}T00:00:00Z`)
  const rows = input.subscriptions.map(row => {
    const included = row.state === 'active' || row.state === 'trial'
    const monthlyEquivalent = included && row.amount !== null && ['monthly', 'annual'].includes(row.billingCycle)
      ? round(row.billingCycle === 'annual' ? row.amount / 12 : row.amount) : null
    const daysUntilRenewal = row.renewsOn === null ? null : Math.round((Date.parse(`${row.renewsOn}T00:00:00Z`) - asOfMs) / 86400000)
    const daysUntilNotice = daysUntilRenewal === null || row.cancellationNoticeDays === null ? null : daysUntilRenewal - row.cancellationNoticeDays
    const gaps = [
      ...(row.evidence === 'unknown' ? ['billing evidence unknown'] : []),
      ...(row.amount === null || ['usage', 'unknown'].includes(row.billingCycle) ? ['monthly spend incomplete'] : []),
      ...(row.renewsOn === null && included ? ['renewal date unknown'] : []),
      ...(row.cancellationNoticeDays === null && included ? ['cancellation notice unknown'] : []),
      ...(row.state === 'unknown' ? ['subscription state unknown'] : []),
    ]
    return { ...row, monthlyEquivalent, daysUntilRenewal, daysUntilNotice,
      renewalStatus: daysUntilRenewal === null ? 'unknown' : daysUntilRenewal < 0 ? 'stale_date' : daysUntilRenewal <= 14 ? 'due_soon' : 'later',
      noticeStatus: daysUntilNotice === null ? 'unknown' : daysUntilNotice < 0 ? 'date_passed' : daysUntilNotice <= 14 ? 'review_now' : 'later', gaps }
  })
  const totals = [...new Set(rows.map(row => row.currency))].sort().map(currency => ({
    currency,
    knownMonthlyEquivalent: round(rows.filter(row => row.currency === currency).reduce((sum, row) => sum + (row.monthlyEquivalent ?? 0), 0)),
    incompleteRecordIds: rows.filter(row => row.currency === currency && row.state !== 'cancelled' && row.monthlyEquivalent === null).map(row => row.id),
    interpretation: 'Known fixed-cost subtotal; includes supplied trial prices as exposure. Usage, tax, FX and missing bills are not estimated.',
  }))
  const overlapCandidates = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j]
    if (!['active', 'trial'].includes(a.state) || !['active', 'trial'].includes(b.state) || a.purpose !== 'publishing' || b.purpose !== 'publishing' || a.workspaceLabel !== b.workspaceLabel) continue
    const sharedBrandIds = a.brandIds.filter(brandId => b.brandIds.includes(brandId))
    if (sharedBrandIds.length) overlapCandidates.push({ subscriptionIds: [a.id, b.id], sharedBrandIds, action: 'Inspect destination ownership and migration/export before an owner decides whether to consolidate.', savingsVerified: false })
  }
  return { schema: 'gencreator.subscription-audit.v1', version: operationsVersion, asOf: input.asOf, ...boundary,
    evidence: 'supplied_records_only', accountDiscovery: 'not_performed', totals, rows, overlapCandidates,
    reviewQueue: rows.filter(row => row.state !== 'cancelled' && (row.gaps.length || row.renewalStatus === 'due_soon' || row.renewalStatus === 'stale_date' || row.noticeStatus === 'review_now' || row.noticeStatus === 'date_passed')).map(row => ({ id: row.id, owner: row.owner, gaps: row.gaps, renewalStatus: row.renewalStatus, noticeStatus: row.noticeStatus })),
    recommendationsAreProposals: true, cancellations: [],
  }
}

export const operationsTools = [
  { name: 'gencreator_plan_operations', description: 'Prepare a portable multi-brand research, creation, publishing and learning plan from supplied brand records. No account checks, persistence, agent launch, model calls or publication.', inputSchema: planSchema },
  { name: 'gencreator_audit_subscriptions', description: 'Audit supplied SaaS subscription records: fixed-cost subtotals per currency, unknown costs, renewal and notice windows, and potential publishing overlaps. Does not discover bills, convert currencies, cancel or purchase.', inputSchema: auditSchema },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }))
export function callOperationsTool(name, input) {
  if (name === 'gencreator_plan_operations') return planCreatorOperations(input)
  if (name === 'gencreator_audit_subscriptions') return auditCreatorSubscriptions(input)
  throw new Error('Unknown GenCreator operations tool.')
}
