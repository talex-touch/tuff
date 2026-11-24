import type {
  HerdrFileEditPatch,
  HerdrRuntimeSnapshot,
  HerdrTerminalControlAction
} from '@talex-touch/utils/transport/events/herdr'
import type { StableToolErrorCode } from '../ai/tool-error-projection'
import type { HerdrRuntimePlane } from '../herdr-core/runtime-plane'
import type { ToolCallPlan, ToolDefinition, ToolResult } from './tool-registry'
import { Buffer } from 'node:buffer'
import { createLogger } from '../../utils/logger'
import {
  describeToolFailure,
  formatStableToolError,
  projectToolError,
  projectToolErrorCode
} from '../ai/tool-error-projection'

const herdrToolLog = createLogger('agent-tools')

/** Matches `tool-registry.ts` `MAX_TOOL_TEXT_CHARS` (64 KiB model budget). */
const MAX_HERDR_TOOL_TEXT_CHARS = 64 * 1024
const MAX_HERDR_FILE_WRITE_BYTES = 8 * 1024 * 1024
const VALID_CONTROL_ACTIONS = new Set<HerdrTerminalControlAction>([
  'interrupt',
  'kill',
  'rm',
  'keep-on',
  'keep-off'
])
const DESTRUCTIVE_CONTROL_ACTIONS = new Set<string>(['kill', 'rm'])

export interface HerdrToolsOptions {
  getPlane: () => HerdrRuntimePlane | null
  truncate?: (text: string) => string
}

function defaultTruncateForModel(text: string): string {
  return text.length > MAX_HERDR_TOOL_TEXT_CHARS
    ? `${text.slice(0, MAX_HERDR_TOOL_TEXT_CHARS)}\n… truncated at ${MAX_HERDR_TOOL_TEXT_CHARS} characters.`
    : text
}

function toolFailure(code: StableToolErrorCode): ToolResult {
  const projection = projectToolErrorCode(code)
  return { output: projection.message, isError: true, code: projection.code }
}

function projectedFailure(error: unknown): ToolResult {
  const projection = projectToolError(error)
  herdrToolLog.warn(
    `Herdr agent tool execution failed: ${formatStableToolError(projection)} | ${describeToolFailure(error)}`
  )
  return { output: projection.message, isError: true, code: projection.code }
}

function readString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value : ''
}

function readOptionalTrimmedString(args: Record<string, unknown>, key: string): string | undefined {
  const trimmed = readString(args, key).trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readOptionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key]
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string')
  return items.length > 0 ? items : undefined
}

function readOptionalStringRecord(
  args: Record<string, unknown>,
  key: string
): Record<string, string> | undefined {
  const value = args[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  let count = 0
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entryValue === 'string') {
      out[entryKey] = entryValue
      count += 1
    }
  }
  return count > 0 ? out : undefined
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function formatMachineTarget(args: Record<string, unknown>): string {
  return readOptionalTrimmedString(args, 'on') ?? 'local'
}

function formatCommandPreview(args: Record<string, unknown>): string {
  const line = readOptionalTrimmedString(args, 'line')
  if (line) return oneLine(line).slice(0, 120)
  const argv = readOptionalStringArray(args, 'argv')
  if (argv) return oneLine(argv.join(' ')).slice(0, 120)
  return '(default shell)'
}

type PlaneResolution =
  | { ok: true; plane: HerdrRuntimePlane; snapshot: HerdrRuntimeSnapshot }
  | { ok: false; reason: string }

function resolveConnectedPlane(getPlane: () => HerdrRuntimePlane | null): PlaneResolution {
  const plane = getPlane()
  if (!plane) {
    return {
      ok: false,
      reason: 'herdr-core runtime plane is not initialized.'
    }
  }
  const snapshot = plane.getSnapshot()
  if (!snapshot.enabled) {
    return {
      ok: false,
      reason: 'Herdr runtime is disabled in Settings (Beta Features).'
    }
  }
  if (snapshot.connection !== 'connected') {
    const detail = snapshot.error ? ` (${snapshot.error})` : ''
    return {
      ok: false,
      reason: `herdr-core is not connected (state: ${snapshot.connection})${detail}.`
    }
  }
  return { ok: true, plane, snapshot }
}

/**
 * Builds the 9 `tuff_herdr_*` model-callable tools for `ToolGateway`.
 * Enforces exact risk tiers, narrowed `classify` rememberKeys for read tools,
 * `⚠ ` prefixes for destructive actions, 64 KiB truncation, and graceful
 * degrade-not-abort behavior when herdr-core is disconnected or disabled.
 */
export function createHerdrTools(options: HerdrToolsOptions): ToolDefinition[] {
  const truncate = options.truncate ?? defaultTruncateForModel

  const listSessionsTool: ToolDefinition = {
    name: 'tuff_herdr_list_sessions',
    risk: 'read',
    summarize: (args) =>
      args.all === true
        ? 'List all herdr-core terminal sessions and remote machines'
        : 'List live herdr-core terminal sessions and remote machines',
    classify: async (args): Promise<ToolCallPlan> => ({
      risk: 'read',
      summary:
        args.all === true
          ? 'List all herdr-core terminal sessions and remote machines'
          : 'List live herdr-core terminal sessions and remote machines',
      rememberKey: 'tuff_herdr_list_sessions'
    }),
    execute: async (args) => {
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: `herdr-core unavailable: ${resolved.reason}`,
          isError: false
        }
      }
      const { plane } = resolved
      const all = args.all === true
      const labels = readOptionalStringRecord(args, 'labels')

      try {
        const [sessionsRes, machinesRes] = await Promise.allSettled([
          plane.terminals.list({ ...(all ? { all: true } : {}), ...(labels ? { labels } : {}) }),
          plane.machines.list()
        ])

        const sections: string[] = []
        if (sessionsRes.status === 'fulfilled') {
          const sessions = sessionsRes.value
          if (sessions.length === 0) {
            sections.push(
              all
                ? 'No herdr-core terminal sessions found.'
                : 'No live herdr-core terminal sessions.'
            )
          } else {
            const lines = ['address\tmachine\tstate\tstatus\tforeground\tcwd\ttitle']
            for (const session of sessions) {
              const statusText = session.status
                ? `${session.status.state}${session.status.kind ? `(${session.status.kind})` : ''}`
                : '-'
              lines.push(
                [
                  session.address,
                  session.machine ?? 'local',
                  session.state,
                  statusText,
                  oneLine(session.foregroundName ?? session.argv[0] ?? '-'),
                  oneLine(session.foregroundCwd ?? session.cwd),
                  oneLine(session.title || session.name || '-')
                ].join('\t')
              )
            }
            sections.push(lines.join('\n'))
          }
        } else {
          sections.push(
            `sessions unavailable: ${formatStableToolError(projectToolError(sessionsRes.reason))}`
          )
        }

        if (machinesRes.status === 'fulfilled') {
          const machines = machinesRes.value
          if (machines.length > 0) {
            const lines = ['machine\tstate\thost\ttarget']
            for (const machine of machines) {
              lines.push(
                [machine.name, machine.state, oneLine(machine.host), oneLine(machine.target)].join(
                  '\t'
                )
              )
            }
            sections.push(lines.join('\n'))
          }
        } else {
          sections.push(
            `machines unavailable: ${formatStableToolError(projectToolError(machinesRes.reason))}`
          )
        }

        return {
          output: truncate(sections.join('\n\n')),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const readScreenTool: ToolDefinition = {
    name: 'tuff_herdr_read_screen',
    risk: 'read',
    summarize: (args) =>
      `Read screen of herdr terminal ${readString(args, 'terminal').trim() || '(missing)'}`,
    classify: async (args): Promise<ToolCallPlan> => {
      const terminal = readString(args, 'terminal').trim()
      if (!terminal) {
        return {
          risk: 'execute',
          summary: 'Read screen of herdr terminal (missing address)',
          rememberKey: `tuff_herdr_read_screen:invalid:${String(args.terminal ?? '')}`
        }
      }
      return {
        risk: 'read',
        summary: `Read screen of herdr terminal ${terminal}`,
        rememberKey: `tuff_herdr_read_screen:${terminal}`
      }
    },
    execute: async (args) => {
      const terminal = readString(args, 'terminal').trim()
      if (!terminal) return toolFailure('TOOL_INPUT_INVALID')
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const rawLines = readOptionalNumber(args, 'lines')
      const lines = rawLines !== undefined && rawLines >= 0 ? Math.floor(rawLines) : undefined
      try {
        const res = await resolved.plane.terminals.read({
          terminal,
          ...(lines !== undefined ? { lines } : {})
        })
        const suffix = !res.complete && res.why ? `\n[incomplete: ${res.why}]` : ''
        return {
          output: truncate(`${res.text}${suffix}`),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const fileReadTool: ToolDefinition = {
    name: 'tuff_herdr_file_read',
    risk: 'read',
    summarize: (args) =>
      `Read ${formatMachineTarget(args)}:${readString(args, 'path').trim() || '(missing)'}`,
    classify: async (args): Promise<ToolCallPlan> => {
      const targetMachine = formatMachineTarget(args)
      const filePath = readString(args, 'path').trim()
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const scopedTarget = cwd
        ? `${targetMachine}:${cwd}:${filePath}`
        : `${targetMachine}:${filePath}`
      if (!filePath) {
        return {
          risk: 'execute',
          summary: `Read ${targetMachine}:(missing path)`,
          rememberKey: `tuff_herdr_file_read:${targetMachine}:invalid:${String(args.path ?? '')}`
        }
      }
      return {
        risk: 'read',
        summary: `Read ${targetMachine}:${filePath}`,
        rememberKey: `tuff_herdr_file_read:${scopedTarget}`
      }
    },
    execute: async (args) => {
      const filePath = readString(args, 'path').trim()
      if (!filePath) return toolFailure('TOOL_INPUT_INVALID')
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const on = readOptionalTrimmedString(args, 'on')
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const rawOffset = readOptionalNumber(args, 'offset')
      const rawLimit = readOptionalNumber(args, 'limit')
      try {
        const res = await resolved.plane.files.read({
          path: filePath,
          ...(on ? { on } : {}),
          ...(cwd ? { cwd } : {}),
          ...(rawOffset !== undefined && rawOffset >= 1 ? { offset: Math.floor(rawOffset) } : {}),
          ...(rawLimit !== undefined && rawLimit >= 1 ? { limit: Math.floor(rawLimit) } : {})
        })
        return {
          output: truncate(res.text),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const sendInputTool: ToolDefinition = {
    name: 'tuff_herdr_send_input',
    risk: 'write',
    summarize: (args) => {
      const terminal = readString(args, 'terminal').trim() || '(missing)'
      const force = args.force === true
      return force
        ? `⚠ Force-send input to herdr terminal ${terminal}`
        : `Send input to herdr terminal ${terminal}`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const terminal = readString(args, 'terminal').trim() || '(missing)'
      const force = args.force === true
      return {
        risk: 'write',
        summary: force
          ? `⚠ Force-send input to herdr terminal ${terminal}`
          : `Send input to herdr terminal ${terminal}`,
        rememberKey: `tuff_herdr_send_input:${terminal}`
      }
    },
    execute: async (args) => {
      const terminal = readString(args, 'terminal').trim()
      const text = typeof args.text === 'string' ? args.text : null
      if (!terminal || text === null) return toolFailure('TOOL_INPUT_INVALID')
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const ifState =
        args.ifState === 'idle' || args.ifState === 'working' ? args.ifState : undefined
      const timeout = readOptionalNumber(args, 'timeout')
      try {
        const res = await resolved.plane.terminals.send({
          terminal,
          text,
          ...(args.force === true ? { force: true } : {}),
          ...(ifState ? { ifState } : {}),
          ...(args.wait === true ? { wait: true } : {}),
          ...(timeout !== undefined && timeout > 0 ? { timeout } : {})
        })
        return {
          output: truncate(
            `Delivered input to ${terminal} (turn=${res.turn}, status=${res.status ?? 'none'}, started=${String(res.started)})`
          ),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const fileWriteTool: ToolDefinition = {
    name: 'tuff_herdr_file_write',
    risk: 'write',
    summarize: (args) => {
      const machine = formatMachineTarget(args)
      const filePath = readString(args, 'path').trim() || '(missing)'
      const content = typeof args.content === 'string' ? args.content : ''
      const bytes = Buffer.byteLength(content, 'utf8')
      return `Write ${machine}:${filePath} (${bytes} bytes)`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const machine = formatMachineTarget(args)
      const filePath = readString(args, 'path').trim() || '(missing)'
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const scopedTarget = cwd ? `${machine}:${cwd}:${filePath}` : `${machine}:${filePath}`
      const content = typeof args.content === 'string' ? args.content : ''
      const bytes = Buffer.byteLength(content, 'utf8')
      return {
        risk: 'write',
        summary: `Write ${machine}:${filePath} (${bytes} bytes)`,
        rememberKey: `tuff_herdr_file_write:${scopedTarget}`
      }
    },
    execute: async (args) => {
      const filePath = readString(args, 'path').trim()
      const content = typeof args.content === 'string' ? args.content : null
      if (!filePath || content === null) return toolFailure('TOOL_INPUT_INVALID')
      const rawBytes = Buffer.byteLength(content, 'utf8')
      if (rawBytes > MAX_HERDR_FILE_WRITE_BYTES) return toolFailure('TOOL_INPUT_INVALID')

      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const on = readOptionalTrimmedString(args, 'on')
      const cwd = readOptionalTrimmedString(args, 'cwd')
      try {
        const res = await resolved.plane.files.write({
          path: filePath,
          data: Buffer.from(content, 'utf8').toString('base64'),
          ...(on ? { on } : {}),
          ...(cwd ? { cwd } : {})
        })
        return {
          output: truncate(`Wrote ${on ?? 'local'}:${res.path} (${res.bytes} bytes)`),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const fileEditTool: ToolDefinition = {
    name: 'tuff_herdr_file_edit',
    risk: 'write',
    summarize: (args) => {
      const machine = formatMachineTarget(args)
      const filePath = readString(args, 'path').trim() || '(missing)'
      const count = Array.isArray(args.edits) ? args.edits.length : 0
      return `Edit ${machine}:${filePath} (${count} ${count === 1 ? 'edit' : 'edits'})`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const machine = formatMachineTarget(args)
      const filePath = readString(args, 'path').trim() || '(missing)'
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const scopedTarget = cwd ? `${machine}:${cwd}:${filePath}` : `${machine}:${filePath}`
      const count = Array.isArray(args.edits) ? args.edits.length : 0
      return {
        risk: 'write',
        summary: `Edit ${machine}:${filePath} (${count} ${count === 1 ? 'edit' : 'edits'})`,
        rememberKey: `tuff_herdr_file_edit:${scopedTarget}`
      }
    },
    execute: async (args) => {
      const filePath = readString(args, 'path').trim()
      if (!filePath || !Array.isArray(args.edits) || args.edits.length === 0) {
        return toolFailure('TOOL_INPUT_INVALID')
      }
      const edits: HerdrFileEditPatch[] = []
      for (const entry of args.edits) {
        if (
          !entry ||
          typeof entry !== 'object' ||
          typeof (entry as { old?: unknown }).old !== 'string' ||
          typeof (entry as { new?: unknown }).new !== 'string'
        ) {
          return toolFailure('TOOL_INPUT_INVALID')
        }
        edits.push({
          old: (entry as { old: string }).old,
          new: (entry as { new: string }).new
        })
      }

      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const on = readOptionalTrimmedString(args, 'on')
      const cwd = readOptionalTrimmedString(args, 'cwd')
      try {
        const res = await resolved.plane.files.edit({
          path: filePath,
          edits,
          ...(on ? { on } : {}),
          ...(cwd ? { cwd } : {})
        })
        return {
          output: truncate(
            `Edited ${on ?? 'local'}:${res.path} (${edits.length} ${edits.length === 1 ? 'edit' : 'edits'}, ${res.bytes} bytes)`
          ),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const runTerminalTool: ToolDefinition = {
    name: 'tuff_herdr_run_terminal',
    risk: 'execute',
    summarize: (args) => {
      const machine = formatMachineTarget(args)
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const cmd = formatCommandPreview(args)
      return cwd
        ? `Run terminal on ${machine} in ${cwd}: ${cmd}`
        : `Run terminal on ${machine}: ${cmd}`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const machine = formatMachineTarget(args)
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const cmd = formatCommandPreview(args)
      return {
        risk: 'execute',
        summary: cwd
          ? `Run terminal on ${machine} in ${cwd}: ${cmd}`
          : `Run terminal on ${machine}: ${cmd}`,
        rememberKey: `tuff_herdr_run_terminal:${machine}`
      }
    },
    execute: async (args) => {
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const argv = readOptionalStringArray(args, 'argv')
      const line = readOptionalTrimmedString(args, 'line')
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const on = readOptionalTrimmedString(args, 'on')
      const name = readOptionalTrimmedString(args, 'name')
      const labels = readOptionalStringRecord(args, 'labels')
      const env = readOptionalStringRecord(args, 'env')
      const cols = readOptionalNumber(args, 'cols')
      const rows = readOptionalNumber(args, 'rows')
      try {
        const session = await resolved.plane.terminals.run({
          ...(argv ? { argv } : {}),
          ...(line ? { line } : {}),
          ...(cwd ? { cwd } : {}),
          ...(on ? { on } : {}),
          ...(name ? { name } : {}),
          ...(args.keep === true ? { keep: true } : {}),
          ...(labels ? { labels } : {}),
          ...(env ? { env } : {}),
          ...(cols !== undefined && cols >= 1 ? { cols: Math.floor(cols) } : {}),
          ...(rows !== undefined && rows >= 1 ? { rows: Math.floor(rows) } : {})
        })
        return {
          output: truncate(
            `Started herdr terminal ${session.address} (machine=${session.machine ?? 'local'}, state=${session.state}, cwd=${session.cwd})`
          ),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const execTool: ToolDefinition = {
    name: 'tuff_herdr_exec',
    risk: 'execute',
    summarize: (args) => {
      const machine = formatMachineTarget(args)
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const cmd = formatCommandPreview(args)
      return cwd ? `Exec on ${machine} in ${cwd}: ${cmd}` : `Exec on ${machine}: ${cmd}`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const machine = formatMachineTarget(args)
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const cmd = formatCommandPreview(args)
      return {
        risk: 'execute',
        summary: cwd ? `Exec on ${machine} in ${cwd}: ${cmd}` : `Exec on ${machine}: ${cmd}`,
        rememberKey: `tuff_herdr_exec:${machine}`
      }
    },
    execute: async (args) => {
      const argv = readOptionalStringArray(args, 'argv')
      const line = readOptionalTrimmedString(args, 'line')
      if (!argv && !line) return toolFailure('TOOL_INPUT_INVALID')

      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const cwd = readOptionalTrimmedString(args, 'cwd')
      const on = readOptionalTrimmedString(args, 'on')
      const env = readOptionalStringRecord(args, 'env')
      const timeout = readOptionalNumber(args, 'timeout')
      const rawInput = typeof args.input === 'string' ? args.input : undefined
      const input =
        rawInput !== undefined ? Buffer.from(rawInput, 'utf8').toString('base64') : undefined

      try {
        const res = await resolved.plane.exec.run({
          ...(argv ? { argv } : {}),
          ...(line ? { line } : {}),
          ...(cwd ? { cwd } : {}),
          ...(on ? { on } : {}),
          ...(env ? { env } : {}),
          ...(timeout !== undefined && timeout > 0 ? { timeout } : {}),
          ...(input !== undefined ? { input } : {})
        })
        const stdoutText = res.stdout ? Buffer.from(res.stdout, 'base64').toString('utf8') : ''
        const stderrText = res.stderr ? Buffer.from(res.stderr, 'base64').toString('utf8') : ''
        const header = [
          `exit=${res.code ?? 'null'}`,
          ...(res.signal !== null ? [`signal=${res.signal}`] : []),
          ...(res.timedOut ? ['timedOut=true'] : []),
          ...(res.truncated ? ['truncated=true'] : []),
          `ms=${res.ms}`
        ].join(' ')

        const parts = [header]
        if (stdoutText) parts.push(`stdout:\n${stdoutText}`)
        if (stderrText) parts.push(`stderr:\n${stderrText}`)

        return {
          output: truncate(parts.join('\n\n')),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  const controlTerminalTool: ToolDefinition = {
    name: 'tuff_herdr_control_terminal',
    risk: 'execute',
    summarize: (args) => {
      const terminal = readString(args, 'terminal').trim() || '(missing)'
      const action = readString(args, 'action').trim() || 'unknown'
      const prefix =
        DESTRUCTIVE_CONTROL_ACTIONS.has(action) ||
        !VALID_CONTROL_ACTIONS.has(action as HerdrTerminalControlAction)
          ? '⚠ '
          : ''
      return `${prefix}Control herdr terminal ${terminal}: ${action}`
    },
    classify: async (args): Promise<ToolCallPlan> => {
      const terminal = readString(args, 'terminal').trim() || '(missing)'
      const action = readString(args, 'action').trim() || 'unknown'
      const isDestructive =
        DESTRUCTIVE_CONTROL_ACTIONS.has(action) ||
        !VALID_CONTROL_ACTIONS.has(action as HerdrTerminalControlAction)
      return {
        risk: 'execute',
        summary: `${isDestructive ? '⚠ ' : ''}Control herdr terminal ${terminal}: ${action}`,
        rememberKey: `tuff_herdr_control_terminal:${terminal}:${action}`
      }
    },
    execute: async (args) => {
      const terminal = readString(args, 'terminal').trim()
      const action = readString(args, 'action').trim()
      if (!terminal || !VALID_CONTROL_ACTIONS.has(action as HerdrTerminalControlAction)) {
        return toolFailure('TOOL_INPUT_INVALID')
      }
      const resolved = resolveConnectedPlane(options.getPlane)
      if (!resolved.ok) {
        return {
          output: resolved.reason,
          isError: true,
          code: 'TOOL_SERVICE_UNAVAILABLE'
        }
      }
      const timeout = readOptionalNumber(args, 'timeout')
      try {
        const res = await resolved.plane.terminals.control({
          terminal,
          action: action as HerdrTerminalControlAction,
          ...(timeout !== undefined && timeout > 0 ? { timeout } : {})
        })
        return {
          output: truncate(
            JSON.stringify({
              terminal: res.terminal,
              action: res.action,
              ...(res.outcome ? { outcome: res.outcome } : {}),
              ...(res.key ? { key: res.key } : {}),
              ...(res.removed ? { removed: res.removed } : {}),
              ...(res.session ? { state: res.session.state, keep: res.session.keep } : {})
            })
          ),
          isError: false
        }
      } catch (error) {
        return projectedFailure(error)
      }
    }
  }

  return [
    listSessionsTool,
    readScreenTool,
    fileReadTool,
    sendInputTool,
    fileWriteTool,
    fileEditTool,
    runTerminalTool,
    execTool,
    controlTerminalTool
  ]
}
