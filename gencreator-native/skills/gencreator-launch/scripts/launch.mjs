#!/usr/bin/env node
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { compileLaunch, inspectLaunch, exportLaunch, measureLaunch, newLaunch, launchVersion, launchSchema, verifyPacket } from './launch-core.mjs'

const help = `GenCreator launch ${launchVersion}\n\nUsage (Node 22+; no dependencies or API key):\n  node launch.mjs doctor\n  node launch.mjs schema\n  node launch.mjs init <new-directory>\n  node launch.mjs inspect <launch.json>\n  node launch.mjs compile <launch.json> <new-directory>\n  node launch.mjs export <launch.json> <reviewed-sha256-digest> <new-directory>\n  node launch.mjs verify <packet-directory>\n  node launch.mjs measure <metrics.json>\n\nEdit launch.json (including drafts), compile, inspect every draft, then confirm its digest.\nOutput directories must be new. Keep customer work outside the installed package.\nFiles stay local; nothing is sent or deployed. Digest confirmation does not verify identity.`
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
async function read(path) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.size > 524288) throw new Error('Input must be a regular JSON file of at most 512 KiB.')
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error('Input must contain valid JSON.') }
}
async function writePacket(directory, packet) {
  const target = resolve(directory)
  // Reserve exclusively: never merge into or overwrite a user's existing export.
  await mkdir(target)
  for (const file of packet.files) {
    const segments = file.path.split('/')
    if (segments.some(part => !part || part === '..' || !/^[a-z0-9._-]+$/.test(part))) throw new Error('Unsafe packet path.')
    if (segments.length > 1) await mkdir(join(target, ...segments.slice(0, -1)), { recursive: true })
    await writeFile(join(target, ...segments), file.content, { flag: 'wx' })
  }
  // Written last: this completion marker appears only after every file succeeds.
  await writeFile(join(target, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`, { flag: 'wx' })
  return target
}
async function verifyDirectory(directory) {
  const target = resolve(directory)
  if (!(await lstat(target)).isDirectory()) throw new Error('Packet location must be a regular directory. Symbolic links are unsupported.')
  const packet = await read(join(target, 'packet.json'))
  const result = verifyPacket(packet)
  const paths = []
  let entries = 0
  async function walk(prefix = '') {
    for (const entry of await readdir(join(target, prefix), { withFileTypes: true })) {
      if (++entries > 60) throw new Error('Unexpected files or directories in packet.')
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in a packet.')
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) paths.push(path)
      else throw new Error('Unsupported filesystem entry in packet.')
    }
  }
  await walk()
  const expected = new Set(['packet.json', ...packet.files.map(file => file.path)])
  if (paths.length !== expected.size || paths.some(path => !expected.has(path))) throw new Error('Packet has missing or unexpected files.')
  for (const file of packet.files) {
    const path = join(target, ...file.path.split('/'))
    const stat = await lstat(path)
    if (!stat.isFile() || stat.size > 160000 || await readFile(path, 'utf8') !== file.content) throw new Error(`File differs from confirmed packet: ${file.path}`)
  }
  return { ...result, directory: target, files: packet.files.length }
}
try {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') { process.stdout.write(`${help}\n`) }
  else {
    const expected = { doctor: 0, schema: 0, init: 1, inspect: 1, compile: 2, export: 3, verify: 1, measure: 1 }
    if (!(command in expected) || args.length !== expected[command]) throw new Error(`Invalid command or arguments.\n${help}`)
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 or newer is required.')
    if (command === 'doctor') output({ runtimeCompatible: true, checkScope: 'Node version and successful module loading only; output paths and accounts are not tested.', version: launchVersion, node: process.versions.node, dependencies: 'Node built-ins only', localOnly: true, providerConnections: 'unverified' })
    if (command === 'schema') output(launchSchema)
    if (command === 'init') {
      const directory = resolve(args[0]); await mkdir(directory)
      await writeFile(join(directory, 'launch.json'), `${JSON.stringify(newLaunch(), null, 2)}\n`, { flag: 'wx' })
      output({ file: join(directory, 'launch.json'), nextAction: 'Fill the brand, offer, source and source permission, then run inspect.' })
    }
    if (command === 'inspect') { const result = inspectLaunch(await read(args[0])); output(result); if (result.blockers.length) process.exitCode = 2 }
    if (command === 'compile' || command === 'export') {
      const launch = await read(args[0])
      const packet = command === 'compile' ? compileLaunch(launch) : exportLaunch({ launch, confirmation: { digest: args[1], decision: 'reviewed' } })
      const directory = await writePacket(args[command === 'compile' ? 1 : 2], packet)
      output({ directory, digest: packet.digest, state: packet.state, files: packet.files.length, externalWrites: false, nextAction: 'Review the files. Edit launch.json drafts and recompile to change the confirmed packet. Use verify to detect on-disk drift. Provider connection and external delivery are separate steps.' })
    }
    if (command === 'verify') output(await verifyDirectory(args[0]))
    if (command === 'measure') output(measureLaunch(await read(args[0])))
  }
} catch (error) {
  process.stderr.write(`${error?.code === 'EEXIST' ? 'Output already exists. Choose a new directory; existing work was preserved.' : error.message}\n`)
  process.exitCode = 1
}

