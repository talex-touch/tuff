interface NuxtComponentLike {
  filePath?: string
  pascalName?: string
  global?: boolean | string
}

interface ContentComponentsTemplateContext {
  app?: {
    components?: NuxtComponentLike[]
    [key: string]: unknown
  }
  nuxt?: {
    options?: {
      dev?: boolean
    }
  }
  options?: {
    manifest?: {
      components?: string[]
    }
  }
  [key: string]: unknown
}

type TemplateContentsResult = string | Promise<string>
type TemplateGetContents = (ctx: never) => TemplateContentsResult
type RuntimeTemplateGetContents = (ctx: ContentComponentsTemplateContext) => TemplateContentsResult

export interface NuxtTemplateLike {
  filename?: string
  getContents?: TemplateGetContents
}

export interface NuxtAppWithTemplatesLike {
  templates?: NuxtTemplateLike[]
}

const MDC_COMPONENT_PATH_PATTERNS = [
  '/app/components/content/',
  '/app/components/docs/',
  '/app/components/global/',
  '/@nuxtjs/mdc/',
]

export function isMdcContentComponent(
  component: NuxtComponentLike,
  manifestComponents: ReadonlySet<string>,
): boolean {
  if (component.global)
    return true

  if (component.pascalName && manifestComponents.has(component.pascalName))
    return true

  const normalizedPath = component.filePath?.replace(/\\/g, '/') ?? ''
  return MDC_COMPONENT_PATH_PATTERNS.some(pattern => normalizedPath.includes(pattern))
}

const wrappedTemplateLoaders = new WeakSet<TemplateGetContents>()

/**
 * In `nuxt dev`, `@nuxt/content` emits dynamic loaders in `.nuxt/content/components.ts`
 * for EVERY component in `app.components` (~485 entries across admin/dashboard/tuffex).
 * Filtering only the `content/components.ts` template input keeps MDC rendering intact
 * (all `content/`, `docs/`, `global/`, `@nuxtjs/mdc`, `global: true`, and manifest-used
 * components stay registered) without affecting Nuxt page auto-imports (`app.components`).
 */
export function filterContentComponentsTemplate(app: NuxtAppWithTemplatesLike) {
  const template = app.templates?.find(entry => entry.filename === 'content/components.ts')
  if (!template?.getContents || wrappedTemplateLoaders.has(template.getContents))
    return

  const originalGetContents = template.getContents as unknown as RuntimeTemplateGetContents
  const wrapped: RuntimeTemplateGetContents = (ctx) => {
    if (!ctx?.nuxt?.options?.dev || !Array.isArray(ctx?.app?.components))
      return originalGetContents(ctx)

    const manifestComponents = new Set(ctx.options?.manifest?.components ?? [])
    const filteredComponents = ctx.app.components.filter(component =>
      isMdcContentComponent(component, manifestComponents),
    )

    return originalGetContents({
      ...ctx,
      app: {
        ...ctx.app,
        components: filteredComponents,
      },
    })
  }
  const wrappedLoader: TemplateGetContents = wrapped
  wrappedTemplateLoaders.add(wrappedLoader)
  template.getContents = wrappedLoader
}
