import type { Translate } from '~/modules/lang/useI18nText'
import type { HomeSignals } from './signals'
import type { HomeGuideCategoryId, HomePushOption, HomePushStep } from './types'
import { HOME_GUIDE_CATEGORY_ICONS, HOME_GUIDE_SELF_ICON, HOME_GUIDE_STARTER_ICONS } from './icons'
import { clipText, singleLine } from './text'

/** Page 1 of the guide, in display order. Each maps to things Tuff can actually do today. */
export const HOME_GUIDE_CATEGORY_IDS: readonly HomeGuideCategoryId[] = [
  'work',
  'files',
  'writing',
  'research',
  'automation'
]

/** What page 2 shows before a category is picked — the pager can be turned without choosing. */
export const HOME_GUIDE_DEFAULT_CATEGORY: HomeGuideCategoryId = 'work'

export const HOME_GUIDE_CATEGORY_STEP_ID = 'guide:categories'
export const HOME_GUIDE_SELF_OPTION_ID = 'guide:self'

export function guideCategoryOptionId(category: HomeGuideCategoryId): string {
  return `guide:category:${category}`
}

type StarterKey = keyof typeof HOME_GUIDE_STARTER_ICONS

const PROJECT_NAME_CODEPOINTS = 32

/** A starter task: choosing it sends its own label, so what the row says is what gets asked. */
function starter(key: StarterKey, label: string, description: string): HomePushOption {
  return {
    id: `guide:starter:${key}`,
    label,
    description,
    icon: HOME_GUIDE_STARTER_ICONS[key],
    action: { kind: 'send', text: label }
  }
}

function categoryCopy(
  category: HomeGuideCategoryId,
  t: Translate
): { label: string; description: string } {
  switch (category) {
    case 'work':
      return {
        label: t('home.push.guide.category.work'),
        description: t('home.push.guide.category.workDesc')
      }
    case 'files':
      return {
        label: t('home.push.guide.category.files'),
        description: t('home.push.guide.category.filesDesc')
      }
    case 'writing':
      return {
        label: t('home.push.guide.category.writing'),
        description: t('home.push.guide.category.writingDesc')
      }
    case 'research':
      return {
        label: t('home.push.guide.category.research'),
        description: t('home.push.guide.category.researchDesc')
      }
    case 'automation':
      return {
        label: t('home.push.guide.category.automation'),
        description: t('home.push.guide.category.automationDesc')
      }
  }
}

/**
 * Three concrete tasks for a category. Real names only where the task can reach them: a task that
 * names a project is offered inside that project's blank conversation, where the model works in its
 * folder — sent from plain Home it would ask about a workspace the model cannot see. From Home, the
 * work category offers the most recent project itself instead, as a way into it.
 */
function starters(
  category: HomeGuideCategoryId,
  signals: HomeSignals,
  t: Translate
): HomePushOption[] {
  const active = signals.activeProject
  const project = active?.name ? clipText(singleLine(active.name), PROJECT_NAME_CODEPOINTS) : null
  switch (category) {
    case 'work': {
      const recent = active ? undefined : signals.projects.find((candidate) => candidate.name)
      const first: HomePushOption = project
        ? starter(
            'work.progress',
            t('home.push.guide.work.progress', { project }),
            t('home.push.guide.work.progressDesc')
          )
        : recent
          ? {
              id: `guide:starter:work.project:${recent.id}`,
              label: t('home.push.guide.work.enterProject', {
                project: clipText(singleLine(recent.name), PROJECT_NAME_CODEPOINTS)
              }),
              description: t('home.push.guide.work.enterProjectDesc'),
              icon: HOME_GUIDE_CATEGORY_ICONS.work,
              action: { kind: 'enter-project', projectId: recent.id }
            }
          : starter(
              'work.breakdown',
              t('home.push.guide.work.breakdown'),
              t('home.push.guide.work.breakdownDesc')
            )
      return [
        first,
        starter('work.plan', t('home.push.guide.work.plan'), t('home.push.guide.work.planDesc')),
        starter('work.notes', t('home.push.guide.work.notes'), t('home.push.guide.work.notesDesc'))
      ]
    }
    case 'files':
      return [
        starter('files.find', t('home.push.guide.files.find'), t('home.push.guide.files.findDesc')),
        starter(
          'files.downloads',
          t('home.push.guide.files.downloads'),
          t('home.push.guide.files.downloadsDesc')
        ),
        project
          ? starter(
              'files.projectTour',
              t('home.push.guide.files.projectTour', { project }),
              t('home.push.guide.files.projectTourDesc')
            )
          : starter(
              'files.summarize',
              t('home.push.guide.files.summarize'),
              t('home.push.guide.files.summarizeDesc')
            )
      ]
    case 'writing':
      return [
        starter(
          'writing.email',
          t('home.push.guide.writing.email'),
          t('home.push.guide.writing.emailDesc')
        ),
        starter(
          'writing.polish',
          t('home.push.guide.writing.polish'),
          t('home.push.guide.writing.polishDesc')
        ),
        starter(
          'writing.translate',
          t('home.push.guide.writing.translate'),
          t('home.push.guide.writing.translateDesc')
        )
      ]
    case 'research':
      return [
        starter(
          'research.summarize',
          t('home.push.guide.research.summarize'),
          t('home.push.guide.research.summarizeDesc')
        ),
        starter(
          'research.chart',
          t('home.push.guide.research.chart'),
          t('home.push.guide.research.chartDesc')
        ),
        project
          ? starter(
              'research.projectStructure',
              t('home.push.guide.research.projectStructure', { project }),
              t('home.push.guide.research.projectStructureDesc')
            )
          : starter(
              'research.compare',
              t('home.push.guide.research.compare'),
              t('home.push.guide.research.compareDesc')
            )
      ]
    case 'automation':
      return [
        starter(
          'automation.script',
          t('home.push.guide.automation.script'),
          t('home.push.guide.automation.scriptDesc')
        ),
        starter(
          'automation.rename',
          t('home.push.guide.automation.rename'),
          t('home.push.guide.automation.renameDesc')
        ),
        starter(
          'automation.repeat',
          t('home.push.guide.automation.repeat'),
          t('home.push.guide.automation.repeatDesc')
        )
      ]
  }
}

/**
 * The two-page guide: 「我们先从哪件事开始？」, then three starter tasks for the chosen category and
 * 「我自己说」 last.
 *
 * `category` is what page 1 last chose; until then page 2 shows {@link HOME_GUIDE_DEFAULT_CATEGORY}
 * so the pager is never a dead end. Page 2's id changes with the category, which is what makes the
 * card replay its entrance when the reader turns to it.
 */
export function buildHomeGuideSteps(
  signals: HomeSignals,
  category: HomeGuideCategoryId | null,
  t: Translate
): HomePushStep[] {
  const categories: HomePushOption[] = HOME_GUIDE_CATEGORY_IDS.map((id) => ({
    id: guideCategoryOptionId(id),
    ...categoryCopy(id, t),
    icon: HOME_GUIDE_CATEGORY_ICONS[id],
    action: { kind: 'choose-category', category: id }
  }))

  const chosen = category ?? HOME_GUIDE_DEFAULT_CATEGORY
  const self: HomePushOption = {
    id: HOME_GUIDE_SELF_OPTION_ID,
    label: t('home.push.guide.self'),
    description: t('home.push.guide.selfDesc'),
    icon: HOME_GUIDE_SELF_ICON,
    action: { kind: 'focus-composer' }
  }

  return [
    { id: HOME_GUIDE_CATEGORY_STEP_ID, title: t('home.push.guide.title'), options: categories },
    {
      id: `guide:starters:${chosen}`,
      title: t('home.push.guide.startersTitle', { category: categoryCopy(chosen, t).label }),
      options: [...starters(chosen, signals, t), self]
    }
  ]
}
