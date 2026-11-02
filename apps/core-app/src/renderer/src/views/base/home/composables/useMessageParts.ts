import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { OpenUIAction, TxAiSegment } from '@talex-touch/intelligence-uikit'
import {
  describeToolCallError,
  rollThinkingVerb,
  toMessageSegments
} from '@talex-touch/intelligence-uikit/utils'
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'

export interface MessagePartsOptions {
  /** Sends text as the next user turn; rejects when Main refuses it. */
  submit: (
    text: string,
    attachments: undefined,
    options?: { answersToolCallId: string }
  ) => Promise<unknown>
  /** Opens an http(s) link outside the app. */
  openExternal: (url: string) => Promise<unknown>
  /** The composer draft: a form answer is not typed text, so it clears what was there. */
  clearDraft: () => void
  onSubmitError: (error: unknown) => void
}

/**
 * How an assistant turn's body is read: ordered segments, the widget a tool result becomes, the
 * form lock/draft state and the dev payload inspector. Everything the template needs to render a
 * message without knowing where its parts came from.
 */
export function useMessageParts(options: MessagePartsOptions) {
  const { t, locale } = useI18n()

  /**
   * One verb per turn, held by message id: the header must not reshuffle on every
   * streaming delta (a re-render happens tens of times a second), but a new turn
   * should read differently from the last one.
   */
  const thinkingVerbs = new Map<string, string>()

  function thinkingVerbFor(message: ConversationMessage): string {
    const existing = thinkingVerbs.get(message.id)
    if (existing) return existing
    // A host that stubs `useI18n` (tests) can leave `locale` absent; the verb list
    // then falls back to the source language rather than throwing mid-render.
    const verb = rollThinkingVerb(locale?.value ?? 'zh')
    thinkingVerbs.set(message.id, verb)
    return verb
  }

  /**
   * The message body, in the order the provider streamed it: each thinking span
   * its own block, each tool call its own card. Derived per render rather than
   * cached — `parts` grows in place on every delta.
   */
  function segmentsOf(message: ConversationMessage): TxAiSegment[] {
    const streaming = message.status === 'streaming'
    if (!message.parts)
      return message.content
        ? [{ kind: 'text', id: `${message.id}-text`, text: message.content, streaming }]
        : []
    return toMessageSegments(message.parts, streaming, {
      thinking: t('home.thinkingVerb', { verb: thinkingVerbFor(message) }),
      thinkingFor: (time) => t('home.thinkingFor', { time }),
      interrupted: t('home.toolInterrupted'),
      toolError: (error) => describeToolCallError(error, t)
    })
  }

  /** Ids of forms already answered this session — locks their cards. */
  const submittedForms = reactive(new Set<string>())

  /**
   * Half-typed form input, keyed by tool call id. The stream virtualizes rows
   * out of the DOM once they scroll far enough away, and a card component's own
   * state unmounts with it — this is what hands the draft back on remount.
   * Plain Map on purpose: it is only read when a card mounts.
   */
  const formDrafts = new Map<string, Record<string, FormFieldValue>>()

  /**
   * A form submission continues the conversation as a plain user message: the
   * model reads it like any other turn, so the loop needs no second channel.
   * Main marks the answered call in the same write, so a reloaded thread does not
   * re-offer a spent form; the local lock covers the moment until it lands.
   */
  function submitForm(tool: AiToolCallPart, values: Record<string, unknown>): void {
    submittedForms.add(tool.id)
    formDrafts.delete(tool.id)
    const lines = Object.entries(values).map(([key, value]) => `${key}: ${String(value)}`)
    options.clearDraft()
    void options
      .submit(`【${t('home.formSubmitted')}】\n${lines.join('\n')}`, undefined, {
        answersToolCallId: tool.id
      })
      .catch((error: unknown) => {
        submittedForms.delete(tool.id)
        options.onSubmitError(error)
      })
  }

  /**
   * What an interactive answer (an ```openui block) asks of the host. The kit validates and
   * emits; the effect is the page's. `continue_conversation` is the answer speaking as the user,
   * so it goes out as the next turn; anything unrecognised is dropped, not guessed at.
   */
  function handleOpenUIAction(action: OpenUIAction): void {
    if (action.type === 'continue_conversation') {
      const message = action.context?.trim()
      if (!message) return
      options.clearDraft()
      void options.submit(message, undefined).catch(options.onSubmitError)
      return
    }
    if (action.type === 'open_url') {
      const url = String(action.params?.url ?? '')
      if (/^https?:\/\//i.test(url)) void options.openExternal(url).catch(() => {})
      return
    }
    if (action.type === 'copy_to_clipboard') {
      const text = action.params?.text
      if (typeof text === 'string') void navigator.clipboard.writeText(text).catch(() => {})
    }
  }

  /**
   * The raw payload affordance is for builders: dev builds only, and even
   * there just a whisper of a toggle per widget. It opens a dialog with the
   * call rendered as highlighted JSON — the code block brings its own copy
   * button, so inspection and grabbing the payload are one gesture each.
   */
  const showToolPayload = import.meta.env.DEV
  const payloadFor = ref<AiToolCallPart | null>(null)

  const payloadJson = computed(() => {
    const input = payloadFor.value?.input
    if (!input) return ''
    try {
      // Normalized pretty-print; the accumulator may hand over compact JSON.
      return JSON.stringify(JSON.parse(input), null, 2)
    } catch {
      return input
    }
  })

  /**
   * Labels for the tool card. TuffEx carries no i18n, so the wording comes from here.
   */
  const toolCallLabels = computed(() => ({
    retryLabel: t('home.retry'),
    pendingLabel: t('home.toolCall.pending'),
    runningLabel: t('home.toolCall.running'),
    doneLabel: t('home.toolCall.done'),
    errorLabel: t('home.toolCall.error'),
    inputLabel: t('home.toolCall.input'),
    emptyResultLabel: t('home.toolCall.emptyResult'),
    linesToggleFormatter: (hiddenCount: number, expanded: boolean) =>
      expanded ? t('home.toolCall.linesLess') : t('home.toolCall.linesMore', { count: hiddenCount })
  }))

  /**
   * Remote images in a reply are held back until the reader asks for them: an
   * image fetches with no click, so an unreviewed `src` reports their IP to
   * whoever wrote the markdown — which, for a reply built from pages the model
   * just read, is not the model. TuffEx carries no i18n, so the wording comes
   * from here.
   */
  const markdownLabels = computed(() => ({
    blockedImageText: t('home.image.blocked'),
    loadImageOnceText: t('home.image.loadOnce'),
    allowSessionImagesText: t('home.image.allowSession'),
    copyTableText: t('home.table.copyTable'),
    copiedTableText: t('home.table.copiedTable'),
    codePreviewText: t('home.code.preview'),
    codeSourceText: t('home.code.source'),
    codeFrameLabelFormatter: (lang: string) => t('home.code.frameLabel', { lang }),
    copyCodeText: t('home.copy'),
    copiedCodeText: t('home.copied'),
    diagramZoomLabel: t('home.diagram.zoom'),
    diagramPreviewLabel: t('home.diagram.preview'),
    diagramCloseLabel: t('home.diagram.close'),
    diagramDownloadLabel: t('home.diagram.download'),
    diagramCopyFailedText: t('home.diagram.copyFailed'),
    diagramErrorText: t('home.diagram.failed')
  }))

  /**
   * Code parts of a reply (`TxStreamElement`'s own, not the fences inside delegated markdown).
   * A settled HTML or SVG block opens on its rendering: a page that was asked for is for
   * looking at, and the toggle still brings the source back. Scripts stay off in the frame.
   */
  const codePartProps = computed(() => ({
    autoPreview: true,
    previewLabel: t('home.code.preview'),
    codeLabel: t('home.code.source'),
    codeFrameLabelFormatter: (lang: string) => t('home.code.frameLabel', { lang })
  }))

  const chartProps = computed(() => ({
    labels: {
      line: t('home.chartView.line'),
      bar: t('home.chartView.bar'),
      area: t('home.chartView.area'),
      edit: t('home.chartEdit'),
      done: t('home.chartDone'),
      label: t('home.chartLabel'),
      remove: t('home.chartRemove'),
      addPlaceholder: t('home.chartAddPlaceholder'),
      add: t('home.chartAdd'),
      failed: t('home.chartFailed'),
      close: t('common.close')
    }
  }))
  const formProps = computed(() => ({
    submitLabel: t('home.formSubmit'),
    resetLabel: t('home.formReset'),
    requiredHint: t('home.formRequired'),
    submittedLabel: t('home.formDone'),
    selectPlaceholder: t('home.formSelect')
  }))
  const widgetProps = computed(() => ({
    labels: {
      generated: t('home.widget.generated'),
      sandboxed: t('home.widget.sandboxed'),
      loading: t('home.widget.loading'),
      failed: t('home.widget.failed'),
      timedOut: t('home.widget.timedOut')
    },
    blockedLabel: (directive: string) => t('home.widget.blocked', { directive })
  }))
  const footerLabels = computed(() => ({
    copy: t('home.copy'),
    copied: t('home.copied'),
    regenerate: t('home.regenerate'),
    speak: t('home.speak'),
    speakStop: t('home.speakStop'),
    branch: t('home.workspace.fork.fromHere'),
    input: t('home.workspace.activity.metrics.input'),
    output: t('home.workspace.activity.metrics.output'),
    total: t('home.workspace.activity.metrics.total'),
    latency: t('home.workspace.activity.metrics.latency'),
    totalLatency: t('home.workspace.activity.metrics.totalLatency'),
    ttft: t('home.workspace.activity.metrics.ttft'),
    model: t('home.workspace.activity.metrics.model'),
    coordinator: t('home.workspace.activity.metrics.coordinator')
  }))

  return {
    chartProps,
    formProps,
    widgetProps,
    footerLabels,
    thinkingVerbFor,
    segmentsOf,
    submittedForms,
    formDrafts,
    submitForm,
    handleOpenUIAction,
    showToolPayload,
    payloadFor,
    payloadJson,
    toolCallLabels,
    markdownLabels,
    codePartProps
  }
}
