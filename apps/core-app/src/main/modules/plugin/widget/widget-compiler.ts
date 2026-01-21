import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from './widget-loader'
import type { CompiledWidget, WidgetCompilationContext } from './widget-processor'
import path from 'node:path'
import { WidgetScriptProcessor } from './processors/script-processor'
import { WidgetTsxProcessor } from './processors/tsx-processor'
import { WidgetVueProcessor } from './processors/vue-processor'
import { widgetProcessorRegistry } from './widget-processor'

// Register default processors
widgetProcessorRegistry.register(new WidgetVueProcessor())
widgetProcessorRegistry.register(new WidgetTsxProcessor())
widgetProcessorRegistry.register(new WidgetScriptProcessor())

/**
 * Compile widget source using the processor registry
 * 使用处理器注册表编译 widget 源码
 * @param source - Widget source information
 * @param context - Compilation context (plugin and feature)
 * @returns Compiled widget or null on failure
 */
export async function compileWidgetSource(
  source: WidgetSource,
  context: WidgetCompilationContext
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
      timestamp: Date.now()
    })

    context.plugin.logger.error(
      `[WidgetCompiler] Unsupported file type "${ext}" for widget "${source.widgetId}"`
    )

    return null
  }

  return await processor.compile(source, context)
}

export type { CompiledWidget }
export { widgetProcessorRegistry }
