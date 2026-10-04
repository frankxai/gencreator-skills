#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { callOperationsTool, parseOperationsJson } from './operations-core.mjs'
const [command, inputFile, outputFile] = process.argv.slice(2)
const names = { plan: 'gencreator_plan_operations', audit: 'gencreator_audit_subscriptions' }
try {
  if (!names[command] || !inputFile || process.argv.length > 5) throw new Error('Usage: node operations.mjs <plan|audit> input.json [output.json]')
  const bytes = await readFile(inputFile)
  if (bytes.length > 524288) throw new Error('Input exceeds 512 KiB.')
  const input = parseOperationsJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  const output = JSON.stringify(callOperationsTool(names[command], input), null, 2) + '\n'
  if (outputFile) await writeFile(outputFile, output, { flag: 'wx', mode: 0o600 })
  else process.stdout.write(output)
} catch (error) {
  process.stderr.write(`GenCreator: ${error instanceof Error ? error.message : 'Could not prepare operations.'}\n`)
  process.exitCode = 1
}
