/**
 * TSX/JSX Widget Processor
 *
 * Compiles TSX and JSX widgets for plugin use.
 * Supports React-style components with full TypeScript support.
 */

import { transform } from 'esbuild'
import type {
  CompiledWidget,
  DependencyValidationResult,
  IWidgetProcessor,
  WidgetCompilationContext
} from '../widget-processor'
import type { WidgetSource } from '../widget-loader'
import path from 'node:path'

/**
 * Allowed packages in widget sandbox
 */
const ALLOWED_PACKAGES = [
  'vue',
  'react',
  'react-dom',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/channel',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types'
] as const

/**
 * TSX/JSX Widget Processor
 *
 * Handles .tsx and .jsx widget files
 */
export class WidgetTsxProcessor implements IWidgetProcessor {
  readonly supportedExtensions = ['.tsx', '.jsx']

  /**
   * Validate dependencies used in the widget source
   */
  validateDependencies(source: string): DependencyValidationResult {
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g
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
   * Compile TSX/JSX widget source
   */
  async compile(
    source: WidgetSource,
    context: WidgetCompilationContext
  ): Promise<CompiledWidget | null> {
    const { plugin, feature } = context

    // Step 1: Validate dependencies
    const validation = this.validateDependencies(source.source)

    if (!validation.valid) {
      validation.errors.forEach(err => {
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
        `[WidgetTsxProcessor] Dependency validation failed for widget "${source.widgetId}":`,
        validation.errors
      )

      return null
    }

    try {
      // Step 2: Determine loader based on extension
      const ext = path.extname(source.filePath).toLowerCase()
      const loader: 'tsx' | 'jsx' = ext === '.tsx' ? 'tsx' : 'jsx'

      // Step 3: Transform with esbuild
      const transformed = await transform(source.source, {
        loader,
        format: 'cjs',
        target: 'node18',
        jsxFactory: 'h',
        jsxFragment: 'Fragment'
      })

      // Step 4: Wrap for module export
      const wrappedCode = `
${transformed.code}
// Export default component
const __component = exports.default || module.exports || {}
module.exports = __component
`

      plugin.logger.info(
        `[WidgetTsxProcessor] Successfully compiled widget "${source.widgetId}"`
      )

      return {
        code: wrappedCode,
        styles: '', // TSX doesn't have embedded styles like Vue SFC
        dependencies: validation.allowedImports
      }
    } catch (error) {
      plugin.logger.error(
        `[WidgetTsxProcessor] Compilation failed for widget "${source.widgetId}":`,
        error as Error
      )

      plugin.issues.push({
        type: 'error',
        code: 'WIDGET_COMPILE_FAILED',
        message: `Failed to compile TSX/JSX widget: ${(error as Error).message}`,
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

    return ALLOWED_PACKAGES.some(
      pkg => module === pkg || module.startsWith(`${pkg}/`)
    )
  }
}
