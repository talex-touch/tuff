import type { Ref } from 'vue'
import type {
  CoreBoxFocusFailurePayload,
  CoreBoxFocusProbeRequest,
  CoreBoxFocusProbeResponse,
  CoreBoxFocusTarget
} from '@talex-touch/utils/core-box/focus-diagnostics'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { nextTick, onBeforeUnmount, onMounted } from 'vue'
import { createRendererLogger } from '../../../../utils/renderer-log'

const focusLog = createRendererLogger('CoreBoxFocus')

interface UseFocusOptions {
  boxInputRef: Ref<{ focus?: () => void; inputEl?: HTMLInputElement | null } | null>
  getExpectedTarget: () => CoreBoxFocusTarget
}

/**
 * Hook for managing CoreBox input focus
 */
export function useFocus(options: UseFocusOptions) {
  const { boxInputRef } = options
  const transport = useTuffTransport()
  let mounted = false
  let summonId: string | null = null
  let version = 0
  const disposers: Array<() => void> = []

  function getSummonId(): string | null {
    return summonId
  }

  function snapshot(request: CoreBoxFocusProbeRequest): CoreBoxFocusProbeResponse {
    const input = boxInputRef.value?.inputEl
    const inputPresent = input?.isConnected === true
    const inputFocused = inputPresent && document.activeElement === input
    const documentFocused = document.hasFocus()
    const expectedTarget = options.getExpectedTarget()
    const panel =
      expectedTarget === 'flow'
        ? document.querySelector('.FlowSelector')
        : expectedTarget === 'history'
          ? document.querySelector('.PreviewHistoryPanel.is-visible')
          : null
    const expectedTargetPresent = expectedTarget === 'input' ? inputPresent : panel !== null
    // These modal pickers own window-level keys while open; DOM input focus is not required.
    const expectedTargetFocused =
      expectedTarget === 'input' ? inputFocused : panel !== null && documentFocused
    return {
      summonId: request.summonId,
      sampleIndex: request.sampleIndex,
      documentFocused,
      inputPresent,
      inputFocused,
      expectedTarget,
      expectedTargetPresent,
      expectedTargetFocused
    }
  }

  function reportFailure(code: CoreBoxFocusFailurePayload['code'], owner: string | null): void {
    if (!mounted || owner === null || owner !== summonId) return
    const input = boxInputRef.value?.inputEl
    const inputPresent = input?.isConnected === true
    focusLog.warn('Focus request failed', { code, summonId: owner })
    void transport
      .send(CoreBoxEvents.ui.focusFailure, {
        code,
        summonId: owner,
        documentFocused: document.hasFocus(),
        inputPresent,
        inputFocused: inputPresent && document.activeElement === input
      })
      .catch(() => {
        focusLog.warn('Focus failure notification unavailable', { code, summonId: owner })
      })
  }

  function setSession(id: string): void {
    if (id === summonId) return
    summonId = id
    version++
  }

  onMounted(() => {
    mounted = true
    disposers.push(
      transport.on(CoreBoxEvents.ui.focusSession, (payload) => {
        if (payload && typeof payload.summonId === 'string') setSession(payload.summonId)
      }),
      transport.on(CoreBoxEvents.ui.trigger, (payload) => {
        if (payload?.show === false) {
          summonId = null
          version++
        } else if (payload?.show === true && typeof payload.summonId === 'string') {
          setSession(payload.summonId)
        }
      }),
      transport.on(CoreBoxEvents.ui.focusProbe, (request) => {
        if (
          !request ||
          typeof request.summonId !== 'string' ||
          !Number.isInteger(request.sampleIndex) ||
          request.sampleIndex < 1 ||
          request.sampleIndex > 10
        )
          return
        const response = snapshot(request)
        void transport.send(CoreBoxEvents.ui.focusProbeResult, response).catch(() => {
          focusLog.warn('Focus probe result unavailable', {
            summonId: request.summonId,
            sampleIndex: request.sampleIndex
          })
        })
      })
    )
  })

  onBeforeUnmount(() => {
    mounted = false
    summonId = null
    version++
    for (const dispose of disposers) dispose()
  })

  /**
   * Focuses the CoreBox window first, then the input element
   */
  async function focusWindowAndInput(): Promise<void> {
    const startedVersion = version
    let owner = summonId
    try {
      const response = await transport.send(CoreBoxEvents.ui.focusWindow)
      owner = typeof response.summonId === 'string' ? response.summonId : null
      if (owner !== null && version === startedVersion) setSession(owner)
      if (response.focused !== true) reportFailure('COREBOX_FOCUS_REQUEST_FAILED', owner)
    } catch {
      reportFailure('COREBOX_FOCUS_REQUEST_FAILED', owner)
    }
    await nextTick()
    focusInput(owner)
  }

  /**
   * Focuses only the input element
   */
  function focusInput(owner: string | null = summonId): void {
    const input = boxInputRef.value
    const expectedInput = options.getExpectedTarget() === 'input'
    if (!input?.focus) {
      if (expectedInput) reportFailure('COREBOX_FOCUS_INPUT_REQUEST_FAILED', owner)
      return
    }
    try {
      input.focus()
      if (
        expectedInput &&
        (!input.inputEl?.isConnected || document.activeElement !== input.inputEl)
      ) {
        reportFailure('COREBOX_FOCUS_INPUT_REQUEST_FAILED', owner)
      }
    } catch {
      reportFailure('COREBOX_FOCUS_INPUT_REQUEST_FAILED', owner)
    }
  }

  return {
    focusWindowAndInput,
    focusInput,
    getSummonId
  }
}
