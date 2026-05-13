import { describe, expect, it, vi } from 'vitest'
import install, {
  TxAiComposer,
  TxAiConversation,
  TxAiMarkdown,
  TxAiMessage,
  TxAiThinking,
} from '../index'

describe('intelligence-uikit exports', () => {
  it('exports core ai components', () => {
    expect(TxAiConversation).toBeTruthy()
    expect(TxAiMessage).toBeTruthy()
    expect(TxAiComposer).toBeTruthy()
    expect(TxAiMarkdown).toBeTruthy()
    expect(TxAiThinking).toBeTruthy()
  })

  it('registers exported components through install', () => {
    const app = { component: vi.fn() }

    install(app as any)

    expect(app.component).toHaveBeenCalledWith('TxAiConversation', TxAiConversation)
    expect(app.component).toHaveBeenCalledWith('TxAiMarkdown', TxAiMarkdown)
  })
})
