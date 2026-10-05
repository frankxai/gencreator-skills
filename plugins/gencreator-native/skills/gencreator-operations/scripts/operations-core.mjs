/** GenCreator operations planning. Supplied records only; no I/O or inference. */
export const operationsVersion = '0.2.0'

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

const capabilities = ['research', 'science_review', 'writing', 'image', 'video', 'audio', 'design', 'asset_storage', 'ip_registry', 'publishing', 'analytics', 'crm', 'email', 'commerce', 'community', 'workflow_runtime']
const accessModes = ['local', 'native', 'api', 'mcp', 'manual']
const quantity = { type: 'integer', minimum: 0, maximum: 1000000000000 }
const money = { type: 'number', minimum: 0, maximum: 100000000 }
const currency = { type: 'string', pattern: '^[A-Z]{3}$' }
const brandIds = { type: 'array', minItems: 1, maxItems: 12, uniqueItems: true, items: id }
const period = { enum: ['day', 'month', 'run', 'total'] }
const coverage = { type: 'array', minItems: 1, maxItems: 36, items: object({ capability: { enum: capabilities }, unit: text(40), period, capacity: { anyOf: [quantity, { type: 'null' }] }, quotaPoolId: { anyOf: [id, { type: 'null' }] } }) }
const toolFields = { id, vendor: text(100), brandIds, coverage, access: { enum: accessModes }, checkedOn: nullableDate, evidenceRef: { anyOf: [text(500), { type: 'null' }] } }
const stackSchema = object({
  asOf: date, workspaceLabel: text(100),
  budget: object({ currency, maxMonthlyStackCost: money, maxNewUpfrontCost: money }),
  subscriptions: auditSchema.properties.subscriptions,
  requirements: { type: 'array', minItems: 1, maxItems: 36, items: object({ id, capability: { enum: capabilities }, unit: text(40), period, units: { ...quantity, minimum: 1 }, brandIds, allowedAccess: { type: 'array', minItems: 1, maxItems: accessModes.length, uniqueItems: true, items: { enum: accessModes } } }) },
  ownedTools: { type: 'array', maxItems: 60, items: object({ ...toolFields, connectionState: { enum: ['unknown', 'reported_connected', 'reported_disconnected', 'reported_local'] }, costState: { enum: ['subscription', 'included', 'free', 'local', 'unknown'] }, subscriptionId: { anyOf: [id, { type: 'null' }] } }) },
  offers: { type: 'array', maxItems: 12, items: object({ ...toolFields, amount: { anyOf: [money, { type: 'null' }] }, currency, billingCycle: { enum: ['monthly', 'annual', 'free', 'included', 'usage', 'unknown'] }, coveredBySubscriptionId: { anyOf: [id, { type: 'null' }] } }) },
  workflows: { type: 'array', maxItems: 12, items: object({ id, name: text(100), brandId: id, steps: { type: 'array', minItems: 1, maxItems: 48, items: object({ id, requirementId: id, agentRole: { enum: ['scout', 'editor', 'producer', 'reviewer', 'courier', 'analyst'] }, dependsOn: { type: 'array', maxItems: 48, uniqueItems: true, items: id }, effect: { enum: ['read', 'create', 'publish'] } }) } }) },
})

const axisKey = row => JSON.stringify([row.capability, row.unit, row.period])
const scopeKey = row => JSON.stringify([row.capability, [...row.brandIds].sort()])
const orderIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0
// Reserve two decimal places from the supplied decimal number without floating-point
// multiplication or division inflating an exact cent. Annual obligations use divisor 12.
function reserve(value, divisor = 1) {
  const [coefficient, exponent = '0'] = String(value).split('e')
  const [whole, fraction = ''] = coefficient.split('.')
  const scale = fraction.length - Number(exponent)
  const numerator = BigInt(whole + fraction) * (scale < 0 ? 10n ** BigInt(-scale) : 1n)
  const denominator = (scale > 0 ? 10n ** BigInt(scale) : 1n) * BigInt(divisor)
  return Number((numerator * 100n + denominator - 1n) / denominator) / 100
}

/** Prepare an inventory-aware stack and workflow graph; all evidence is supplied, never discovered. */
export function designCreatorStack(input) {
  validate(input, stackSchema)
  for (const field of ['subscriptions', 'requirements', 'ownedTools', 'offers', 'workflows']) uniqueIds(input[field], `input.${field}`)
  uniqueIds([...input.ownedTools, ...input.offers], 'input.toolIds')
  const bills = new Map(input.subscriptions.map(row => [row.id, row]))
  for (const bill of input.subscriptions) if (bill.workspaceLabel !== input.workspaceLabel) fail('input.subscriptions', 'workspace mismatch')
  const groups = []
  for (const requirement of [...input.requirements].sort(orderIds)) {
    let group = groups.find(row => row.key === scopeKey(requirement))
    if (!group) { group = { id: requirement.id, key: scopeKey(requirement), capability: requirement.capability, brandIds: [...requirement.brandIds].sort(), requirements: [] }; groups.push(group) }
    if (group.requirements.some(row => axisKey(row) === axisKey(requirement))) fail('input.requirements', 'duplicate quota axis in a capability and brand scope')
    group.requirements.push(requirement)
  }
  if (groups.length > 18) fail('input.requirements', 'at most 18 capability and brand groups')
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    if (groups[i].capability === groups[j].capability && groups[i].brandIds.some(brand => groups[j].brandIds.includes(brand))) fail('input.requirements', 'overlapping brand scopes for one capability; combine its quota axes into one group')
  }
  const current = row => row.checkedOn !== null && row.evidenceRef !== null && row.checkedOn <= input.asOf && (Date.parse(input.asOf) - Date.parse(row.checkedOn)) / 86400000 <= 31
  function licensed(reference, tool) {
    const bill = bills.get(reference)
    return bill && ['active', 'trial'].includes(bill.state) && tool.brandIds.every(brand => bill.brandIds.includes(brand))
  }
  const namedPools = new Map()
  for (const tool of [...input.ownedTools, ...input.offers]) {
    const keys = tool.coverage.map(axisKey)
    if (new Set(keys).size !== keys.length) fail(`input.tools.${tool.id}.coverage`, 'duplicate quota axis')
    for (const row of tool.coverage) if (row.quotaPoolId !== null) {
      const measurement = JSON.stringify([row.unit, row.period])
      if (namedPools.has(row.quotaPoolId) && namedPools.get(row.quotaPoolId) !== measurement) fail(`input.tools.${tool.id}.coverage`, 'named quota pool has inconsistent unit or period')
      namedPools.set(row.quotaPoolId, measurement)
    }
  }
  for (const tool of input.ownedTools) {
    const paid = ['subscription', 'included'].includes(tool.costState)
    if (paid && !bills.has(tool.subscriptionId)) fail(`input.ownedTools.${tool.id}`, 'subscription reference missing from supplied ledger')
    if (!paid && tool.subscriptionId !== null) fail(`input.ownedTools.${tool.id}`, 'subscription reference contradicts cost state')
  }
  for (const offer of input.offers) {
    if (offer.billingCycle === 'included') {
      if (offer.amount !== 0 || !bills.has(offer.coveredBySubscriptionId)) fail(`input.offers.${offer.id}`, 'included offer needs zero incremental price and a supplied subscription reference')
    } else if (offer.coveredBySubscriptionId !== null) fail(`input.offers.${offer.id}`, 'subscription reference only applies to an included offer')
    if (offer.billingCycle === 'free' && offer.amount !== 0) fail(`input.offers.${offer.id}`, 'free offer must have a supplied zero price')
  }

  const audit = auditCreatorSubscriptions({ asOf: input.asOf, subscriptions: input.subscriptions })
  const liveBills = input.subscriptions.filter(row => row.state !== 'cancelled')
  const incompleteBillIds = liveBills.filter(row => !['active', 'trial'].includes(row.state) || row.amount === null || !['monthly', 'annual'].includes(row.billingCycle) || row.currency !== input.budget.currency || row.evidence === 'unknown').map(row => row.id)
  const unknownCostToolIds = input.ownedTools.filter(row => row.costState === 'unknown').map(row => row.id)
  const baselineComplete = incompleteBillIds.length === 0 && unknownCostToolIds.length === 0
  const baseline = round(liveBills.filter(row => ['active', 'trial'].includes(row.state) && row.currency === input.budget.currency && row.amount !== null && ['monthly', 'annual'].includes(row.billingCycle)).reduce((total, row) => total + reserve(row.amount, row.billingCycle === 'annual' ? 12 : 1), 0))
  const owned = input.ownedTools.filter(row => current(row) && (!['subscription', 'included'].includes(row.costState) || licensed(row.subscriptionId, row))).sort((a, b) => {
    const rank = row => (['reported_connected', 'reported_local'].includes(row.connectionState) ? 0 : 2) + (bills.get(row.subscriptionId)?.state === 'trial' ? 1 : 0)
    return rank(a) - rank(b) || orderIds(a, b)
  })
  const offerReviews = []
  const offers = []
  for (const row of [...input.offers].sort(orderIds)) {
    const reasons = []
    if (!current(row)) reasons.push('price or entitlement evidence missing, future-dated or older than 31 days')
    if (row.billingCycle === 'included' && !licensed(row.coveredBySubscriptionId, row)) reasons.push('included subscription inactive or brand scope unproved')
    if (['usage', 'unknown'].includes(row.billingCycle) || row.amount === null) reasons.push('fixed price unknown; usage is not treated as zero')
    const paid = ['monthly', 'annual'].includes(row.billingCycle)
    if (paid && row.currency !== input.budget.currency) reasons.push('currency differs; no FX conversion')
    if (paid && row.amount > 0 && !baselineComplete) reasons.push('current stack spend incomplete')
    if (reasons.length) { offerReviews.push({ id: row.id, reasons, action: 'verify_offer' }); continue }
    offers.push({ ...row, monthlyReserve: paid ? reserve(row.amount, row.billingCycle === 'annual' ? 12 : 1) : 0, upfrontReserve: paid ? reserve(row.amount) : 0 })
  }

  const usage = new Map()
  const quotaKey = (tool, row) => {
    const entitlement = tool.coverage.find(entry => axisKey(entry) === axisKey(row))
    if (entitlement?.quotaPoolId) return `pool:${entitlement.quotaPoolId}`
    const subscription = tool.subscriptionId ?? tool.coveredBySubscriptionId
    return `${subscription ? 'subscription' : 'tool'}:${subscription ?? tool.id}:${axisKey(row)}`
  }
  const poolCapacities = new Map()
  // Several access views or included features of one bill do not multiply its quota.
  for (const tool of [...owned, ...offers]) for (const row of tool.coverage) {
    if (row.capacity !== null) {
      const key = quotaKey(tool, row)
      poolCapacities.set(key, Math.min(poolCapacities.get(key) ?? Infinity, row.capacity))
    }
  }
  function fits(tool, group, allocations) {
    return group.brandIds.every(brand => tool.brandIds.includes(brand)) && group.requirements.every(requirement => {
      const entitlement = tool.coverage.find(row => axisKey(row) === axisKey(requirement))
      return requirement.allowedAccess.includes(tool.access) && entitlement?.capacity !== null && entitlement !== undefined && (allocations.get(quotaKey(tool, requirement)) ?? 0) + requirement.units <= poolCapacities.get(quotaKey(tool, requirement))
    })
  }
  function allocate(tool, group, allocations) {
    for (const row of group.requirements) { const key = quotaKey(tool, row); allocations.set(key, (allocations.get(key) ?? 0) + row.units) }
  }
  const allocationOrder = [...groups].sort((a, b) => owned.filter(tool => fits(tool, a, usage)).length - owned.filter(tool => fits(tool, b, usage)).length || orderIds(a, b))
  const bindings = new Map()
  for (const group of allocationOrder) {
    const tool = owned.find(row => fits(row, group, usage))
    if (tool) { bindings.set(group.key, { tool, kind: 'owned' }); allocate(tool, group, usage) }
  }
  const remaining = groups.filter(row => !bindings.has(row.key))
  let best = { count: 0, monthly: 0, upfront: 0, selected: [], assignments: new Map() }
  // Bounded subset comparison (<= 4096). Assignment within each subset is deterministic,
  // most-constrained-first; this is not a global quality or allocation optimum.
  for (let mask = 1; mask < 2 ** offers.length; mask++) {
    const selected = offers.filter((_, index) => mask & (2 ** index))
    const monthly = round(selected.reduce((sum, row) => sum + row.monthlyReserve, 0))
    const upfront = round(selected.reduce((sum, row) => sum + row.upfrontReserve, 0))
    if ((monthly > 0 && round(baseline + monthly) > input.budget.maxMonthlyStackCost) || upfront > input.budget.maxNewUpfrontCost) continue
    const allocations = new Map(usage), assignments = new Map()
    const ordered = [...remaining].sort((a, b) => selected.filter(tool => fits(tool, a, allocations)).length - selected.filter(tool => fits(tool, b, allocations)).length || orderIds(a, b))
    for (const group of ordered) {
      const tool = [...selected].sort((a, b) => a.monthlyReserve - b.monthlyReserve || a.upfrontReserve - b.upfrontReserve || orderIds(a, b)).find(row => fits(row, group, allocations))
      if (tool) { assignments.set(group.key, { tool, kind: 'offer' }); allocate(tool, group, allocations) }
    }
    if (assignments.size > best.count || (assignments.size === best.count && (monthly < best.monthly || (monthly === best.monthly && (upfront < best.upfront || (upfront === best.upfront && (selected.length < best.selected.length || (selected.length === best.selected.length && selected.map(row => row.id).join(',') < best.selected.map(row => row.id).join(','))))))))) best = { count: assignments.size, monthly, upfront, selected, assignments }
  }
  for (const [key, value] of best.assignments) bindings.set(key, value)
  const decisions = groups.map(group => {
    const binding = bindings.get(group.key)
    const tool = binding?.tool
    const action = !tool ? 'evaluate' : binding.kind === 'owned' ? 'reuse_existing' : tool.billingCycle === 'included' ? 'use_included' : tool.billingCycle === 'free' ? 'try_free' : 'propose_purchase'
    const subscriptionId = tool ? (binding.kind === 'owned' ? tool.subscriptionId : tool.coveredBySubscriptionId) : null
    return { capability: group.capability, brandIds: group.brandIds, requirementIds: group.requirements.map(row => row.id), toolId: tool?.id ?? null, vendor: tool?.vendor ?? null, access: tool?.access ?? null, subscriptionId, action,
      state: 'prepared_only', entitlementEvidence: tool ? 'supplied_unverified' : 'missing', connectionVerified: false,
      gaps: tool ? [binding.kind === 'offer' ? 'accept terms and establish entitlement before use' : 'verify actual account or local tool access', ...(action === 'propose_purchase' ? ['owner purchase decision required'] : []), ...(bills.get(subscriptionId)?.state === 'trial' ? ['trial expiry and conversion need review'] : [])] : ['no supplied tool fits quota, brand scope, access and budget constraints'] }
  })
  const requirements = new Map(input.requirements.map(row => [row.id, row]))
  const workflows = input.workflows.map(workflow => {
    uniqueIds(workflow.steps, `input.workflows.${workflow.id}.steps`)
    const steps = new Map(workflow.steps.map(row => [row.id, row]))
    for (const step of workflow.steps) {
      const requirement = requirements.get(step.requirementId)
      if (!requirement || !requirement.brandIds.includes(workflow.brandId)) fail(`input.workflows.${workflow.id}.${step.id}`, 'requirement missing or outside workflow brand')
      if (step.effect === 'publish' && requirement.capability !== 'publishing') fail(`input.workflows.${workflow.id}.${step.id}`, 'publish effect requires the publishing capability')
      if (step.dependsOn.some(dependency => !steps.has(dependency))) fail(`input.workflows.${workflow.id}.${step.id}`, 'dependency missing from this workflow')
    }
    const pending = [...workflow.steps].sort(orderIds), ordered = []
    while (pending.length) {
      const index = pending.findIndex(step => step.dependsOn.every(dependency => ordered.some(row => row.id === dependency)))
      if (index < 0) fail(`input.workflows.${workflow.id}`, 'dependency cycle')
      ordered.push(pending.splice(index, 1)[0])
    }
    const compiled = []
    for (const step of ordered) {
      const decision = decisions.find(row => row.requirementIds.includes(step.requirementId))
      const blockedDependencyIds = step.dependsOn.filter(dependency => compiled.find(row => row.id === dependency).state.startsWith('blocked_'))
      compiled.push({ ...step, toolId: decision.toolId, access: decision.access, stackAction: decision.action, state: !decision.toolId ? 'blocked_capability_gap' : blockedDependencyIds.length ? 'blocked_dependency' : 'prepared_requires_verification', blockedDependencyIds,
        gates: ['verify entitlement, connection and brand scope', 'set per-run cost limit and capture actual usage receipts', ...(step.effect === 'create' ? ['source provenance and asset rights'] : []), ...(step.effect === 'publish' ? ['creator approval bound to exact revision and destination', 'current rights review', 'idempotency preflight and provider receipt reconciliation'] : [])] })
    }
    return { id: workflow.id, name: workflow.name, brandId: workflow.brandId, runtimeState: 'not_deployed', state: compiled.some(row => row.state.startsWith('blocked_')) ? 'blocked' : 'prepared_requires_verification', steps: compiled }
  })
  return { schema: 'gencreator.creator-stack.v1', version: operationsVersion, asOf: input.asOf, workspaceLabel: input.workspaceLabel, ...boundary,
    purchaseAuthorized: false, cancellationsAuthorized: false, inventoryEvidence: 'supplied_records_only', accountDiscovery: 'not_performed', independentlyVerifiedEvidence: false,
    policy: { reuseOwnedFirst: true, sharedSubscriptionCountedOnce: true, quotaPooling: 'explicit named pool, otherwise subscription plus capability/unit/period; smallest supplied known capacity across licensed views', evidenceMaxAgeDays: 31, selection: 'maximize covered capability and brand groups; then minimize additional monthly reserve, upfront commitment and new tools under deterministic quota allocation', globalOptimumGuaranteed: false, modelOrVendorQualityEvaluated: false },
    costs: { currency: input.budget.currency, baselineMonthlyReserve: baseline, baselineComplete, incompleteBillIds, unknownCostToolIds, additionalMonthlyReserve: best.monthly, newUpfrontReserve: best.upfront, proposedMonthlyReserve: round(baseline + best.monthly), maxMonthlyStackCost: input.budget.maxMonthlyStackCost, maxNewUpfrontCost: input.budget.maxNewUpfrontCost, baselineOverBudget: baseline > input.budget.maxMonthlyStackCost, costCapEnforced: false, excludes: ['model and API usage', 'media generation usage', 'tax', 'FX', 'unreported subscriptions'], auditTotals: audit.totals },
    decisions, offersToReview: offerReviews, selectedOfferIds: best.selected.map(row => row.id),
    selectedOffers: best.selected.map(row => ({ id: row.id, vendor: row.vendor, amount: row.amount, currency: row.currency, billingCycle: row.billingCycle, monthlyReserve: row.monthlyReserve, upfrontReserve: row.upfrontReserve, checkedOn: row.checkedOn, evidenceRef: row.evidenceRef, evidenceVerified: false })), workflows,
    subscriptionReview: { reviewQueue: audit.reviewQueue, overlapCandidates: audit.overlapCandidates, savingsVerified: false, cancellations: [] },
    nextGate: 'Verify supplied inventory and quotes; obtain owner purchase decisions separately; bind authenticated tools and run limits before executing a reviewed workflow.',
  }
}

export const operationsTools = [
  { name: 'gencreator_plan_operations', description: 'Prepare a portable multi-brand research, creation, publishing and learning plan from supplied brand records. No account checks, persistence, agent launch, model calls or publication.', inputSchema: planSchema },
  { name: 'gencreator_audit_subscriptions', description: 'Audit supplied SaaS subscription records: fixed-cost subtotals per currency, unknown costs, renewal and notice windows, and potential publishing overlaps. Does not discover bills, convert currencies, cancel or purchase.', inputSchema: auditSchema },
  { name: 'gencreator_design_stack', description: 'Prepare a creator stack from supplied subscriptions, entitlements, requirements and dated offers. Reuse owned tools, reserve shared license costs once, compare bounded additions, and bind brand-scoped workflow graphs. No account discovery, purchase, cancellation or execution.', inputSchema: stackSchema },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }))
export function callOperationsTool(name, input) {
  if (name === 'gencreator_plan_operations') return planCreatorOperations(input)
  if (name === 'gencreator_audit_subscriptions') return auditCreatorSubscriptions(input)
  if (name === 'gencreator_design_stack') return designCreatorStack(input)
  throw new Error('Unknown GenCreator operations tool.')
}
