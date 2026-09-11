import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolverMocks = vi.hoisted(() => ({
  resolveDocsPage: vi.fn(),
}))

vi.mock('../../../server/utils/docsPageResolver', () => resolverMocks)

let handler: (event: any) => Promise<any>

async function importHandler() {
  vi.resetModules()
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  ;(globalThis as any).createError = (input: any) => Object.assign(new Error(input.message ?? input.statusMessage), input)
  handler = (await import('../../../server/api/docs/page/[locale]/[mode]/[...path].get')).default as (event: any) => Promise<any>
}

function eventWith(params: Record<string, unknown>) {
  return { context: { params } }
}

describe('/api/docs/page/[locale]/[mode]/[...path].json', () => {
  beforeEach(async () => {
    resolverMocks.resolveDocsPage.mockReset()
    await importHandler()
  })

  it('delegates a well-formed static path to the shared resolver with the body flag', async () => {
    resolverMocks.resolveDocsPage.mockResolvedValue({ title: 'Button' })
    const event = eventWith({ locale: 'en', mode: 'body', path: 'dev/components/button.json' })

    await expect(handler(event)).resolves.toEqual({ title: 'Button' })
    expect(resolverMocks.resolveDocsPage).toHaveBeenCalledWith(event, '/docs/dev/components/button', 'en', true)
  })

  it('maps the meta mode to a metadata-only read and index.json to the docs root', async () => {
    resolverMocks.resolveDocsPage.mockResolvedValue({ title: 'Docs' })
    const event = eventWith({ locale: 'zh', mode: 'meta', path: 'index.json' })

    await handler(event)
    expect(resolverMocks.resolveDocsPage).toHaveBeenCalledWith(event, '/docs', 'zh', false)
  })

  it('answers 404 instead of guessing for a shape it does not own', async () => {
    for (const params of [
      { locale: 'fr', mode: 'body', path: 'dev/components/button.json' },
      { locale: 'en', mode: 'full', path: 'dev/components/button.json' },
      { locale: 'en', mode: 'body', path: 'dev/components/button' },
      { locale: 'en', mode: 'body', path: '../secrets.json' },
    ]) {
      await expect(handler(eventWith(params))).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(resolverMocks.resolveDocsPage).not.toHaveBeenCalled()
  })
})
