import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { WorkspaceSubmitDisposition } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { Ref } from 'vue'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import type { SendFlightHandle, SendLift } from '~/composables/useSendChoreography'
import {
  FLIGHT_IMPACT_MS,
  prefersReducedMotion,
  SCROLL_TWEEN_MS,
  type SendChoreography
} from '~/composables/useSendChoreography'
import {
  AgentWorkspaceRequestError,
  toAgentWorkspaceError,
  WORKSPACE_QUEUE_LIMIT
} from '~/modules/conversation/useAgentWorkspace'
import type { UseAgentWorkspaceReturn } from '~/modules/conversation/useAgentWorkspace'
import type { UseSendStateReturn } from './useSendState'
import { createConversationId } from '~/modules/conversation/useConversationHistory'
import type { UseConversationHistoryReturn } from '~/modules/conversation/useConversationHistory'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import type { UseHomePushReturn } from '~/modules/home-push/useHomePush'
import type { DictationFailureNotice } from '../composer/dictation-notice'
import { classifyDictationFailure } from '../composer/dictation-notice'
import type { UseComposerDictationReturn } from '../composer/useComposerDictation'
import type { OpeningHold } from './useHomeOpening'
import type { LeavingHead } from './useLeavingHead'

/** A send of the clip: its recording's id, and its transcript — what the model reads. */
export interface VoiceSend {
  recordingId: string
  text: string
}

export interface HomeSubmitOptions {
  /** What a send leaves on the page while it is in the air; shared with the thread restore. */
  submitState: UseSendStateReturn

  // ---- what the send reads ----
  browserLanding: () => boolean
  browserNavigate?: (input: string) => Promise<void>
  browserMode: Ref<'browse' | 'ask'>
  browserNavigating: Ref<boolean>
  isHomeRoute: Ref<boolean>
  isEmpty: Ref<boolean>
  conversationId: Ref<string | null>
  messages: Ref<ConversationMessage[]>
  draft: Ref<string>
  pendingAttachments: Ref<AiAttachment[]>
  canSend: Ref<boolean>
  voiceSendBlocked: Ref<boolean>
  sendQueues: Ref<boolean>
  /** Whether the routed model accepts images; `undefined` is auto routing, which accepts all. */
  imageInputAccepted: () => boolean | undefined
  homeRecommendationsEnabled: Ref<boolean>
  /** The opening as the greeting shows it, to pin while the greeting leaves. */
  opening: Ref<OpeningHold>
  push: Pick<UseHomePushReturn, 'takeLead'>

  // ---- what the send drives ----
  workspace: Pick<UseAgentWorkspaceReturn, 'submit' | 'state' | 'profiles' | 'settings'>
  dictation: UseComposerDictationReturn
  history: Pick<UseConversationHistoryReturn, 'refresh'>
  choreography: SendChoreography
  stream: () => TxConversationStreamInstance | null
  input: () => HTMLTextAreaElement | null
  composer: () => HTMLElement | null
  draftGhost: () => HTMLElement | null
  launchSendKey: () => void
  autoGrow: () => void
  collapseDraft: (animate: boolean) => void
  bubbleMaxWidth: () => number
  measureLeavingHead: () => LeavingHead | null
  pinLeavingHead: (head: LeavingHead | null) => void
  resetBlankConversation: (nextProjectId: string | null) => Promise<void>
  setConversationLoading: (id: string, loading: boolean) => void
  reportSubmitError: (error: unknown) => void
}

/**
 * The Home send path: a typed draft, a dictated clip, and the queue a busy Main takes them into.
 * It owns the ordering that keeps the page honest while Main answers — what is lifted off the
 * composer, which id is minted, what is handed back when Main refuses — and the guards that stop a
 * stale completion from touching a thread the reader has already left.
 */
export function useHomeSubmit(options: HomeSubmitOptions) {
  const { t } = useI18n()
  const route = useRoute()
  const router = useRouter()
  const {
    draft,
    pendingAttachments,
    conversationId,
    messages,
    dictation,
    workspace,
    choreography,
    submitState
  } = options
  const { sending, lifting, openingHold, submission: pageSubmissionSequence } = submitState

  /** What a failed voice send leaves on the clip: Main no longer has the recording, or nothing. */
  function voiceSendFailure(error: unknown): DictationFailureNotice | null {
    const failure =
      error instanceof AgentWorkspaceRequestError ? error.failure : toAgentWorkspaceError(error)
    return failure.code === 'WORKSPACE_VOICE_UNAVAILABLE'
      ? { kind: 'failed', detail: 'VOICE_RECORDING_NOT_FOUND' }
      : null
  }

  /**
   * Agent mode runs on one of the orchestrator's own enabled profiles; without one Main would refuse
   * the turn, so the press stops here with the reason instead of sending.
   */
  function agentProfileMissing(): boolean {
    const settings = workspace.settings.value
    if (settings.mode !== 'agent') return false
    // Built-in Tuff Coordinator is always available
    if (!settings.profileId || settings.profileId === 'default-pi') return false
    const profile = workspace.profiles.value.find((entry) => entry.id === settings.profileId)
    return !profile?.enabled
  }

  /**
   * Only images reach the model; a file in the tray never had bytes on this surface. Said once the
   * send has landed, so the reader knows which part of the message stayed behind.
   */
  function warnUnsentAttachments(attachments: AiAttachment[] | undefined): void {
    if (attachments?.some((attachment) => attachment.kind !== 'image')) {
      toast.info(t('home.attachmentNotSent'))
    }
  }

  /**
   * A send while Main is busy (or holds pending inputs) joins Main's queue. The draft stays in the
   * composer until Main has persisted it — a rejected input, the full queue included, is never shown
   * as queued and never lost (A6).
   */
  async function enqueueDraft(voice?: VoiceSend): Promise<void> {
    if ((workspace.state.value?.queue.length ?? 0) >= WORKSPACE_QUEUE_LIMIT) {
      toast.error(t('home.workspace.queue.full', { max: WORKSPACE_QUEUE_LIMIT }))
      if (voice) dictation.markClipSending(false)
      return
    }
    const isCurrentSend = pageSubmissionSequence.claim()
    const idAtSend = conversationId.value
    const pathAtSend = route.fullPath
    const ownsPage = () =>
      isCurrentSend() &&
      options.isHomeRoute.value &&
      conversationId.value === idAtSend &&
      route.fullPath === pathAtSend
    const text = voice?.text ?? draft.value
    const attachments =
      !voice && pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined
    // A voice send takes the clip off the stream now and leaves the draft to the reader, minus the
    // clip's own words once Main has the message.
    const draftAtSend = draft.value
    const draftAfterVoice = voice ? dictation.draftWithoutClip() : ''
    const clip = voice ? dictation.takeClip() : null
    sending.value = true
    try {
      await workspace.submit(
        text,
        attachments,
        voice ? { voiceRecordingId: voice.recordingId } : undefined
      )
    } catch (error) {
      if (clip) {
        dictation.restoreClip(clip)
        dictation.markClipSending(false, voiceSendFailure(error))
      }
      if (ownsPage()) options.reportSubmitError(error)
      return
    } finally {
      if (isCurrentSend()) sending.value = false
    }
    // A typed send moves the thread on; the clip it may have come from goes with it.
    if (!voice) dictation.dismissClip()
    if (!ownsPage()) return
    if (voice) {
      if (draft.value === draftAtSend) draft.value = draftAfterVoice
      await nextTick()
      if (ownsPage()) options.autoGrow()
      return
    }
    // Typing on while Main answered is the reader's next draft, not this one.
    if (draft.value === text) draft.value = ''
    pendingAttachments.value = pendingAttachments.value.filter(
      (attachment) => !attachments?.includes(attachment)
    )
    await nextTick()
    if (!ownsPage()) return
    options.collapseDraft(true)
    warnUnsentAttachments(attachments)
  }

  async function submit(voice?: VoiceSend): Promise<void> {
    if (options.browserLanding() && voice) options.browserMode.value = 'ask'
    if (voice ? options.voiceSendBlocked.value : !options.canSend.value) return
    if (options.browserLanding() && options.browserMode.value === 'browse' && !voice) {
      if (!options.browserNavigate || options.browserNavigating.value) return
      options.browserNavigating.value = true
      try {
        await options.browserNavigate(draft.value)
      } catch {
        // BrowserPage owns the visible transport error; the typed draft remains available for retry.
      } finally {
        options.browserNavigating.value = false
      }
      return
    }
    if (agentProfileMissing()) {
      toast.error(t('home.workspace.profile.required'))
      return
    }
    // Images reach a model only when its binding and adapter accept them; Main refuses the same
    // send, so the draft stays put here instead of being lifted and handed back. A voice send
    // carries no images: the tray stays for the next message.
    if (
      !voice &&
      options.imageInputAccepted() === false &&
      pendingAttachments.value.some((item) => item.kind === 'image')
    ) {
      toast.error(t('home.workspace.imagesUnsupported'))
      return
    }
    if (options.sendQueues.value) {
      await enqueueDraft(voice)
      return
    }
    const isCurrentSend = pageSubmissionSequence.claim()
    const pathAtSend = route.fullPath
    let idAtSend = conversationId.value
    const ownsPage = () =>
      isCurrentSend() &&
      options.isHomeRoute.value &&
      conversationId.value === idAtSend &&
      (route.fullPath === pathAtSend || (idAtSend !== null && route.params.id === idAtSend))
    // The send key launches with the press — a click, Enter and the shortcut all pass here — so its
    // arrow leaves with the lifted message and the stop capsule grows as the reply starts.
    options.launchSendKey()

    const text = voice?.text ?? draft.value
    const attachments =
      !voice && pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined
    // The lift carries the typed text off the composer as its own bubble. A send with attachments
    // keeps the clone flight, which carries the whole row — the tray included — not the text alone.
    // So does a voice send: what leaves is the clip, not the draft.
    const input = options.input()
    // The conversation's first message: its lift and the dock take their time (LIFT_SCORE).
    const opening = options.isEmpty.value
    // The Home opening above the composer becomes this thread's first message — a finished one only:
    // one still being written is dropped here and never joins (`takeLead`). Taken before anything
    // awaits, so no opening can start or land between the press and the append. The greeting keeps
    // showing what it showed until it has left (`openingHold`).
    let lead: string | undefined
    if (opening && options.homeRecommendationsEnabled.value) {
      openingHold.value = { ...options.opening.value }
      lead = options.push.takeLead() ?? undefined
    }
    const liftable =
      !options.browserLanding() && !voice && !attachments && !!input && !prefersReducedMotion()
    let lift: SendLift | null = null
    if (liftable && input) {
      // A lift still in the air lands first — before this one lays its bubble over the draft.
      choreography.invalidate()
      // Read before the draft clears: the bubble is laid over the text where it sits.
      lift = choreography.liftDraft({
        text,
        input,
        bubbleMaxWidth: options.bubbleMaxWidth(),
        draftGhost: options.draftGhost(),
        opening,
        onClear: () => {
          if (isCurrentSend()) lifting.value = false
        }
      })
      lifting.value = lift !== null
    }
    // A voice send leaves the draft to the reader, minus the clip's own words, and takes the clip off
    // the stream before an id is minted below — the conversation watcher dismisses any clip it sees.
    const draftAtSend = draft.value
    const draftAfterVoice = voice ? dictation.draftWithoutClip() : ''
    const clip = voice ? dictation.takeClip() : null
    if (voice) {
      draft.value = draftAfterVoice
    } else {
      draft.value = ''
      // Ownership moves to the message: the tray empties, the bubbles keep the object URLs alive.
      pendingAttachments.value = []
    }
    await nextTick()
    if (!ownsPage()) return
    if (voice) options.autoGrow()
    else options.collapseDraft(lift !== null)

    // Allocated here rather than at setup so an untouched home screen never claims an id; Main
    // creates the conversation with it in the same call that takes the message.
    const minted = conversationId.value === null
    conversationId.value ??= createConversationId()
    if (minted) submitState.setOwnMintedId(conversationId.value)
    idAtSend = conversationId.value

    // Claim the incoming batch before it exists: the length watcher fires
    // in the flush that applies Main's reply, so the flag must already be up.
    submitState.claimChoreographedSend(true)

    // FLIP: the composer travels from centre stage to the bottom dock. Measured
    // around the reactive flip so the same node glides instead of teleporting.
    const composerEl = options.composer()
    const first = composerEl?.getBoundingClientRect()
    const head = options.measureLeavingHead()

    sending.value = true
    if (idAtSend) options.setConversationLoading(idAtSend, true)
    let disposition: WorkspaceSubmitDisposition
    try {
      disposition = await workspace.submit(text, attachments, {
        lead,
        ...(voice ? { voiceRecordingId: voice.recordingId } : {})
      })
    } catch (error) {
      // The clip comes back whatever the page did meanwhile: its recording is still Main's to keep.
      if (clip) {
        dictation.restoreClip(clip)
        dictation.markClipSending(false, voiceSendFailure(error))
      }
      if (!ownsPage()) return
      // Rejection belongs to this view only. A stale completion cannot restore its
      // draft or release a minted id after the user chose another conversation.
      submitState.claimChoreographedSend(false)
      openingHold.value = null
      lift?.cancel()
      lifting.value = false
      if (voice) {
        if (draft.value === draftAfterVoice) draft.value = draftAtSend
      } else {
        if (!draft.value) draft.value = text
        pendingAttachments.value = [...(attachments ?? []), ...pendingAttachments.value]
      }
      if (minted) {
        if (idAtSend) options.setConversationLoading(idAtSend, false)
        conversationId.value = null
        idAtSend = null
      }
      await nextTick()
      if (!ownsPage()) return
      options.autoGrow()
      options.reportSubmitError(error)
      return
    } finally {
      if (isCurrentSend()) sending.value = false
    }
    // The thread is this id's now: from here on a change of id is a change of thread.
    if (minted) submitState.setOwnMintedId(null)
    // A typed send moves the thread on; the clip it may have come from goes with it.
    if (!voice) dictation.dismissClip()
    if (minted) void options.history.refresh()
    if (!ownsPage()) return
    warnUnsentAttachments(attachments)
    if (options.browserLanding()) {
      await router.push(`/home/c/${idAtSend}`)
      await options.resetBlankConversation(null)
      return
    }
    // Landing on the conversation's own URL is what lets the sidebar and a reload return to it.
    if (route.params.id !== idAtSend) void router.replace(`/home/c/${idAtSend}`)

    if (disposition !== 'started') {
      // Main took it as a pending input after all (a turn began in between): it is a queue row now,
      // not a bubble, so nothing flies.
      submitState.claimChoreographedSend(false)
      openingHold.value = null
      lift?.cancel()
      return
    }

    // Main's reply carried the thread with this message on it; the lead is its first row.
    const firstRow = messages.value[0]
    const leadId = lead && firstRow?.role === 'assistant' ? firstRow.id : undefined
    // Sending from a scrolled-up position still lands you on your own message —
    // the stream only auto-follows readers already at the bottom.
    await nextTick()
    if (!ownsPage()) return

    // If nothing was appended the watcher never consumed the claim, and a latched claim would steal
    // the next batch's entrance. Clearing after the flush is free in the normal path — the watcher
    // already consumed it.
    submitState.claimChoreographedSend(false)
    // The greeting left in that flush, keeping the opening it showed; nothing is left to hold.
    openingHold.value = null

    options.pinLeavingHead(head)

    if (composerEl && first && !prefersReducedMotion()) {
      // The box docks as the bubble rises: the two part in opposite directions, together.
      const deltaY = first.top - composerEl.getBoundingClientRect().top
      if (Math.abs(deltaY) > 8) {
        choreography.playComposerFlip(deltaY, opening && lift ? { opening: true } : undefined)
      }
    }

    // The send choreography: space and strike as ONE gesture. The freshly
    // appended rows are already in the layout (hidden by `--enter`), so the
    // glide opens the room while the message is already on its way —
    // iMessage's zero-latency press.
    //
    // A lift took the stage at the top of `submit`, landing any lift still in
    // the air there. That landing resolved its impact, and the placeholder reveal
    // chained to it was stamped during the awaits since: a second bump here would
    // silence it and leave the earlier reply hidden until the entrance watchdog —
    // and would land this send's own lift.
    if (!liftable) choreography.invalidate()
    const sentId = [...messages.value].reverse().find((message) => message.role === 'user')?.id
    const placeholderId =
      messages.value.at(-1)?.role === 'assistant' ? messages.value.at(-1)?.id : undefined

    if (prefersReducedMotion()) {
      // Only reachable when the preference flipped mid-send: put the lifted text down.
      lift?.cancel()
      options.stream()?.scrollToBottom()
      return
    }

    void options.stream()?.tweenToBottom(SCROLL_TWEEN_MS)
    // The opening the reader already read above the composer takes its place at the head of the
    // thread as the greeting leaves, before the lifted message lands under it. The append watcher
    // hid it with the rest of the claimed batch, and the send score below reveals only the message
    // and the placeholder. No knock: nothing sits above the first row.
    if (leadId) choreography.playEntrance(leadId, 0)
    let flight: SendFlightHandle | null = null
    if (lift) {
      if (sentId) flight = lift.fly(sentId)
      else lift.cancel()
    } else {
      // No lift (attachments, or one that could not be laid out): the clone flight carries the row,
      // so a claimed row is never left hidden for the watchdog to find.
      flight = sentId ? choreography.playSend(sentId, composerEl) : null
    }
    if (placeholderId) {
      // No knock of its own: the thread was just struck, and a second hit this
      // close would read as stutter rather than physics.
      const reveal = (): void => choreography.playEntrance(placeholderId, 0)
      if (flight) {
        void flight.impact.then(() => choreography.scheduleForCurrentSend(reveal, 80))
      } else {
        choreography.scheduleForCurrentSend(reveal, FLIGHT_IMPACT_MS + 80)
      }
    }
  }

  /**
   * 「发送语音」/「直接发送」: the clip goes out as a voice message. A clip with no words of its own
   * is recognized first — no adapter carries audio, so the transcript is what the model reads — and
   * one that still has none, or fails again, stays where it is and says why.
   */
  async function sendVoiceDraft(): Promise<void> {
    const clip = dictation.clip.value
    if (!clip || clip.busy || options.voiceSendBlocked.value) return
    if (agentProfileMissing()) {
      toast.error(t('home.workspace.profile.required'))
      return
    }
    dictation.markClipSending(true)
    let text: string
    try {
      text = await dictation.clipTranscript()
    } catch (error) {
      dictation.markClipSending(false, classifyDictationFailure(error) ?? { kind: 'failed' })
      return
    }
    // Dismissed, or replaced by a new recording, while it was being recognized.
    if (dictation.clip.value?.recording.id !== clip.recording.id) return
    if (!text) {
      dictation.markClipSending(false, { kind: 'empty', detail: 'VOICE_NOTHING_TO_SEND' })
      return
    }
    await submit({ recordingId: clip.recording.id, text })
  }

  /**
   * The send key, Enter and the send shortcut. While dictating they mean 「结束并发送」 (D10-d): the
   * session stops, and once its last words have landed in the draft they go out as an ordinary send.
   * A session that heard nothing still sends what the draft already held — the press asked for a
   * send; `submit` does nothing when the draft is empty too.
   */
  async function pressSend(): Promise<void> {
    if (dictation.active.value) {
      const outcome = await dictation.stop()
      if (outcome === 'inserted' || outcome === 'empty') await submit()
      return
    }
    await submit()
  }

  function handleKeydown(event: KeyboardEvent): void {
    // `isComposing` keeps Enter from cutting an IME candidate selection short.
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229)
      return
    event.preventDefault()
    void pressSend()
  }

  /**
   * Esc cancels a dictation and puts the draft back as it was before it started — from anywhere in
   * the composer: a click leaves focus on the microphone key, not in the field.
   */
  function handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !dictation.active.value) return
    event.preventDefault()
    dictation.cancel()
  }

  return {
    submit,
    pressSend,
    sendVoiceDraft,
    handleKeydown,
    handleComposerKeydown,
    agentProfileMissing,
    voiceSendFailure,
    warnUnsentAttachments
  }
}
