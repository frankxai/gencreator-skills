#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const expected = [
  'skills/gencreator-operations/scripts/operations-core.mjs',
  'skills/gencreator-operations/scripts/operations.mjs',
  'skills/gencreator-operations/references/operations-contract.md',
  'skills/gencreator-operations/SKILL.md',
  'tests/operations.test.mjs',
]
try {
  const receipt = JSON.parse(await readFile(new URL('operations-provenance.json', root), 'utf8'))
  if (receipt.schema !== 'gencreator.source-projection.v1' || receipt.sourceRepository !== 'https://github.com/frankxai/gencreator.ai' || !/^[a-f0-9]{40}$/.test(receipt.sourceCommit)) throw new Error('Invalid source receipt.')
  if (!Array.isArray(receipt.files) || receipt.files.length !== expected.length || new Set(receipt.files.map(file => file.path)).size !== expected.length) throw new Error('Unexpected projection inventory.')
  for (const file of receipt.files) {
    if (!expected.includes(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !/^[a-f0-9]{64}$/.test(file.sourceSha256)) throw new Error('Invalid projection entry.')
    const digest = createHash('sha256').update(await readFile(new URL(file.path, root))).digest('hex')
    if (digest !== file.sha256 || (file.transform === 'none' && digest !== file.sourceSha256)) throw new Error(`Projection changed: ${file.path}`)
  }
  process.stdout.write(JSON.stringify({ status: 'verified', scope: 'local package bytes and supplied source receipt; no remote check', root: fileURLToPath(root), sourceCommit: receipt.sourceCommit, files: receipt.files.length }) + '\n')
} catch (error) {
  process.stderr.write(`GenCreator projection: ${error.message}\n`)
  process.exitCode = 1
}
