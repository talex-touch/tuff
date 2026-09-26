import type { Translate } from '~/modules/lang/useI18nText'
import type { HomeConversationSignal, HomeSessionSignal, HomeSignals } from './signals'
import { clipText, singleLine } from './text'

/** How many recent conversation titles the model sees. */
export const HOME_SUMMARY_MAX_TITLES = 3
/** How many project names the model sees, per line. */
export const HOME_SUMMARY_MAX_PROJECTS = 3

/** Long enough for a topic; a working title that is a whole paragraph gets its first clause. */
const SUMMARY_TITLE_CODEPOINTS = 24
const SUMMARY_NAME_CODEPOINTS = 32

/**
 * An absolute filesystem path standing as its own token: `/Users/me/x`, `C:\work\y`, `~/a/b`.
 *
 * Titles are the user's own words and can quote a path the user typed. The summary promises titles
 * and names, never paths, so a path-shaped token is replaced rather than trusted. A token has to
 * *start* with the root and hold a second separator, which leaves URLs (`https://…`), relative
 * fragments (`a/b`) and CJK prose with slashes (`数据/2024/报告`) alone.
 */
const PATH_LIKE_TOKEN =
  /(^|[\s"'“”‘’「」『』《》([（【])((?:~|[A-Za-z]:)?[\\/][^\s"'“”‘’「」『』《》)\]）】]*[\\/][^\s"'“”‘’「」『』《》)\]）】]*)/g

export function stripPathLikeTokens(value: string): string {
  return value.replace(PATH_LIKE_TOKEN, (_match, lead: string) => `${lead}…`)
}

function summaryText(value: string, max: number): string {
  return clipText(singleLine(stripPathLikeTokens(value)), max)
}

/** Stable partition: the active project's rows first, each group keeping its recency order. */
function projectFirst<T extends HomeConversationSignal | HomeSessionSignal>(
  rows: readonly T[],
  projectId: string | null
): T[] {
  if (!projectId) return [...rows]
  return [
    ...rows.filter((row) => row.projectId === projectId),
    ...rows.filter((row) => row.projectId !== projectId)
  ]
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/**
 * The model-facing summary the opening line is written from: titles, names and one count, one fact
 * per line, in the reader's locale.
 *
 * What never goes in, by construction rather than by filtering: project root paths (the signals do
 * not carry them), the clipboard (the signals carry it for the card, and this function does not
 * read it), message bodies (the history list has none), and anything from an archived project.
 */
export function buildHomeSummary(signals: HomeSignals, t: Translate): string {
  const separator = t('home.opening.summary.separator')
  const quote = (text: string): string => t('home.opening.summary.quote', { text })
  const active = signals.activeProject
  const activeId = active?.id ?? null
  const lines: string[] = []

  const activeName = active ? summaryText(active.name, SUMMARY_NAME_CODEPOINTS) : ''
  if (activeName) {
    lines.push(t('home.opening.summary.currentProject', { name: activeName }))
  }

  const titles = distinct(
    projectFirst(signals.recentConversations, activeId)
      .map((conversation) => summaryText(conversation.title, SUMMARY_TITLE_CODEPOINTS))
      .filter(Boolean)
  ).slice(0, HOME_SUMMARY_MAX_TITLES)
  if (titles.length > 0) {
    lines.push(
      t('home.opening.summary.recentConversations', {
        titles: titles.map(quote).join(separator)
      })
    )
  }

  const projectNames = distinct(
    signals.projects
      .filter((project) => project.id !== activeId)
      .map((project) => summaryText(project.name, SUMMARY_NAME_CODEPOINTS))
      .filter(Boolean)
  ).slice(0, HOME_SUMMARY_MAX_PROJECTS)
  if (projectNames.length > 0) {
    lines.push(t('home.opening.summary.projects', { names: projectNames.join(separator) }))
  }

  const sessions = projectFirst(signals.sessions, activeId)
  if (sessions.length > 0) {
    const sessionProjects = distinct(
      sessions
        .map((session) => summaryText(session.projectName ?? '', SUMMARY_NAME_CODEPOINTS))
        .filter(Boolean)
    ).slice(0, HOME_SUMMARY_MAX_PROJECTS)
    lines.push(
      sessionProjects.length > 0
        ? t('home.opening.summary.localSessionsIn', {
            count: sessions.length,
            names: sessionProjects.join(separator)
          })
        : t('home.opening.summary.localSessions', { count: sessions.length })
    )
  }

  return lines.length > 0 ? lines.join('\n') : t('home.opening.summary.empty')
}

/**
 * Identity of an opening request: the instruction and the summary it was written from.
 *
 * The prompt is part of it because it carries the locale — switching language must not replay an
 * opening in the other one. cyrb53: 53 bits, so an unrelated summary reusing a stale opening inside
 * the ten-minute window is not a practical concern, and nothing but the hash is kept.
 */
export function fingerprintHomeOpening(prompt: string, summary: string): string {
  const input = `${prompt}\u0000${summary}`
  let h1 = 0xdeadbeef ^ input.length
  let h2 = 0x41c6ce57 ^ input.length
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
