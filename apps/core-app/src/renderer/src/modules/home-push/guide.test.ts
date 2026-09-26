import { describe, expect, it } from 'vitest'
import {
  buildHomeGuideSteps,
  guideCategoryOptionId,
  HOME_GUIDE_CATEGORY_IDS,
  HOME_GUIDE_SELF_OPTION_ID
} from './guide'
import { fakeT, project, signalsOf } from './home-push.fixtures'

describe('buildHomeGuideSteps', () => {
  it('asks where to start with the five categories, each turning to page two', () => {
    const [categories] = buildHomeGuideSteps(signalsOf(), null, fakeT)

    expect(categories?.title).toBe('home.push.guide.title')
    expect(categories?.options.map((option) => option.id)).toEqual(
      HOME_GUIDE_CATEGORY_IDS.map(guideCategoryOptionId)
    )
    for (const option of categories?.options ?? []) {
      expect(option.action.kind).toBe('choose-category')
      expect(option.description).toBeTruthy()
      expect(option.icon).toMatch(/^i-ri-/)
    }
  })

  it('offers three starter tasks for the chosen category, then 「我自己说」', () => {
    const [, starters] = buildHomeGuideSteps(signalsOf(), 'writing', fakeT)

    expect(starters?.id).toBe('guide:starters:writing')
    expect(starters?.options).toHaveLength(4)
    expect(starters?.options.slice(0, 3).map((option) => option.action)).toEqual([
      { kind: 'send', text: 'home.push.guide.writing.email' },
      { kind: 'send', text: 'home.push.guide.writing.polish' },
      { kind: 'send', text: 'home.push.guide.writing.translate' }
    ])
    expect(starters?.options.at(-1)).toMatchObject({
      id: HOME_GUIDE_SELF_OPTION_ID,
      action: { kind: 'focus-composer' }
    })
  })

  it('shows the default category on page two until one is chosen', () => {
    const [, starters] = buildHomeGuideSteps(signalsOf(), null, fakeT)
    expect(starters?.id).toBe('guide:starters:work')
  })

  it('names the project inside that project’s blank conversation', () => {
    const signals = signalsOf({
      projects: [project({ id: 'p1', name: 'talex-touch' })],
      activeProjectId: 'p1'
    })
    const [, work] = buildHomeGuideSteps(signals, 'work', fakeT)
    const [, research] = buildHomeGuideSteps(signals, 'research', fakeT)

    expect(work?.options[0]?.action).toEqual({
      kind: 'send',
      text: 'home.push.guide.work.progress{"project":"talex-touch"}'
    })
    expect(research?.options[2]?.label).toBe(
      'home.push.guide.research.projectStructure{"project":"talex-touch"}'
    )
  })

  /**
   * From plain Home the model works outside every project folder, so a task naming one would ask
   * about a workspace it cannot see. The project is offered as a way in instead.
   */
  it('offers the most recent project as a way in, never as a task, from plain Home', () => {
    const signals = signalsOf({ projects: [project({ id: 'p1', name: 'talex-touch' })] })
    const [, work] = buildHomeGuideSteps(signals, 'work', fakeT)
    const [, research] = buildHomeGuideSteps(signals, 'research', fakeT)

    expect(work?.options[0]?.action).toEqual({ kind: 'enter-project', projectId: 'p1' })
    expect(research?.options[2]?.action).toEqual({
      kind: 'send',
      text: 'home.push.guide.research.compare'
    })
  })

  it('falls back to a task that needs no local data when there is none', () => {
    const [, work] = buildHomeGuideSteps(signalsOf(), 'work', fakeT)
    expect(work?.options[0]?.action).toEqual({
      kind: 'send',
      text: 'home.push.guide.work.breakdown'
    })
  })

  it('keeps every option id unique across both pages', () => {
    for (const category of HOME_GUIDE_CATEGORY_IDS) {
      const ids = buildHomeGuideSteps(
        signalsOf({ projects: [project({ id: 'p1' })], activeProjectId: 'p1' }),
        category,
        fakeT
      ).flatMap((step) => step.options.map((option) => option.id))
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
