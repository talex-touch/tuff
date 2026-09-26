import type { Translate } from '~/modules/lang/useI18nText'
import type {
  HomeClipboardSignal,
  HomeConversationSignal,
  HomeProjectSignal,
  HomeSessionSignal,
  HomeSignals
} from './signals'
import type { HomePushMode, HomePushOption, HomePushStep } from './types'
import { HOME_FEED_ICONS } from './icons'
import { clipText, singleLine } from './text'

/** 「为你准备」 never lists more than this. */
export const HOME_FEED_MAX_ITEMS = 4

export const HOME_FEED_STEP_ID = 'feed'

/**
 * The priority order, highest first. What belongs to the blank conversation's own project leads;
 * a recent project to start in closes the list.
 */
export const HOME_FEED_KIND_ORDER = [
  'current-project',
  'conversation',
  'session',
  'clipboard',
  'project'
] as const

export type HomeFeedKind = (typeof HOME_FEED_KIND_ORDER)[number]

export interface HomeFeedItem extends HomePushOption {
  kind: HomeFeedKind
}

const TITLE_CODEPOINTS = 24
const NAME_CODEPOINTS = 32
const EXCERPT_CODEPOINTS = 40

function title(value: string): string {
  return clipText(singleLine(value), TITLE_CODEPOINTS)
}

function name(value: string): string {
  return clipText(singleLine(value), NAME_CODEPOINTS)
}

function conversationItem(
  kind: HomeFeedKind,
  conversation: HomeConversationSignal,
  t: Translate
): HomeFeedItem {
  return {
    kind,
    id: `feed:conversation:${conversation.id}`,
    label: t('home.push.feed.continueConversation', {
      title: conversation.title
        ? title(conversation.title)
        : t('home.push.feed.untitledConversation')
    }),
    description: conversation.projectName
      ? t('home.push.feed.conversationInProject', { project: name(conversation.projectName) })
      : t('home.push.feed.conversationDesc'),
    icon: HOME_FEED_ICONS.conversation,
    action: { kind: 'open-conversation', conversationId: conversation.id }
  }
}

function sessionItem(kind: HomeFeedKind, session: HomeSessionSignal, t: Translate): HomeFeedItem {
  return {
    kind,
    id: `feed:session:${session.sessionRef}`,
    label: session.title
      ? t('home.push.feed.continueSession', {
          provider: session.provider,
          title: title(session.title)
        })
      : t('home.push.feed.continueUntitledSession', { provider: session.provider }),
    description: session.projectName
      ? t('home.push.feed.sessionInProject', { project: name(session.projectName) })
      : t('home.push.feed.sessionDesc'),
    icon: HOME_FEED_ICONS.session,
    // A plain snapshot, not the store's reactive summary: the action outlives the render.
    action: {
      kind: 'continue-session',
      session: {
        state: 'available',
        sessionRef: session.sessionRef,
        provider: session.provider,
        projectId: session.projectId
      }
    }
  }
}

/**
 * The clipboard row. Its excerpt is on screen and its text goes to the composer on click — and
 * that is all: the row never sends, and nothing here reaches the model summary.
 */
function clipboardItem(clipboard: HomeClipboardSignal, t: Translate): HomeFeedItem {
  return {
    kind: 'clipboard',
    id: `feed:clipboard:${clipboard.id}`,
    label: t('home.push.feed.clipboard'),
    description: t('home.push.feed.clipboardExcerpt', {
      excerpt: clipText(singleLine(clipboard.text), EXCERPT_CODEPOINTS)
    }),
    icon: HOME_FEED_ICONS.clipboard,
    action: { kind: 'prefill', text: clipboard.text }
  }
}

function projectItem(project: HomeProjectSignal, t: Translate): HomeFeedItem {
  return {
    kind: 'project',
    id: `feed:project:${project.id}`,
    label: t('home.push.feed.enterProject', { project: name(project.name) }),
    description: project.pinned
      ? t('home.push.feed.pinnedProjectDesc')
      : t('home.push.feed.projectDesc'),
    icon: HOME_FEED_ICONS.project,
    action: { kind: 'enter-project', projectId: project.id }
  }
}

/** Candidates per kind, each list newest first, in {@link HOME_FEED_KIND_ORDER}. */
function candidatesByKind(signals: HomeSignals, t: Translate): HomeFeedItem[][] {
  const activeId = signals.activeProject?.id ?? null

  // The project's own threads and sessions interleave by recency: which of the two was touched
  // last is what "pick up where you left off" means inside a project.
  const currentProject = activeId
    ? [
        ...signals.recentConversations
          .filter((conversation) => conversation.projectId === activeId)
          .map((conversation) => ({
            at: conversation.updatedAt,
            item: conversationItem('current-project', conversation, t)
          })),
        ...signals.sessions
          .filter((session) => session.projectId === activeId)
          .map((session) => ({
            at: session.lastSeenAt,
            item: sessionItem('current-project', session, t)
          }))
      ]
        .sort((left, right) => right.at - left.at)
        .map((entry) => entry.item)
    : []

  return [
    currentProject,
    signals.recentConversations
      .filter((conversation) => activeId === null || conversation.projectId !== activeId)
      .map((conversation) => conversationItem('conversation', conversation, t)),
    signals.sessions
      .filter((session) => activeId === null || session.projectId !== activeId)
      .map((session) => sessionItem('session', session, t)),
    signals.clipboard ? [clipboardItem(signals.clipboard, t)] : [],
    signals.projects
      .filter((project) => project.id !== activeId && project.name)
      .map((project) => projectItem(project, t))
  ]
}

/**
 * 「为你准备」: at most {@link HOME_FEED_MAX_ITEMS} rows, ordered by {@link HOME_FEED_KIND_ORDER}.
 *
 * Picked in two rounds. The first takes the newest row of every kind, highest priority first, so a
 * week of chats cannot crowd the clipboard or a waiting session off the card; the second fills what
 * is left in the same priority order. Either way the output reads in priority order.
 */
export function buildHomeFeed(signals: HomeSignals, t: Translate): HomeFeedItem[] {
  const groups = candidatesByKind(signals, t)
  const picked = new Set<HomeFeedItem>()

  for (const group of groups) {
    if (picked.size >= HOME_FEED_MAX_ITEMS) break
    const newest = group[0]
    if (newest) picked.add(newest)
  }
  for (const group of groups) {
    for (const item of group) {
      if (picked.size >= HOME_FEED_MAX_ITEMS) break
      picked.add(item)
    }
  }

  return groups.flat().filter((item) => picked.has(item))
}

/** The feed as the card's single page. */
export function buildHomeFeedStep(feed: readonly HomeFeedItem[], t: Translate): HomePushStep {
  return { id: HOME_FEED_STEP_ID, title: t('home.push.feed.title'), options: [...feed] }
}

/**
 * The guide until there is history to work from, 「为你准备」 after — and the guide again whenever
 * the feed comes out empty, so the blank state is never without a card.
 */
export function resolveHomePushMode(
  signals: HomeSignals,
  feed: readonly HomeFeedItem[]
): HomePushMode {
  return signals.hasHistory && feed.length > 0 ? 'feed' : 'guide'
}
