import type { App } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import install, {
  buildMessageRailTurns,
  calculateAiContextPercent,
  calculateTokenSpeed,
  deriveAiRunStep,
  deriveAiSendState,
  describeToolCallError,
  formatAiContextWindow,
  formatAiElapsed,
  formatMetricLatency,
  metricModelTitle,
  normalizeComposerAttachments,
  parseToolResult,
  splitTurnModelLabel,
  toMessageSegments,
  toolFaceOf,
  TxAiAssistantTurn,
  TxAiCodeBlock,
  TxAiComposer,
  TxAiComposerChip,
  TxAiComposerControl,
  TxAiComposerMic,
  TxAiComposerSendIsland,
  TxAiContextMeter,
  TxAiConversation,
  TxAiErrorBlock,
  TxAiMarkdown,
  TxAiMessage,
  TxAiMessageRail,
  TxAiRichBlock,
  TxAiRunStatus,
  TxAiSuggestion,
  TxAiThinking,
  TxAiTokenMenu,
  TxAiToolCall,
  TxAiToolChart,
  TxAiToolForm,
  TxAiToolWidget,
  TxAiTurnFooter,
  TxAiVoiceDraft,
  useThinkingTicker,
  useTurnFooterState,
} from '../index'
import * as utils from '@talex-touch/intelligence-uikit/utils'

describe('intelligence-uikit exports', () => {
  it('exports the public conversation and tool components', () => {
    for (const component of [
      TxAiAssistantTurn, TxAiConversation, TxAiMessage, TxAiMessageRail,
      TxAiComposer, TxAiComposerControl, TxAiComposerChip, TxAiComposerMic,
      TxAiComposerSendIsland, TxAiRunStatus, TxAiContextMeter, TxAiVoiceDraft,
      TxAiTokenMenu, TxAiSuggestion, TxAiMarkdown, TxAiCodeBlock, TxAiRichBlock,
      TxAiThinking, TxAiTurnFooter, TxAiErrorBlock, TxAiToolCall,
      TxAiToolChart, TxAiToolForm, TxAiToolWidget,
    ]) expect(component).toBeTruthy()
  })

  it('exports the documented helpers from the root and the side-effect-free utils entry', () => {
    for (const helper of [
      toMessageSegments, toolFaceOf, parseToolResult, describeToolCallError,
      formatMetricLatency, calculateTokenSpeed, metricModelTitle, splitTurnModelLabel, useThinkingTicker, useTurnFooterState,
      deriveAiSendState, deriveAiRunStep, formatAiElapsed, formatAiContextWindow,
      calculateAiContextPercent, normalizeComposerAttachments, buildMessageRailTurns,
    ]) expect(helper).toBeTypeOf('function')
    expect(utils.toMessageSegments).toBe(toMessageSegments)
    expect(utils.toolFaceOf).toBe(toolFaceOf)
    expect(utils.formatMetricLatency).toBe(formatMetricLatency)
    expect(utils.useTurnFooterState).toBe(useTurnFooterState)
    expect(utils.deriveAiSendState).toBe(deriveAiSendState)
    expect(utils.buildMessageRailTurns).toBe(buildMessageRailTurns)
    expect(utils).not.toHaveProperty('TxAiAssistantTurn')
    expect(utils).not.toHaveProperty('TxAiComposer')
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
