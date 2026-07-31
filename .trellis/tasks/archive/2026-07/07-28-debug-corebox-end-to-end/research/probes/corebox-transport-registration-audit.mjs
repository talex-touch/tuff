#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '../../../../..')
const ipcPath = path.join(repoRoot, 'apps/core-app/src/main/modules/box-tool/core-box/ipc.ts')
const windowPath = path.join(repoRoot, 'apps/core-app/src/main/modules/box-tool/core-box/window.ts')
const transportPath = path.join(repoRoot, 'packages/utils/transport/sdk/main-transport.ts')

const [ipcSource, windowSource, transportSource] = await Promise.all([
  readFile(ipcPath, 'utf8'),
  readFile(windowPath, 'utf8'),
  readFile(transportPath, 'utf8'),
])

function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length
}

const registrationPattern =
  /(?:transport|this\.ensureTransport\(\))\.on\(\s*((?:CoreBoxEvents|MetaOverlayEvents)(?:\.[A-Za-z0-9_]+)+|coreBoxImageTranslateEvent)/g
const registrations = []
for (const match of ipcSource.matchAll(registrationPattern)) {
  registrations.push({ event: match[1], line: lineAt(ipcSource, match.index) })
}

const grouped = new Map()
for (const registration of registrations) {
  const list = grouped.get(registration.event) ?? []
  list.push(registration.line)
  grouped.set(registration.event, list)
}

const duplicates = [...grouped.entries()]
  .filter(([, lines]) => lines.length > 1)
  .map(([event, lines]) => ({ event, count: lines.length, lines }))
  .sort((left, right) => left.event.localeCompare(right.event))

const shortcutPattern = /\.sendTo\([\s\S]*?CoreBoxEvents\.ui\.shortcutTriggered,\s*undefined\)/g
const shortcutSends = [...windowSource.matchAll(shortcutPattern)].map(match => ({
  line: lineAt(windowSource, match.index),
}))

const transportChecks = {
  invokeHandlerSet: transportSource.includes('const invokeHandlers = new Map<string, Set<InvokeHandler<any, any>>>()'),
  localHandlerSet: transportSource.includes('const localHandlers = new Map<string, Set<LocalHandler>>()'),
  invokeIteratesAll: /for \(const fn of active\) \{[\s\S]*?result = await fn/.test(transportSource),
  localInvokeIteratesAll: /for \(const handler of handlers\) \{[\s\S]*?result = await handler/.test(transportSource),
}

const result = {
  schema: 'corebox-transport-registration-audit/v1',
  baseline: process.env.AUDIT_COMMIT ?? null,
  registrations: registrations.length,
  duplicatedEvents: duplicates,
  shortcutSends,
  transportChecks,
}

console.log(JSON.stringify(result, null, 2))

if (
  duplicates.length === 0 ||
  shortcutSends.length !== 2 ||
  Object.values(transportChecks).some(value => value !== true)
) {
  process.exitCode = 1
}
