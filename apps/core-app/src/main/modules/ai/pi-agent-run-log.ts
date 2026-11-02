import type { PiRuntimeCounters, PiRuntimeRunRecord } from './pi-agent-runtime-protocol'

/**
 * How a run that was stopped is picked up again from the messages it had logged.
 *
 * The log holds one record per agent message, appended as the message ends: the objective, every
 * assistant turn, every tool result. It is the transcript of the run, not a snapshot of it, so the
 * run resumes from the last message that was written and nothing is rewritten each turn.
 *
 * Pure and free of Electron, so the main process (which validates and truncates the stored log) and
 * the worker (which rebuilds the agent from it) read a log the same way.
 */

/** What the run is first asked, in the words the model sees: the objective, and the input if any. */
export function buildObjectivePrompt(objective: string, input: unknown): string {
  return input === undefined ? objective : `${objective}\n\nInput:\n${JSON.stringify(input)}`
}

export interface PiRunResumePlan {
  /** The conversation the agent starts from; when `replay` is set it ends before that message. */
  messages: unknown[]
  /**
   * An assistant message the model already produced whose work was not finished. It is handed back
   * to the agent as the next model reply instead of asking the model again, so the calls the model
   * chose - some of which may already have run - are the ones that continue.
   */
  replay?: unknown
  /** How many leading records the resumed run keeps; the rest are removed from the log. */
  keepCount: number
  counters: PiRuntimeCounters
}

interface Message {
  role?: unknown
  content?: unknown
  toolCallId?: unknown
  stopReason?: unknown
}

function asMessage(value: unknown): Message | null {
  return value && typeof value === 'object' ? (value as Message) : null
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function hasValidCounters(record: PiRuntimeRunRecord): boolean {
  const usage = record.usage as Partial<PiRuntimeCounters['usage']> | undefined
  return (
    isCount(record.modelSteps) &&
    isCount(record.toolCalls) &&
    typeof record.costKnown === 'boolean' &&
    !!usage &&
    typeof usage.promptTokens === 'number' &&
    typeof usage.completionTokens === 'number' &&
    typeof usage.totalTokens === 'number'
  )
}

function toolCallIds(message: Message): string[] {
  if (!Array.isArray(message.content)) return []
  return message.content.flatMap((block: { type?: unknown; id?: unknown }) =>
    block?.type === 'toolCall' && typeof block.id === 'string' ? [block.id] : []
  )
}

function firstText(message: Message): string | undefined {
  if (!Array.isArray(message.content)) return undefined
  const block = message.content[0] as { type?: unknown; text?: unknown } | undefined
  return block?.type === 'text' && typeof block.text === 'string' ? block.text : undefined
}

function countersOf(record: PiRuntimeRunRecord): PiRuntimeCounters {
  return {
    modelSteps: record.modelSteps,
    toolCalls: record.toolCalls,
    usage: { ...record.usage },
    costKnown: record.costKnown
  }
}

/**
 * The plan for resuming from `records`, or null when there is nothing to resume from: an empty log,
 * one that does not begin with `prompt`, one that never got past the prompt, or one that is not the
 * log an agent writes (a message out of order, a tool result nobody asked for, a failed turn). The
 * caller discards a log it gets null for and starts the run over.
 *
 * - Every call of the last assistant turn has its result: the agent continues from the last result
 *   and the model is asked for its next step.
 * - Otherwise (the run stopped with the last turn's calls still open, or on a turn that made none):
 *   the log is cut back to just before that turn and the turn is replayed, not asked of the model
 *   again. A call that had already run is answered from its recorded result, one that had started
 *   and not finished is refused a second run, and one that never started runs.
 */
export function planRunResume(
  records: readonly PiRuntimeRunRecord[],
  prompt: string
): PiRunResumePlan | null {
  const messages: Message[] = []
  for (const record of records) {
    const message = asMessage(record?.message)
    if (!message || !hasValidCounters(record)) return null
    messages.push(message)
  }
  if (messages.length < 2) return null
  if (messages[0].role !== 'user' || firstText(messages[0]) !== prompt) return null

  let lastAssistant = -1
  let outstanding = new Set<string>()
  let previous = 'user'
  for (let index = 1; index < messages.length; index++) {
    const message = messages[index]
    if (message.role === 'assistant') {
      if (previous === 'assistant') return null
      if (previous === 'toolResult' && outstanding.size > 0) return null
      if (message.stopReason === 'error' || message.stopReason === 'aborted') return null
      if (records[index].modelSteps < 1) return null
      lastAssistant = index
      outstanding = new Set(toolCallIds(message))
    } else if (message.role === 'toolResult') {
      if (previous === 'user') return null
      const id = typeof message.toolCallId === 'string' ? message.toolCallId : ''
      if (!outstanding.delete(id)) return null
    } else {
      return null
    }
    previous = String(message.role)
  }
  if (lastAssistant < 0) return null

  if (previous === 'toolResult' && outstanding.size === 0) {
    return {
      messages: messages.slice(),
      keepCount: messages.length,
      counters: countersOf(records[records.length - 1])
    }
  }

  const assistant = records[lastAssistant]
  return {
    messages: messages.slice(0, lastAssistant),
    replay: messages[lastAssistant],
    keepCount: lastAssistant,
    // The replayed turn is counted as the step that produced it, and the usage it was already
    // charged is in its record, so the replay adds none.
    counters: { ...countersOf(assistant), modelSteps: assistant.modelSteps - 1 }
  }
}
