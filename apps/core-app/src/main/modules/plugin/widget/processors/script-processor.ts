/**
 * Script Widget Processor
 *
 * Compiles plain TypeScript and JavaScript widgets.
 * Supports .ts and .js files that export Vue or plain components.
 */

import type { WidgetSource } from '../widget-loader'
import type {
  CompiledWidget,
  DependencyValidationResult,
  IWidgetProcessor,
  WidgetCompilationContext
} from '../widget-processor'
import path from 'node:path'
import { transform } from 'esbuild'

/**
 * Allowed packages in widget sandbox
 */
const ALLOWED_PACKAGES = [
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/channel',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types'
] as const

/**
 * Script Widget Processor
 *
 * Handles .ts and .js widget files
 */
export class WidgetScriptProcessor implements IWidgetProcessor {
  readonly supportedExtensions = ['.ts', '.js']

  /**
   * Validate dependencies used in the widget source
   */
  validateDependencies(source: string): DependencyValidationResult {
    const importRegex =
      /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    const dynamicImportRegex = /(?:await\s+)?import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    const reExportRegex = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g

    const imports = new Set<string>()
    let match

    while ((match = importRegex.exec(source)) !== null) {
      imports.add(match[1])
    }
    while ((match = requireRegex.exec(source)) !== null) {
      imports.add(match[1])
    }
    while ((match = dynamicImportRegex.exec(source)) !== null) {
      imports.add(match[1])
    }
    while ((match = reExportRegex.exec(source)) !== null) {
      imports.add(match[1])
    }

    const allowed: string[] = []
    const disallowed: string[] = []
    const errors: Array<{ module: string; message: string }> = []

    for (const module of imports) {
      if (this.isAllowedModule(module)) {
        allowed.push(module)
      } else {
        disallowed.push(module)
        errors.push({
          module,
          message: `Module "${module}" is not available in widget sandbox. Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`
        })
      }
    }

    return {
      valid: disallowed.length === 0,
      allowedImports: allowed,
      disallowedImports: disallowed,
      errors
    }
  }

  /**
   * Compile TypeScript/JavaScript widget source
   */
  async compile(
    source: WidgetSource,
    context: WidgetCompilationContext
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
          timestamp: Date.now()
        })
      })

      plugin.logger.error(
        `[WidgetScriptProcessor] Dependency validation failed for widget "${source.widgetId}":`,
        validation.errors
      )

      return null
    }

    try {
      // Step 2: Determine loader based on extension
      const ext = path.extname(source.filePath).toLowerCase()
      const loader: 'ts' | 'js' = ext === '.ts' ? 'ts' : 'js'

      // Step 3: Transform with esbuild
      const transformed = await transform(source.source, {
        loader,
        format: 'cjs',
        target: 'node18'
      })

      // Step 4: Wrap for module export
      const wrappedCode = `
${transformed.code}
// Export default component
const __component = exports.default || module.exports || {}
module.exports = __component
`

      plugin.logger.info(
        `[WidgetScriptProcessor] Successfully compiled widget "${source.widgetId}"`
      )

      return {
        code: wrappedCode,
        styles: '',
        dependencies: validation.allowedImports
      }
    } catch (error) {
      plugin.logger.error(
        `[WidgetScriptProcessor] Compilation failed for widget "${source.widgetId}":`,
        error as Error
      )

      plugin.issues.push({
        type: 'error',
        code: 'WIDGET_COMPILE_FAILED',
        message: `Failed to compile script widget: ${(error as Error).message}`,
        source: `feature:${feature.id}`,
        meta: { error: (error as Error).stack },
        timestamp: Date.now()
      })

      return null
    }
  }

  /**
   * Check if a module is allowed in the widget sandbox
   */
  private isAllowedModule(module: string): boolean {
    if (module.startsWith('.') || module.startsWith('/')) {
      return false
    }

    return ALLOWED_PACKAGES.some((pkg) => module === pkg || module.startsWith(`${pkg}/`))
  }
}
