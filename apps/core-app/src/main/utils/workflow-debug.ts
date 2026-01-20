import type { Primitive } from './logger'

import fs from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'

interface WorkflowDebugConfig {
  sid: string
  enabled: boolean
}

interface WorkflowDebugLogEntry {
  hid: string
  loc: string
  msg: string
  data?: Record<string, unknown>
}

const WORKFLOW_DEBUG_TTL_MS = 1_000
const WORKFLOW_DEBUG_ACTIVE_FILE = 'active-session.json'

const cachedConfig: {
  loadedAt: number
  debugRoot: string | null
  config: WorkflowDebugConfig | null
} = {
  loadedAt: 0,
  debugRoot: null,
  config: null
}

let ensuredSid: string | null = null
let writeChain: Promise<void> = Promise.resolve()

function resolveDebugRoot(): string | null {
  if (app.isPackaged) {
    return null
  }

  const base = app.isReady() ? app.getAppPath() : process.cwd()
  return path.resolve(base, '../.workflow/.debug')
}

function safeToLogMeta(
  value: Record<string, unknown> | undefined
): Record<string, Primitive> | undefined {
  if (!value) {
    return undefined
  }

  const safe: Record<string, Primitive> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined || typeof raw === 'number' || typeof raw === 'boolean') {
      safe[key] = raw
      continue
    }
    if (typeof raw === 'string') {
      safe[key] = raw.length > 2_000 ? `${raw.slice(0, 2_000)}…` : raw
      continue
    }

    try {
      const encoded = JSON.stringify(raw)
      safe[key] = encoded.length > 2_000 ? `${encoded.slice(0, 2_000)}…` : encoded
    } catch {
      safe[key] = '[unserializable]'
    }
  }

  return safe
}

function loadWorkflowDebugConfig(): { debugRoot: string; config: WorkflowDebugConfig } | null {
  const now = Date.now()
  if (now - cachedConfig.loadedAt < WORKFLOW_DEBUG_TTL_MS) {
    return cachedConfig.debugRoot && cachedConfig.config
      ? { debugRoot: cachedConfig.debugRoot, config: cachedConfig.config }
      : null
  }

  cachedConfig.loadedAt = now
  cachedConfig.debugRoot = null
  cachedConfig.config = null

  const debugRoot = resolveDebugRoot()
  if (!debugRoot) {
    return null
  }

  const activePath = path.join(debugRoot, WORKFLOW_DEBUG_ACTIVE_FILE)
  try {
    const raw = fs.readFileSync(activePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<WorkflowDebugConfig> | null
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const sid = typeof parsed.sid === 'string' ? parsed.sid : null
    const enabled = parsed.enabled === true
    if (!sid || !enabled) {
      return null
    }

    const config: WorkflowDebugConfig = { sid, enabled }
    cachedConfig.debugRoot = debugRoot
    cachedConfig.config = config
    return { debugRoot, config }
  } catch {
    return null
  }
}

async function ensureLogFile(debugRoot: string, sid: string): Promise<string> {
  const sessionDir = path.join(debugRoot, sid)
  const logPath = path.join(sessionDir, 'debug.log')
  if (ensuredSid === sid) {
    return logPath
  }

  ensuredSid = sid
  try {
    await mkdir(sessionDir, { recursive: true })
  } catch {
    // ignore
  }
  return logPath
}

export function appendWorkflowDebugLog(entry: WorkflowDebugLogEntry): void {
  const loaded = loadWorkflowDebugConfig()
  if (!loaded) {
    return
  }

  const { debugRoot, config } = loaded

  const payload = {
    sid: config.sid,
    hid: entry.hid,
    loc: entry.loc,
    msg: entry.msg,
    data: safeToLogMeta(entry.data),
    ts: Date.now(),
    pid: process.pid
  }

  writeChain = writeChain
    .then(async () => {
      const logPath = await ensureLogFile(debugRoot, config.sid)
      await appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8')
    })
    .catch(() => {
      // best-effort logging
    })
}

export function getWorkflowDebugSessionId(): string | null {
  const loaded = loadWorkflowDebugConfig()
  return loaded?.config.sid ?? null
}

export function isWorkflowDebugEnabled(): boolean {
  return getWorkflowDebugSessionId() !== null
}
