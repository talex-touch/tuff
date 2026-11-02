import type { App } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import install, {
  calculateTokenSpeed,
  describeToolCallError,
  formatMetricLatency,
  parseToolResult,
  toMessageSegments,
  toolFaceOf,
  TxAiAssistantTurn,
  TxAiComposer,
  TxAiConversation,
  TxAiErrorBlock,
  TxAiMarkdown,
  TxAiMessage,
  TxAiThinking,
  TxAiToolChart,
  TxAiToolForm,
  TxAiToolWidget,
  TxAiTurnFooter,
  useThinkingTicker,
  useTurnFooterState,
} from '../index'
import * as utils from '@talex-touch/intelligence-uikit/utils'

describe('intelligence-uikit exports', () => {
  it('exports the public conversation and tool components', () => {
    for (const component of [
      TxAiAssistantTurn, TxAiConversation, TxAiMessage, TxAiComposer, TxAiMarkdown,
      TxAiThinking, TxAiTurnFooter, TxAiErrorBlock, TxAiToolChart, TxAiToolForm, TxAiToolWidget,
    ]) expect(component).toBeTruthy()
  })

  it('exports the documented helpers from the root and the side-effect-free utils entry', () => {
    for (const helper of [
      toMessageSegments, toolFaceOf, parseToolResult, describeToolCallError,
      formatMetricLatency, calculateTokenSpeed, useThinkingTicker, useTurnFooterState,
    ]) expect(helper).toBeTypeOf('function')
    expect(utils.toMessageSegments).toBe(toMessageSegments)
    expect(utils.toolFaceOf).toBe(toolFaceOf)
    expect(utils.formatMetricLatency).toBe(formatMetricLatency)
    expect(utils.useTurnFooterState).toBe(useTurnFooterState)
    expect(utils).not.toHaveProperty('TxAiAssistantTurn')
  })

  it('registers exported components through install', () => {
    const app = { component: vi.fn() } as unknown as App

    install(app)

    expect(app.component).toHaveBeenCalledWith('TxAiConversation', TxAiConversation)
    expect(app.component).toHaveBeenCalledWith('TxAiMarkdown', TxAiMarkdown)
    expect(app.component).toHaveBeenCalledWith('TxAiAssistantTurn', TxAiAssistantTurn)
    expect(app.component).toHaveBeenCalledWith('TxAiToolForm', TxAiToolForm)
  })
})
