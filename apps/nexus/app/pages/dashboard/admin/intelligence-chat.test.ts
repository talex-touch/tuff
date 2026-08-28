import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./intelligence-chat.vue', import.meta.url), 'utf8')

describe('intelligence chat submit wiring', () => {
  // TxButton defaults to nativeType 'button', so inside <form @submit.prevent> the
  // click did nothing and mouse users could not send at all.
  it('submits the composer form from the send button', () => {
    expect(page).toContain('native-type="submit"')
    expect(page).toContain('@submit.prevent="sendMessage"')
  })

  // Implicit form submission already fires on Enter; a second keyup handler would
  // only be safe because sendMessage re-reads the (now cleared) draft, which is too
  // subtle to rely on. One path in, guarded by both checks.
  it('guards against a duplicate send from the same keystroke', () => {
    expect(page).toContain('if (!message || running.value)\n    return')
  })
})

describe('intelligence chat stream lifecycle', () => {
  it('always clears the running flag, including on a stream with no terminal event', () => {
    expect(page).toContain('} finally {\n    running.value = false\n    activeAnswerId.value = null\n  }')
  })

  it('tells the operator when the stream ended before completing', () => {
    expect(page).toContain('sawTerminalEvent = false')
    expect(page).toContain('if (!sawTerminalEvent)')
  })

  it('surfaces the handler status message instead of the opaque transport code', () => {
    // networkClient throws Error('NETWORK_HTTP_STATUS_400'); the actionable text
    // ("No enabled intelligence providers.") only exists in the response body, and
    // responseType 'stream' hands it back unread rather than parsed.
    expect(page).toContain('function describeRequestError')
    expect(page).not.toContain("errorMessage.value = error instanceof Error ? error.message : '发送失败。'")
    expect(page).not.toContain("loadError.value = error instanceof Error ? error.message : '历史记录加载失败。'")
  })

  it('captures the error body on both the history and send requests', () => {
    expect(page.match(/captureErrorResponseData: true/g)).toHaveLength(2)
  })

  it('does not leave a stale history-load error pinned above a live conversation', () => {
    expect(page).toContain("loadError.value = ''")
  })
})

describe('intelligence chat access gating', () => {
  // `!isAdmin` is also true while the session resolves, so the bare check told a
  // signed-in admin the page was forbidden until /api/user/me returned.
  it('separates "still loading" from "not an admin"', () => {
    expect(page).toContain('const sessionResolving = computed(')
    expect(page).toContain('v-if="sessionResolving"')
    expect(page).toContain('v-else-if="!isAdmin"')
  })

  it('renders a skeleton in the composer layout while resolving', () => {
    expect(page).toContain('<TxSkeleton')
  })
})
