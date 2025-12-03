import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import type {
  CompiledWidget,
  DependencyValidationResult,
  IWidgetProcessor,
  WidgetCompilationContext,
} from '../widget-processor'
import type { WidgetSource } from '../widget-loader'

/**
 * Allowed packages in widget sandbox
 * Widget 沙箱中允许的包
 */
const ALLOWED_PACKAGES = [
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/channel',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types',
] as const

/**
 * Vue widget processor
 * Vue Widget 处理器
 */
export class WidgetVueProcessor implements IWidgetProcessor {
  readonly supportedExtensions = ['.vue']

  /**
   * Validate dependencies used in the widget source
   * 验证 widget 源码中使用的依赖
   */
  validateDependencies(source: string): DependencyValidationResult {
    // Match import statements: import ... from 'module'
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g

    // Match require calls: require('module')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g

    const imports = new Set<string>()
    let match

    // Extract import statements
    while ((match = importRegex.exec(source)) !== null) {
      imports.add(match[1])
    }

    // Extract require calls
    while ((match = requireRegex.exec(source)) !== null) {
      imports.add(match[1])
    }

    const allowed: string[] = []
    const disallowed: string[] = []
    const errors: Array<{ module: string, message: string }> = []

    for (const module of imports) {
      if (this.isAllowedModule(module)) {
        allowed.push(module)
      }
      else {
        disallowed.push(module)
        errors.push({
          module,
          message: `Module "${module}" is not available in widget sandbox. Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`,
        })
      }
    }

    return {
      valid: disallowed.length === 0,
      allowedImports: allowed,
      disallowedImports: disallowed,
      errors,
    }
  }

  /**
   * Compile Vue widget source
   * 编译 Vue widget 源码
   */
  async compile(
    source: WidgetSource,
    context: WidgetCompilationContext,
  ): Promise<CompiledWidget | null> {
    const { plugin, feature } = context

    // Step 1: Validate dependencies
    const validation = this.validateDependencies(source.source)

    if (!validation.valid) {
      validation.errors.forEach((err) => {
        plugin.issues.push({
          type: 'error',
          code: 'WIDGET_INVALID_DEPENDENCY',
          message: err.message,
          source: `feature:${feature.id}`,
          meta: { module: err.module },
          suggestion: `Only these packages are allowed: ${ALLOWED_PACKAGES.join(', ')}`,
          timestamp: Date.now(),
        })
      })

      plugin.logger.error(
        `[WidgetVueProcessor] Dependency validation failed for widget "${source.widgetId}":`,
        validation.errors,
      )

      return null
    }

    try {
      // Step 2: Parse Vue SFC
      const descriptor = parse(source.source, { filename: source.filePath }).descriptor

      // Step 3: Compile script
      let scriptCode = ''

      if (descriptor.script || descriptor.scriptSetup) {
        const compiledScript = compileScript(descriptor, {
          id: source.widgetId,
          inlineTemplate: false,
        })
        scriptCode = compiledScript.content
      }
      else {
        scriptCode = 'export default {}'
      }

      // Step 4: Compile template
      let templateCode = ''
      if (descriptor.template) {
        const compiledTemplate = compileTemplate({
          id: source.widgetId,
          filename: source.filePath,
          source: descriptor.template.content,
          compilerOptions: {
            mode: 'function',
          },
        })
        templateCode = compiledTemplate.code
      }

      // Step 5: Resolve language loader
      const loader = this.resolveLoader(descriptor.script?.lang ?? descriptor.scriptSetup?.lang)

      // Step 6: Bundle script and template
      const finalBundle = `
${scriptCode}
${templateCode}
const __component = exports.default || module.exports || {}
if (__component && exports.render) {
  __component.render = exports.render
}
module.exports = __component
`

      // Step 7: Transform with esbuild
      const transformed = await transform(finalBundle, {
        loader,
        format: 'cjs',
        target: 'node18',
      })

      // Step 8: Extract styles
      const styles = descriptor.styles.map(style => style.content || '').join('\n').trim()

      plugin.logger.info(
        `[WidgetVueProcessor] ✅ Successfully compiled widget "${source.widgetId}"`,
      )

      return {
        code: transformed.code,
        styles,
        dependencies: validation.allowedImports,
      }
    }
    catch (error) {
      plugin.logger.error(
        `[WidgetVueProcessor] ❌ Compilation failed for widget "${source.widgetId}":`,
        error as Error,
      )

      plugin.issues.push({
        type: 'error',
        code: 'WIDGET_COMPILE_FAILED',
        message: `Failed to compile Vue widget: ${(error as Error).message}`,
        source: `feature:${feature.id}`,
        meta: { error: (error as Error).stack },
        timestamp: Date.now(),
      })

      return null
    }
  }

  /**
   * Check if a module is allowed in the widget sandbox
   * 检查模块是否在 widget 沙箱中被允许
   */
  private isAllowedModule(module: string): boolean {
    // Relative imports are not supported (for now)
    if (module.startsWith('.') || module.startsWith('/')) {
      return false
    }

    // Check if module matches any allowed package
    return ALLOWED_PACKAGES.some(pkg =>
      module === pkg || module.startsWith(`${pkg}/`),
    )
  }

  /**
   * Resolve esbuild loader based on script language
   * 根据脚本语言解析 esbuild loader
   */
  private resolveLoader(lang: string | undefined): 'js' | 'ts' | 'tsx' | 'jsx' {
    if (!lang)
      return 'js'

    const lower = lang.toLowerCase()

    if (lower === 'ts')
      return 'ts'
    if (lower === 'tsx')
      return 'tsx'
    if (lower === 'jsx')
      return 'jsx'

    return 'js'
  }
}
