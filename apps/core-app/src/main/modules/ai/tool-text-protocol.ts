import type {
  IntelligenceChatPayload,
  IntelligenceMessage,
  IntelligenceMessageToolCall
} from '@talex-touch/tuff-intelligence'

/**
 * The tool protocol for a provider whose wire has no function calling (the local CLIs, Nexus,
 * Ollama): the model is told to answer with one JSON directive, and the Pi worker reads it back.
 * Providers that declare `supportsNativeTools` never see any of this.
 */
export const TOOL_TEXT_PROTOCOL_PROMPT = `You are the model backend for Tuff Pi, a host-governed coordinator.
You receive the complete conversation and an explicit list of tools.
When a tool is required, reply with exactly one JSON object and no markdown:
{"type":"tool","name":"tool.name","arguments":{}}
Call one tool at a time. Use only a listed tool and provide valid arguments.
All string arguments inside the JSON object MUST strictly escape newlines as \\n and double quotes as \\". Never output literal unescaped newlines inside JSON strings.
When you need to write or create files with code or data, prefer using 'file.write' with { "path": "...", "content": "..." } rather than embedding complex multiline scripts inside 'system.exec'.
When no more tools are needed, return the final answer as plain text or {"type":"final","text":"..."}.`

function directiveFor(call: IntelligenceMessageToolCall): string {
  return JSON.stringify({ type: 'tool', name: call.name, arguments: call.arguments })
}

/**
 * The payload a provider without native tools can take: the structured tool turns become the text
 * the protocol above describes - an assistant call becomes the directive it would have written, a
 * `tool` result becomes a user turn naming the tool - and the tool list rides in a system message.
 * A payload with no tools and no tool turns is returned as it is.
 */
export function foldToolsIntoPrompt(payload: IntelligenceChatPayload): IntelligenceChatPayload {
  const { tools, ...rest } = payload
  const hasToolTurns = payload.messages.some(
    (message) => message.role === 'tool' || (message.toolCalls?.length ?? 0) > 0
  )
  if (tools === undefined && !hasToolTurns) return payload

  const names = new Map<string, string>()
  const turns: IntelligenceMessage[] = payload.messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) names.set(call.id, call.name)
      const { toolCalls, ...plain } = message
      const content = [message.content, ...toolCalls.map(directiveFor)].filter(Boolean).join('\n')
      return { ...plain, content }
    }
    if (message.role === 'tool') {
      const name = message.toolCallId ? names.get(message.toolCallId) : undefined
      return { role: 'user', content: `[Tool result: ${name ?? 'unknown'}]\n${message.content}` }
    }
    return message
  })

  if (!tools?.length) return { ...rest, messages: turns }

  const firstTurn = turns.findIndex((message) => message.role !== 'system')
  const splitAt = firstTurn === -1 ? turns.length : firstTurn
  return {
    ...rest,
    messages: [
      { role: 'system', content: TOOL_TEXT_PROTOCOL_PROMPT },
      ...turns.slice(0, splitAt),
      { role: 'system', content: `Available tools:\n${JSON.stringify(tools)}` },
      ...turns.slice(splitAt)
    ]
  }
}
