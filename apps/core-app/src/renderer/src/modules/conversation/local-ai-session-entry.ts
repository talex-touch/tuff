import type { ITuffTransport } from '@talex-touch/utils/transport'
import type { LocalAiCliSessionSummary } from '@talex-touch/utils/transport/events/local-ai-cli'
import { omniPanelShowEvent } from '../../../../shared/events/omni-panel'

/** The fields a resume needs — a full summary satisfies it, and so does a plain snapshot of one. */
export type LocalAiSessionTarget = Pick<
  LocalAiCliSessionSummary,
  'state' | 'projectId' | 'sessionRef' | 'provider'
>

/**
 * Resumes a local AI CLI session in the omni panel — the one way in, shared by the sidebar's
 * session rows and Home's 「为你准备」 card so the two cannot drift apart.
 *
 * Only an `available` session is dispatched: a `missing` one has lost its provider record and a
 * `conflict` one has diverged, and resuming either would run against a thread that is no longer
 * the one on screen. Resolves `false` for those without sending anything.
 *
 * The payload is rebuilt from the four opaque fields rather than forwarded: a session read off the
 * reactive store is a Proxy, which the transport's structured clone rejects, and nothing else on
 * the summary belongs in the panel's request.
 */
export async function continueLocalAiSession(
  transport: Pick<ITuffTransport, 'send'>,
  session: LocalAiSessionTarget
): Promise<boolean> {
  if (session.state !== 'available') return false
  await transport.send(omniPanelShowEvent, {
    captureSelection: false,
    source: 'project-local-ai',
    localAi: {
      projectId: session.projectId ?? undefined,
      sessionRef: session.sessionRef,
      provider: session.provider
    }
  })
  return true
}
