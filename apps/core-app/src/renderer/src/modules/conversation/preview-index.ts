import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { ConversationMessage } from './useHomeConversation'
import {
  CHART_RESULT_PREFIX,
  FORM_RESULT_PREFIX,
  WIDGET_RESULT_PREFIX
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'

/**
 * The right panel's index of everything a conversation produced.
 *
 * Every entry here is derived from a part that actually exists on a message —
 * nothing is invented to fill a tab. A tab with no derivable entries renders an
 * empty state, which is the honest answer.
 *
 * One pass builds all four lists because each entry carries the index of the
 * message it came from (that is what makes "jump back to it" possible), and a
 * shared walk is the only place that index is free.
 */

/** Marks a `tuff_write_file` success. The tool creates with `wx` and never overwrites. */
const CREATED_PREFIX = 'Created '

export type PreviewArtifactKind = 'created' | 'uploaded'

export interface PreviewArtifact {
  id: string
  kind: PreviewArtifactKind
  /** File name for display. */
  name: string
  /** Absolute path; absent for an upload that only ever existed in the window. */
  path?: string
  /** Containing directory, for disambiguating same-named files. */
  dir?: string
  messageIndex: number
}

export interface PreviewWidget {
  id: string
  /** `sandbox` is a widget the model wrote itself, run in an isolated frame. */
  kind: 'chart' | 'form' | 'sandbox'
  title?: string
  messageIndex: number
}

export interface PreviewToolCall {
  id: string
  name: string
  status: AiToolCallPart['status']
  summary?: string
  error?: string
  messageIndex: number
}

/**
 * `web` exists for a future `AiSourcesPart`: that type is declared in tuffex but
 * nothing in this app produces one yet, so today every source is derived from a
 * tool call instead. Keeping the kind on the item is what lets the producer be
 * added later without touching the rendering.
 */
export type PreviewSourceKind = 'file' | 'search' | 'mcp' | 'web'

export interface PreviewSource {
  id: string
  kind: PreviewSourceKind
  label: string
  /** Full path, URL or `server / tool` — the part too long for the label. */
  detail?: string
  messageIndex: number
}

export interface PreviewIndex {
  artifacts: PreviewArtifact[]
  widgets: PreviewWidget[]
  toolCalls: PreviewToolCall[]
  sources: PreviewSource[]
}

/** Splits a path without `node:path`: the renderer sees both separators. */
function splitPath(path: string): { name: string; dir?: string } {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (cut < 0) return { name: path }
  return { name: path.slice(cut + 1) || path, dir: path.slice(0, cut) || undefined }
}

/**
 * Tool arguments arrive as a JSON string. Parsing is best-effort on purpose:
 * an unparseable input means one entry is missing from a tab, never a throw
 * that empties the whole panel.
 */
function readArg(tool: AiToolCallPart, key: string): string | undefined {
  if (!tool.input) return undefined
  try {
    const parsed: unknown = JSON.parse(tool.input)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const value = (parsed as Record<string, unknown>)[key]
    return typeof value === 'string' && value.trim() ? value : undefined
  } catch {
    return undefined
  }
}

/** The widget's own heading, when its spec carries one. */
function readSpecTitle(output: string, prefix: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(output.slice(prefix.length))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const title = (parsed as Record<string, unknown>).title
    return typeof title === 'string' && title.trim() ? title : undefined
  } catch {
    return undefined
  }
}

function collectArtifact(
  tool: AiToolCallPart,
  messageIndex: number,
  into: PreviewArtifact[]
): void {
  if (tool.name !== 'tuff_write_file' || tool.status !== 'done') return
  const output = tool.output ?? ''
  // The tool reports its refusals through the same channel; only the create
  // line means a file now exists.
  if (!output.startsWith(CREATED_PREFIX)) return
  const path = output.slice(CREATED_PREFIX.length).trim()
  if (!path) return
  const { name, dir } = splitPath(path)
  into.push({ id: tool.id, kind: 'created', name, path, dir, messageIndex })
}

function collectWidget(tool: AiToolCallPart, messageIndex: number, into: PreviewWidget[]): void {
  if (tool.status !== 'done') return
  const output = tool.output
  if (!output) return
  if (output.startsWith(CHART_RESULT_PREFIX)) {
    into.push({
      id: tool.id,
      kind: 'chart',
      title: readSpecTitle(output, CHART_RESULT_PREFIX),
      messageIndex
    })
    return
  }
  if (output.startsWith(FORM_RESULT_PREFIX)) {
    into.push({
      id: tool.id,
      kind: 'form',
      title: readSpecTitle(output, FORM_RESULT_PREFIX),
      messageIndex
    })
    return
  }
  if (output.startsWith(WIDGET_RESULT_PREFIX)) {
    into.push({
      id: tool.id,
      kind: 'sandbox',
      title: readSpecTitle(output, WIDGET_RESULT_PREFIX),
      messageIndex
    })
  }
}

function collectSources(tool: AiToolCallPart, messageIndex: number, into: PreviewSource[]): void {
  if (tool.status !== 'done') return

  if (tool.name === 'tuff_read_file') {
    const path = readArg(tool, 'path')
    if (!path) return
    into.push({
      id: tool.id,
      kind: 'file',
      label: splitPath(path).name,
      detail: path,
      messageIndex
    })
    return
  }

  if (tool.name === 'tuff_search_files') {
    // `name\tpath` per line. A line without a tab is the tool talking (e.g.
    // "No files matched."), not a hit.
    for (const [line, raw] of (tool.output ?? '').split('\n').entries()) {
      const tab = raw.indexOf('\t')
      if (tab < 0) continue
      const path = raw.slice(tab + 1).trim()
      if (!path) continue
      into.push({
        id: `${tool.id}:${line}`,
        kind: 'search',
        label: raw.slice(0, tab) || splitPath(path).name,
        detail: path,
        messageIndex
      })
    }
    return
  }

  if (tool.name === 'tuff_mcp_call') {
    const server = readArg(tool, 'server')
    const name = readArg(tool, 'tool')
    if (!server && !name) return
    into.push({
      id: tool.id,
      kind: 'mcp',
      label: name ?? server ?? '',
      detail: server && name ? `${server} / ${name}` : (server ?? name),
      messageIndex
    })
  }
}

export function buildPreviewIndex(messages: ConversationMessage[]): PreviewIndex {
  const index: PreviewIndex = { artifacts: [], widgets: [], toolCalls: [], sources: [] }

  for (const [messageIndex, message] of messages.entries()) {
    for (const attachment of message.attachments ?? []) {
      index.artifacts.push({
        id: attachment.id,
        kind: 'uploaded',
        name: attachment.name || attachment.id,
        messageIndex
      })
    }

    for (const part of message.parts ?? []) {
      if (part.type === 'sources') {
        for (const source of part.sources) {
          index.sources.push({
            id: source.id,
            kind: 'web',
            label: source.title || source.url,
            detail: source.url,
            messageIndex
          })
        }
        continue
      }
      if (part.type !== 'tool-call') continue

      index.toolCalls.push({
        id: part.id,
        name: part.name,
        status: part.status,
        summary: part.summary,
        error: part.error,
        messageIndex
      })
      collectArtifact(part, messageIndex, index.artifacts)
      collectWidget(part, messageIndex, index.widgets)
      collectSources(part, messageIndex, index.sources)
    }
  }

  return index
}
