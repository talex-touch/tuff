/**
 * A failed tool call's error as the Home conversation shows it.
 *
 * The error is the text the agent read back, stored with the thread. When one of Tuff's own tools
 * fails, main writes it as `<CODE>: <sentence>` (`TOOL_NOT_FOUND: Tool is not available.`,
 * `main/modules/ai/tool-error-projection.ts`); a call still open when the turn ended is stored as the
 * bare code `TOOL_EXECUTION_INTERRUPTED`; and the Pi runtime refuses a call in English. Those read in
 * the interface language; text a tool, a library or the system wrote is the only diagnosis there is,
 * so it is shown as it came.
 */

type ToolErrorTranslate = (key: string, named?: Record<string, unknown>, plural?: number) => string

const STABLE_TOOL_ERROR = /^([A-Z][A-Z0-9_]*): /
const STABLE_TOOL_ERROR_KEYS: Readonly<Record<string, string>> = {
  TOOL_NOT_FOUND: 'notFound',
  TOOL_INPUT_INVALID: 'inputInvalid',
  TOOL_APPROVAL_DENIED: 'approvalDenied',
  TOOL_EXECUTION_ABORTED: 'aborted',
  TOOL_EXECUTION_TIMEOUT: 'timedOut',
  TOOL_RESOURCE_NOT_FOUND: 'resourceNotFound',
  TOOL_RESOURCE_ALREADY_EXISTS: 'resourceExists',
  TOOL_RESOURCE_ACCESS_DENIED: 'accessDenied',
  TOOL_SERVICE_UNAVAILABLE: 'serviceUnavailable',
  MCP_SERVER_UNAVAILABLE: 'mcpServerUnavailable',
  MCP_TOOL_FAILED: 'mcpToolFailed',
  TOOL_EXECUTION_FAILED: 'failed'
}

/**
 * A call that never answered: one still open when the turn ended, as main's
 * `workspace-message-assembler.ts` stores it; one the Pi run stopped while it was waiting for its
 * result (`main/modules/ai/pi-agent-runtime-worker.ts`); and one the run was stopped before it
 * started, which `@earendil-works/pi-agent-core`'s agent loop answers in its place.
 */
const INTERRUPTED: ReadonlySet<string> = new Set([
  'TOOL_EXECUTION_INTERRUPTED',
  'Tool request aborted',
  'Operation aborted'
])
// `pi-agent-runtime-worker.ts`: a call that reached its run after the run was over.
const RUN_ENDED = /^Run \S+ is not active$/
// `pi-agent-runtime-worker.ts`: a call past the reply's tool-call budget.
const BUDGET_EXCEEDED = /^Execution budget exceeded: maxToolCalls=(\d+)$/

export function describeToolCallError(error: string, t: ToolErrorTranslate): string {
  const text = error.trim()
  const key = STABLE_TOOL_ERROR_KEYS[STABLE_TOOL_ERROR.exec(text)?.[1] ?? '']
  if (key) return t(`home.toolErrors.${key}`)
  const budget = BUDGET_EXCEEDED.exec(text)?.[1]
  if (budget) {
    const count = Number(budget)
    return t('home.toolErrors.budgetExceeded', { count }, count)
  }
  if (INTERRUPTED.has(text) || RUN_ENDED.test(text)) return t('home.toolInterrupted')
  return error
}
