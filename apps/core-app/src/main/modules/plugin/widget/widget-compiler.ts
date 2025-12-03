import path from 'node:path'
import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from './widget-loader'
import { WidgetVueProcessor } from './processors/vue-processor'
import { widgetProcessorRegistry } from './widget-processor'
import type { CompiledWidget, WidgetCompilationContext } from './widget-processor'

// Register default processors
widgetProcessorRegistry.register(new WidgetVueProcessor())

/**
 * Legacy interface for backward compatibility
 * 向后兼容的遗留接口
 * @deprecated Use the processor-based compile function instead
 */
interface LegacyCompiledWidget {
  code: string
  styles: string
}

/**
 * Compile widget source using the processor registry
 * 使用处理器注册表编译 widget 源码
 * @param source - Widget source information
 * @param context - Compilation context (plugin and feature)
 * @returns Compiled widget or null on failure
 */
export async function compileWidgetSource(
  source: WidgetSource,
  context: WidgetCompilationContext,
): Promise<CompiledWidget | null> {
  const ext = path.extname(source.filePath)

  const processor = widgetProcessorRegistry.getProcessor(ext)

  if (!processor) {
    context.plugin.issues.push({
      type: 'error',
      code: 'WIDGET_UNSUPPORTED_TYPE',
      message: `Unsupported widget file type: ${ext}`,
      source: `feature:${context.feature.id}`,
      suggestion: `Supported extensions: ${widgetProcessorRegistry.getSupportedExtensions().join(', ')}`,
      timestamp: Date.now(),
    })

    context.plugin.logger.error(
      `[WidgetCompiler] Unsupported file type "${ext}" for widget "${source.widgetId}"`,
    )

    return null
  }

  return await processor.compile(source, context)
}

/**
 * Legacy compile function for backward compatibility
 * 向后兼容的编译函数
 * @deprecated This function is kept for backward compatibility only.
 * Use compileWidgetSource with WidgetCompilationContext instead.
 */
export async function compileWidgetSourceLegacy(
  source: WidgetSource,
  plugin: ITouchPlugin,
  feature: IPluginFeature,
): Promise<LegacyCompiledWidget | null> {
  const context: WidgetCompilationContext = {
    plugin,
    feature,
    allowedModules: new Map(),
  }

  const result = await compileWidgetSource(source, context)

  if (!result) {
    return null
  }

  // Convert to legacy format (without dependencies)
  return {
    code: result.code,
    styles: result.styles,
  }
}

export type { CompiledWidget }
export { widgetProcessorRegistry }
