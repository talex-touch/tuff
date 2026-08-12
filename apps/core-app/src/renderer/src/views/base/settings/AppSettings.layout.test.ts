import { readFileSync } from 'node:fs'
import { compileStyle, compileTemplate, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const appSettingsSource = readFileSync(new URL('./AppSettings.vue', import.meta.url), 'utf8')
const { descriptor: appSettingsDescriptor } = parse(appSettingsSource, {
  filename: 'AppSettings.vue'
})
const appSettingsTemplate = compileTemplate({
  source: appSettingsDescriptor.template?.content ?? '',
  filename: 'AppSettings.vue',
  id: 'data-v-app-settings-test'
})
const appSettingsStyleBlock = appSettingsDescriptor.styles.find((style) => style.scoped)
if (!appSettingsStyleBlock) {
  throw new Error('AppSettings.vue must keep a scoped style block')
}
const appSettingsStyle = compileStyle({
  source: appSettingsStyleBlock.content,
  filename: 'AppSettings.vue',
  id: 'data-v-app-settings-test',
  scoped: true,
  preprocessLang: 'scss'
})

interface TemplateProp {
  type: number
  name: string
  value?: { content?: string }
}

interface TemplateNode {
  type: number
  tag?: string
  props?: TemplateProp[]
  children?: TemplateNode[]
  branches?: Array<{
    condition?: { content?: string }
    children: TemplateNode[]
  }>
}

function getStaticAttribute(node: TemplateNode, name: string): string | undefined {
  const attribute = node.props?.find((prop) => prop.type === 6 && prop.name === name)
  return attribute?.value?.content
}

function findConditionalSection(
  node: TemplateNode,
  section: string,
  conditions: string[] = []
): { node: TemplateNode; conditions: string[] } | null {
  if (getStaticAttribute(node, 'data-settings-section') === section) {
    return { node, conditions }
  }

  for (const child of node.children ?? []) {
    const result = findConditionalSection(child, section, conditions)
    if (result) return result
  }

  for (const branch of node.branches ?? []) {
    const branchConditions = branch.condition?.content
      ? [...conditions, branch.condition.content]
      : conditions
    for (const child of branch.children) {
      const result = findConditionalSection(child, section, branchConditions)
      if (result) return result
    }
  }

  return null
}

const appSettingsTemplateAst = appSettingsTemplate.ast as unknown as TemplateNode
const macTagSource = readFileSync(
  new URL('../../../components/tuff/tags/TuffMacOSTag.vue', import.meta.url),
  'utf8'
)
const enCatalog = JSON.parse(
  readFileSync(new URL('../../../modules/lang/en-US.json', import.meta.url), 'utf8')
) as {
  settings: { platformTags: { macOnly: string }; setup: { hideDockDesc: string } }
}
const zhCatalog = JSON.parse(
  readFileSync(new URL('../../../modules/lang/zh-CN.json', import.meta.url), 'utf8')
) as {
  settings: { platformTags: { macOnly: string }; setup: { hideDockDesc: string } }
}

describe('appSettings layout contract', () => {
  it('compiles page-scoped 12px gaps and direct-child margin resets', () => {
    expect(appSettingsStyle.errors).toEqual([])
    expect(appSettingsStyle.code).toMatch(
      /\.AppSettings-Container\[data-v-app-settings-test\],[\s\S]*\.AppSettings-Section\[data-v-app-settings-test\]\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*gap:\s*12px;/
    )
    expect(appSettingsStyle.code).toMatch(
      /\.AppSettings-Container\[data-v-app-settings-test\]\s*>\s*\*,[\s\S]*\.AppSettings-Section\[data-v-app-settings-test\]\s*>\s*\*\s*\{\s*margin-bottom:\s*0;/
    )
    expect(appSettingsStyle.code).toMatch(
      /\.AppSettings-Container\[data-v-app-settings-test\]\s+\.TBlockSlot-Container\s*\{[\s\S]*min-height:\s*56px;[\s\S]*height:\s*auto;[\s\S]*padding-top:\s*8px;[\s\S]*padding-bottom:\s*8px;/
    )
    expect(appSettingsStyle.code).not.toMatch(/^\.TGroupBlock-Container/m)
  })

  it('compiles conditional wrappers around file-index and Everything content', () => {
    expect(appSettingsTemplate.errors).toEqual([])

    const fileIndex = findConditionalSection(appSettingsTemplateAst, 'file-index')
    expect(fileIndex?.node.tag).toBe('div')
    expect(fileIndex?.conditions).toContain('_ctx.showAdvancedSettings')
    expect(getStaticAttribute(fileIndex!.node, 'class')).toContain('AppSettings-Section')
    expect(fileIndex?.node.children?.some((child) => child.tag === 'SettingFileIndex')).toBe(true)

    const everything = findConditionalSection(appSettingsTemplateAst, 'everything')
    expect(everything?.node.tag).toBe('div')
    expect(everything?.conditions).toContain('_ctx.isWindows')
    expect(getStaticAttribute(everything!.node, 'class')).toContain('AppSettings-Section')
    expect(everything?.node.children?.some((child) => child.tag === 'SettingEverything')).toBe(true)
  })
})

describe('macOS settings tag copy', () => {
  it('names the platform in text rather than leaning on a vendor glyph', () => {
    // The glyph carried the platform and the label carried "only", so the chip read as a bare
    // "Only" with no noun once the icon was scanned past. The label states it outright now.
    expect(macTagSource).not.toContain('i-simple-icons-apple')
    expect(macTagSource).toContain("t('settings.platformTags.macOnly'")
    expect(enCatalog.settings.platformTags.macOnly).toBe('macOS')
    expect(zhCatalog.settings.platformTags.macOnly).toBe('macOS')
  })

  it('keeps platform chips neutral so status colours stay meaningful', () => {
    // These sit beside granted/denied permission chips; a vendor blue competed with that signal.
    expect(macTagSource).toContain('color="var(--tx-text-color-secondary)"')
    expect(macTagSource).not.toMatch(/color="#[0-9a-f]{6}"/i)
  })

  it('does not repeat platform scope in hide Dock descriptions', () => {
    expect(enCatalog.settings.setup.hideDockDesc).not.toMatch(/macOS|only/i)
    expect(zhCatalog.settings.setup.hideDockDesc).not.toMatch(/macOS|仅限/i)
  })
})
