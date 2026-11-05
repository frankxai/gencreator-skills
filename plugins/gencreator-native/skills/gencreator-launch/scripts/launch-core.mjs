/** The shared launch contract. Node built-ins only: works from an extracted pack. */
import { createHash } from 'node:crypto'

export const launchVersion = '0.5.0'
const str = (maxLength = 2000) => ({ type: 'string', maxLength })
const line = (maxLength = 2000) => ({ ...str(maxLength), pattern: '^[^\\r\\n\\t\\u2028\\u2029]*$' })
const choice = (...values) => ({ type: 'string', enum: values })
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const list = (items, maxItems = 20) => ({ type: 'array', items, maxItems, uniqueItems: true })
const id = { ...str(80), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }
const count = { type: 'integer', minimum: 0, maximum: 1000000000 }
export const launchSchema = object({
  schema: { const: 'gencreator.launch.v1', type: 'string' },
  packId: id, missionId: id,
  brand: object({ name: line(120), url: line(2048) }),
  offer: object({ audience: line(500), problem: str(), promise: line(300), description: str(4000), ctaLabel: line(100), ctaUrl: line(2048) }),
  source: object({ text: str(24000), excerpt: str(1200), permission: choice('unconfirmed', 'owned', 'licensed'), redistribution: choice('unconfirmed', 'permitted') }),
  evidence: list(object({ id, quote: { ...str(3000), minLength: 1 } })),
  funnel: choice('waitlist', 'lead-magnet'),
  channels: { ...list(choice('email', 'linkedin', 'search', 'relationships'), 4), minItems: 1 },
  stack: object({ website: choice('nextjs-vercel', 'existing', 'undecided'), email: choice('resend', 'existing', 'undecided'), data: choice('none', 'supabase', 'existing', 'undecided'), analytics: choice('posthog', 'existing', 'undecided') }),
  goal: object({ metric: { type: 'string', const: 'qualified_leads' }, target: { ...count, type: ['integer', 'null'], minimum: 1 }, windowDays: { type: ['integer', 'null'], minimum: 1, maximum: 365 }, qualification: str(1000) }),
  drafts: object({ pageHeadline: line(300), pageBody: str(4000), welcomeSubject: line(160), welcomeBody: str(4000), lessonSubject: line(160), lessonBody: str(4000), invitationSubject: line(160), invitationBody: str(4000), linkedin: str(2800), searchAnswer: str(2500) }),
})
export const measurementSchema = object({
  packId: id, missionId: id, cohort: { ...str(200), minLength: 1 },
  start: { ...str(10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  end: { ...str(10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  visitors: { ...count, type: ['integer', 'null'] }, leads: { ...count, type: ['integer', 'null'] },
  qualifiedLeads: { ...count, type: ['integer', 'null'] }, customers: { ...count, type: ['integer', 'null'] },
  goal: object({ target: { ...count, type: ['integer', 'null'], minimum: 1 }, windowDays: { type: ['integer', 'null'], minimum: 1, maximum: 365 } }),
})

/** Deliberately bounded JSON-schema subset used by all contracts in this module. */
function validate(schema, value, path = 'input') {
  const fail = message => { throw new Error(`${path}: ${message}`) }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  if (!types.includes(actual) && !(types.includes('integer') && Number.isSafeInteger(value))) fail(`expected ${types.join(' or ')}`)
  if (schema.const !== undefined && value !== schema.const) fail('unsupported contract value')
  if (schema.enum && !schema.enum.includes(value)) fail(`choose ${schema.enum.join(', ')}`)
  if (actual === 'null') return
  if (actual === 'string') {
    if (!value.isWellFormed()) fail('invalid Unicode: unpaired surrogate')
    if (value.length > schema.maxLength || value.length < (schema.minLength ?? 0)) fail('text length is out of bounds')
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('invalid format')
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail('control characters are not allowed')
  }
  if (actual === 'number' && (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum)) fail('count is out of bounds')
  if (actual === 'array') {
    if (value.length > schema.maxItems || value.length < (schema.minItems ?? 0)) fail('list length is out of bounds')
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) fail('duplicate entries')
    value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`))
  }
  if (actual === 'object') {
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.properties, key)) fail(`unknown field ${key.slice(0, 80)}`)
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) fail(`missing ${key}`)
      validate(schema.properties[key], value[key], `${path}.${key}`)
    }
  }
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
export const digest = value => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
const json = value => `${JSON.stringify(value, null, 2)}\n`
const md = value => value.replace(/[\\`*_{}[\]()#+!<>|=.~-]/g, '\\$&')

export function newLaunch() {
  return {
    schema: 'gencreator.launch.v1', packId: 'my-creator-pack', missionId: 'first-launch',
    brand: { name: '', url: '' }, offer: { audience: '', problem: '', promise: '', description: '', ctaLabel: '', ctaUrl: '' },
    source: { text: '', excerpt: '', permission: 'unconfirmed', redistribution: 'unconfirmed' }, evidence: [], funnel: 'waitlist',
    channels: ['email', 'linkedin', 'search', 'relationships'],
    stack: { website: 'undecided', email: 'undecided', data: 'undecided', analytics: 'undecided' },
    goal: { metric: 'qualified_leads', target: null, windowDays: null, qualification: '' },
    drafts: { pageHeadline: '', pageBody: '', welcomeSubject: '', welcomeBody: '', lessonSubject: '', lessonBody: '', invitationSubject: '', invitationBody: '', linkedin: '', searchAnswer: '' },
  }
}
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname) }
  catch { return false }
}
export function inspectLaunch(input) {
  validate(launchSchema, input)
  const blockers = []
  const add = (field, action) => blockers.push({ field, action })
  for (const [group, fields] of [['brand', ['name', 'url']], ['offer', ['audience', 'problem', 'promise', 'description', 'ctaLabel', 'ctaUrl']]]) {
    for (const key of fields) if (!input[group][key].trim()) add(`${group}.${key}`, `Supply ${group}.${key} from your actual offer.`)
  }
  for (const [field, value] of [['brand.url', input.brand.url], ['offer.ctaUrl', input.offer.ctaUrl]]) {
    if (value.trim() && !safeUrl(value)) add(field, 'Use an HTTPS URL without embedded credentials.')
  }
  if (!input.source.text.trim()) add('source.text', 'Add an owned or licensed source that supports the offer.')
  if (input.source.permission === 'unconfirmed') add('source.permission', 'Confirm ownership or a license before compiling.')
  if (input.source.redistribution !== 'permitted') add('source.redistribution', 'Confirm permission to redistribute the selected excerpt and proof quotes; a reading license alone is insufficient.')
  if (!input.source.excerpt.trim() || !input.source.text.includes(input.source.excerpt)) add('source.excerpt', 'Select an exact excerpt of at most 1,200 characters from the source for drafts.')
  if (input.goal.target === null) add('goal.target', 'Choose a qualified-lead target for this launch.')
  if (input.goal.windowDays === null) add('goal.windowDays', 'Choose a measurement window in days.')
  if (!input.goal.qualification.trim()) add('goal.qualification', 'Define what makes a lead qualified before measuring the goal.')
  const social = input.drafts.linkedin.trim() || `${input.source.excerpt}\n\n${input.offer.promise}\n\n${input.offer.ctaLabel}: ${input.offer.ctaUrl}`
  if (input.channels.includes('linkedin') && social.length > 2800) add('drafts.linkedin', 'Write a LinkedIn draft within 2,800 characters or shorten the excerpt/CTA.')
  const seen = new Set()
  for (const evidence of input.evidence) {
    if (seen.has(evidence.id)) add('evidence', 'Use distinct evidence IDs.')
    seen.add(evidence.id)
    if (!evidence.quote.trim() || !input.source.excerpt.includes(evidence.quote)) add(`evidence.${evidence.id}`, 'Use an exact, nonempty quote from the permissioned excerpt so its context remains visible.')
  }
  const decisions = []
  if (input.stack.website === 'undecided') decisions.push('Choose your existing website or a Next.js/Vercel deployment before connecting the page.')
  if (input.stack.data === 'undecided') decisions.push('Identify the existing capture system of record before deciding whether you need a database.')
  if (input.channels.includes('email') && input.stack.email === 'undecided') decisions.push('Choose the email system before connecting delivery.')
  if (input.stack.analytics === 'undecided') decisions.push('Choose where deduplicated funnel events will be measured.')
  if (input.stack.data === 'none') decisions.push('Use the existing capture provider as the contact system of record; add a database only for durable custom state.')
  if (!input.evidence.length) decisions.push('No proof quotes supplied. Review the promise as a hypothesis; do not add testimonials or outcome claims.')
  return {
    schema: 'gencreator.launch-inspection.v1', packId: input.packId, missionId: input.missionId,
    state: blockers.length ? 'needs_input' : 'ready_to_compile', blockers, decisions,
    nextAction: blockers[0]?.action ?? 'Compile the packet, edit launch.json, then review the compiled revision.',
    providerReadiness: 'unverified', publicLaunchReady: false, externalWrites: false,
    launchChecks: ['Verify the actual capture destination and a successful signup.', 'Verify consent, suppression and unsubscribe before any marketing email.', 'Review the page on mobile and desktop and verify its CTA.', 'Verify attribution events and duplicate handling with test submissions.', 'Review the exact content and destination before any external action.'],
  }
}

export function compileLaunch(input) {
  const inspection = inspectLaunch(input)
  if (inspection.blockers.length) throw new Error(`Launch needs input: ${inspection.blockers.map(item => item.field).join(', ')}`)
  const { brand, offer, source, evidence, channels, goal } = input
  const drafts = Object.fromEntries(Object.entries(input.drafts).map(([key, value]) => [key, value.trim()]))
  const files = []
  const put = (path, content) => {
    const text = content.endsWith('\n') ? content : `${content}\n`
    if (text.length > 40000) throw new Error(`${path} exceeds the 40,000-character artifact budget. Shorten the draft or quoted evidence.`)
    files.push({ path, content: text })
  }
  const proof = evidence.length ? evidence.map(item => `- ${md(item.id)}: ${md(item.quote)}`).join('\n') : 'No proof quotes supplied. Treat the promise as an untested hypothesis.'
  put('launch-brief.md', `# ${md(brand.name)} launch brief\n\nAudience: ${md(offer.audience)}\n\nProblem: ${md(offer.problem)}\n\nPromise to test: ${md(offer.promise)}\n\nOffer: ${md(offer.description)}\n\nFunnel: ${input.funnel}\n\nGoal: ${goal.target} qualified leads in ${goal.windowDays} days.\n\nQualified lead: ${md(goal.qualification)}\n\n## Supplied source excerpts\n\n${proof}\n\nContext: ${md(source.excerpt)}\n\n## Next action\n\n${md(offer.ctaLabel)}: ${md(offer.ctaUrl)}\n\nDraft only. Quote matching verifies source inclusion, not external truth, buyer validation or rights.`)
  put('website/content.json', json({ schema: 'gencreator.launch-page-copy.v1', title: drafts.pageHeadline || offer.promise, audience: offer.audience, problem: offer.problem, offer: drafts.pageBody || offer.description, brandUrl: brand.url, cta: { label: offer.ctaLabel, url: offer.ctaUrl }, sourceExcerpts: { quotes: evidence, context: source.excerpt, truthVerified: false }, funnel: input.funnel, state: 'draft_copy', captureVerified: false }))
  if (channels.includes('email')) {
    put('email/01-welcome.txt', `Subject: ${drafts.welcomeSubject || `Welcome to ${brand.name}`}\n\n${drafts.welcomeBody || `Thanks for joining us.\n\n${offer.promise}\n\n${offer.description}\n\nWhat are you trying to do, and where are you getting stuck?\n\n${brand.name}`}`)
    put('email/02-source-note.txt', `Subject: ${drafts.lessonSubject || `A note from ${brand.name}`}\n\n${drafts.lessonBody || `${source.excerpt}\n\nWhat would make this useful for you?\n\n${brand.name}`}`)
    put('email/03-invitation.txt', `Subject: ${drafts.invitationSubject || `Your next step with ${brand.name}`}\n\n${drafts.invitationBody || `${offer.problem}\n\n${offer.description}\n\n${offer.ctaLabel}: ${offer.ctaUrl}\n\n${brand.name}`}`)
  }
  if (channels.includes('linkedin')) {
    const social = drafts.linkedin || `${source.excerpt}\n\n${offer.promise}\n\n${offer.ctaLabel}: ${offer.ctaUrl}`
    if (social.length > 2800) throw new Error('The LinkedIn draft exceeds the 2,800-character editorial limit. Shorten drafts.linkedin or the excerpt/CTA.')
    put('content/linkedin.txt', social)
  }
  if (channels.includes('search')) {
    put('search/article-brief.md', `# Article and answer brief\n\nReader: ${md(offer.audience)}\n\nReader problem: ${md(offer.problem)}\n\nChoose a natural reader question about this problem, then write a direct answer using the supplied source. Distinguish demonstrated facts from the proposed promise. Add an original worked example and limitations. Link the primary evidence, author and offer.\n\n## Permissioned excerpt\n\n${md(source.excerpt)}\n\n## Draft answer\n\n${md(drafts.searchAnswer || 'No answer drafted yet. Use the excerpt as evidence, then write and review a useful explanation.')}\n\n## Publication checks\n\n- Verify title, description, canonical URL, indexability and sitemap.\n- Use structured data only when it describes visible, accurate content.\n- Link related explanations and cite primary sources.\n- Test retrieval with a fixed query set; record date, engine and citations.\n- Compare qualified visits and leads. No search or AI citation ranking is guaranteed.`)
    put('search/answers.json', json({ state: 'editorial_brief', questions: [`Who is ${brand.name} for?`, 'What problem does this address?', 'What evidence supports the approach?', 'What does the next step involve?'], suppliedAnswers: { audience: offer.audience, problem: offer.problem, evidence, nextStep: offer.ctaLabel, draft: drafts.searchAnswer }, verification: 'Review source support before writing and publishing answers.' }))
  }
  if (channels.includes('relationships')) {
    put('relationships/dream100.csv', 'name,public_url,audience_fit,evidence_url,value_to_offer,relationship_stage,next_action,owner,last_contact_at,do_not_contact')
    put('relationships/brief.md', `# Relationship development\n\nFind people serving ${md(offer.audience)}. Begin with ten relevant relationships and expand toward 100 only as evidence supports fit.\n\nFor each, record public evidence of relevance, a specific way to help, the channel they permit, a named owner and one next action. Separate research, meaningful engagement, proposed collaboration and confirmed partnership.\n\nOffer an original example, useful resource or co-created contribution before proposing distribution. Score relevance and reciprocal value; follower count alone is insufficient.\n\nDraft an individual message only after researching the person. Review and authorize each actual send. Record do-not-contact requests. Do not invent contacts, endorsements, engagement counts or reply rates.`)
  }
  put('measurement/event-contract.json', json({ schema: 'gencreator.funnel-events.v1', packId: input.packId, missionId: input.missionId, events: ['page_viewed', 'lead_captured', 'lead_qualified', 'purchase_completed', 'unsubscribed'], required: ['event_id', 'occurred_at', 'pack_id', 'mission_id', 'cohort_id', 'event_name'], optional: ['anonymous_subject_id', 'utm_source', 'utm_medium', 'utm_campaign'], rules: ['Deduplicate event_id at the authoritative ingestion store.', 'Use one cohort, window and counting unit per report.', 'Keep email addresses and other direct identifiers out of analytics events.', 'Store consent evidence and suppression in the contact system.', 'Missing counts are null, not zero.'], connected: false }))
  put('measurement/experiment.json', json({ schema: 'gencreator.launch-experiment.v1', hypothesis: offer.promise, primaryMetric: goal.metric, target: goal.target, windowDays: goal.windowDays, qualificationDefinition: goal.qualification, baseline: null, variant: null, decision: 'Define baseline and one variable before running.', statisticalConclusion: null }))
  put('operations/checklist.md', `# Connect and verify\n\nSelected website: ${input.stack.website}; email: ${input.stack.email}; data: ${input.stack.data}; analytics: ${input.stack.analytics}. These are decisions, not verified connections.\n\n- Open the real capture destination and submit one test lead.\n- Verify durable contact storage, idempotency, consent and suppression.\n- Ask three skippable questions: expected price band, who they are, what they are trying to do.\n- Set sender identity, domain authentication and unsubscribe behavior.\n- Review the page and each message at its actual destination.\n- Run the signup, delivery, unsubscribe and event-reconciliation journey.\n- Capture provider receipt IDs and matching revisions in the owning runtime.\n- Enable a channel only after that journey passes.\n\nThis packet contains no active provider integrations, contact records or authorization to publish. Checkout remains unavailable in this launch module.`)
  const payload = { schema: 'gencreator.launch-packet.v1', compilerVersion: launchVersion, packId: input.packId, missionId: input.missionId, launchDigest: digest(input), sourceDigest: digest(source), files }
  return { ...payload, digest: digest(payload), state: 'draft', externalWrites: false, inspection }
}

const confirmationSchema = object({ digest: { ...str(71), pattern: '^sha256:[a-f0-9]{64}$' }, decision: choice('reviewed') })
export function exportLaunch(input) {
  validate(object({ launch: launchSchema, confirmation: confirmationSchema }), input)
  const packet = compileLaunch(input.launch)
  if (packet.digest !== input.confirmation.digest) throw new Error('Review is stale. Compile and review the current launch revision.')
  return { ...packet, state: 'digest_confirmed', confirmation: { ...input.confirmation, identityVerified: false, scope: 'local_content_only' }, publicationAuthorized: false }
}
/** Verify integrity, not reviewer identity, against the packet's bounded manifest. */
export function verifyPacket(packet) {
  const fileSchema = object({ path: { ...str(180), pattern: '^[a-z0-9_-]+(?:/[a-z0-9_-]+)*\\.[a-z0-9]+$' }, content: str(40000) })
  const hash = { ...str(71), pattern: '^sha256:[a-f0-9]{64}$' }
  const payload = { schema: packet?.schema, compilerVersion: packet?.compilerVersion, packId: packet?.packId, missionId: packet?.missionId, launchDigest: packet?.launchDigest, sourceDigest: packet?.sourceDigest, files: packet?.files }
  validate(object({ schema: choice('gencreator.launch-packet.v1'), compilerVersion: choice(launchVersion), packId: id, missionId: id, launchDigest: hash, sourceDigest: hash, files: { ...list(fileSchema, 20), minItems: 1 } }), payload)
  if (new Set(packet.files.map(file => file.path)).size !== packet.files.length) throw new Error('Packet contains duplicate file paths.')
  if (digest(payload) !== packet.digest) throw new Error('Packet content digest does not match. Recompile from the launch manifest.')
  const confirmation = packet.confirmation?.decision === 'reviewed' && packet.confirmation.digest === packet.digest ? 'digest_matches' : 'absent'
  return { digest: packet.digest, state: 'integrity_verified', confirmation, reviewIdentityVerified: false, publicationAuthorized: false }
}
export function measureLaunch(input) {
  validate(measurementSchema, input)
  for (const value of [input.start, input.end]) {
    const date = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error('Use real calendar dates for the reporting window.')
  }
  if (input.start > input.end) throw new Error('Reporting start must be on or before end.')
  const { visitors, leads, qualifiedLeads, customers } = input
  if (visitors !== null && leads !== null && leads > visitors) throw new Error('Leads exceed visitors. Reconcile the cohort and counting unit.')
  for (const value of [qualifiedLeads, customers]) if (leads !== null && value !== null && value > leads) throw new Error('Downstream counts exceed leads. Reconcile the cohort and counting unit.')
  for (const value of [qualifiedLeads, customers]) if (visitors !== null && value !== null && value > visitors) throw new Error('Downstream counts exceed visitors. Reconcile the cohort and counting unit.')
  const ratio = (numerator, denominator) => numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator
  const rates = { visitorToLead: ratio(leads, visitors), leadToQualified: ratio(qualifiedLeads, leads), leadToCustomer: ratio(customers, leads) }
  const reason = (numerator, denominator) => numerator === null || denominator === null ? 'unknown_count' : denominator === 0 ? 'zero_denominator' : 'measured'
  const rateReasons = { visitorToLead: reason(leads, visitors), leadToQualified: reason(qualifiedLeads, leads), leadToCustomer: reason(customers, leads) }
  const missing = ['visitors', 'leads', 'qualifiedLeads', 'customers'].filter(key => input[key] === null)
  const observedDays = (Date.parse(input.end) - Date.parse(input.start)) / 86400000 + 1
  const goalProgress = { fraction: ratio(qualifiedLeads, input.goal.target), observedDays, plannedDays: input.goal.windowDays, targetReached: qualifiedLeads === null || input.goal.target === null ? null : qualifiedLeads >= input.goal.target, windowMatches: input.goal.windowDays === null ? null : observedDays === input.goal.windowDays }
  return { schema: 'gencreator.launch-measurement.v1', ...input, rates, rateReasons, goalProgress, missing, evidence: 'user_supplied_aggregates', connected: false, attributionVerified: false, statisticalConclusion: null,
    nextAction: visitors === 0 ? 'Verify instrumentation, then send qualified traffic to the page.' : leads === 0 && visitors !== null ? 'Test the capture journey, then test one promise or CTA change.' : qualifiedLeads === 0 && leads !== null && leads > 0 ? 'Review qualification and audience fit before increasing traffic.' : qualifiedLeads !== null && qualifiedLeads > 0 ? 'Interview qualified leads and choose one measured experiment. Do not infer causation from these totals.' : `Measure ${missing.join(', ')} for the same cohort and window.` }
}

const definitions = [
  { name: 'gencreator_inspect_launch', description: 'Check a supplied launch brief and return missing decisions and next actions. Provider readiness remains unverified. No account writes or provider connections.', inputSchema: launchSchema, run: inspectLaunch },
  { name: 'gencreator_compile_launch', description: 'Compile source-based website copy, email drafts, content, relationship and measurement files. Returns a revision digest. No model inference, deployment, sending or contact scraping.', inputSchema: launchSchema, run: compileLaunch },
  { name: 'gencreator_export_launch', description: 'Recompile and validate an exact-revision local content confirmation. Returns digest-matched draft files. Does not authenticate the reviewer or authorize publication.', inputSchema: object({ launch: launchSchema, confirmation: confirmationSchema }), run: exportLaunch },
  { name: 'gencreator_measure_launch', description: 'Calculate funnel ratios for supplied same-cohort counts. Preserves unknown values and rejects inconsistent counts. No analytics connection or causal inference.', inputSchema: measurementSchema, run: measureLaunch },
]
const remoteDisclosure = ` Version ${launchVersion}. Public MCP processes supplied inputs, including full source when present, on GenCreator's server. Handlers do not explicitly log or persist request bodies; host/infrastructure retention is unverified. Use the local CLI for private material.`
export const launchTools = definitions.map(({ name, description, inputSchema }) => ({ name, description: description + remoteDisclosure, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }))
export function callLaunchTool(name, args) {
  const tool = definitions.find(item => item.name === name)
  if (!tool) throw new Error('Unknown launch tool.')
  validate(tool.inputSchema, args)
  return tool.run(args)
}

