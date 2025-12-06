import type { IPluginFeature, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { WidgetSource } from './widget-loader'

/**
 * Compiled widget result
 * 编译后的 widget 结果
 */
export interface CompiledWidget {
  /** Compiled JavaScript code | 编译后的 JavaScript 代码 */
  code: string
  /** Extracted CSS styles | 提取的 CSS 样式 */
  styles: string
  /** List of allowed dependencies | 允许的依赖列表 */
  dependencies: string[]
}

/**
 * Widget compilation context
 * Widget 编译上下文
 */
export interface WidgetCompilationContext {
  /** Plugin instance | 插件实例 */
  plugin: ITouchPlugin
  /** Feature definition | Feature 定义 */
  feature: IPluginFeature
  /** Allowed modules for sandbox | 沙箱允许的模块 */
  allowedModules: Map<string, any>
}

/**
 * Dependency validation result
 * 依赖验证结果
 */
export interface DependencyValidationResult {
  /** Whether all dependencies are valid | 是否所有依赖都有效 */
  valid: boolean
  /** List of allowed imports | 允许的导入列表 */
  allowedImports: string[]
  /** List of disallowed imports | 不允许的导入列表 */
  disallowedImports: string[]
  /** Validation errors | 验证错误 */
  errors: Array<{ module: string, message: string }>
}

/**
 * Widget processor interface for different file types
 * 用于不同文件类型的 Widget 处理器接口
 */
export interface IWidgetProcessor {
  /**
   * Get supported file extensions (e.g., ['.vue', '.tsx'])
   * 获取支持的文件扩展名 (例如: ['.vue', '.tsx'])
   */
  readonly supportedExtensions: string[]

  /**
   * Compile widget source to executable code
   * 编译 widget 源码为可执行代码
   * @param source - Widget source information
   * @param context - Compilation context
   * @returns Compiled widget or null on failure
   */
  compile(
    source: WidgetSource,
    context: WidgetCompilationContext,
  ): Promise<CompiledWidget | null>

  /**
   * Validate dependencies used in the widget
   * 验证 widget 中使用的依赖
   * @param source - Widget source code
   * @returns Validation result with allowed/disallowed imports
   */
  validateDependencies(source: string): DependencyValidationResult
}

/**
 * Widget processor registry
 * Widget 处理器注册表
 */
export class WidgetProcessorRegistry {
  private processors = new Map<string, IWidgetProcessor>()

  /**
   * Register a processor for specific file extensions
   * 为特定文件扩展名注册处理器
   * @param processor - The processor to register
   */
  register(processor: IWidgetProcessor): void {
    processor.supportedExtensions.forEach((ext) => {
      // Normalize extension to include leading dot
      const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
      if (this.processors.has(normalizedExt)) {
        throw new Error(
          `Widget processor conflict: Extension '${normalizedExt}' is already registered`
        )
      }
      this.processors.set(normalizedExt, processor)
    })
  }

  /**
   * Get processor for a file extension
   * 获取文件扩展名对应的处理器
   * @param extension - File extension (with or without leading dot)
   * @returns The processor or null if not found
   */
  getProcessor(extension: string): IWidgetProcessor | null {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`
    return this.processors.get(normalizedExt) || null
  }

  /**
   * Check if an extension is supported
   * 检查扩展名是否被支持
   * @param extension - File extension to check
   * @returns True if supported
   */
  isSupported(extension: string): boolean {
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`
    return this.processors.has(normalizedExt)
  }

  /**
   * Get all supported extensions
   * 获取所有支持的扩展名
   * @returns Array of supported extensions
   */
  getSupportedExtensions(): string[] {
    return Array.from(this.processors.keys())
  }
}

/**
 * Global widget processor registry instance
 * 全局 widget 处理器注册表实例
 */
export const widgetProcessorRegistry = new WidgetProcessorRegistry()
