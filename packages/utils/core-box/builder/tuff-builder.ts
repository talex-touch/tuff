/**
 * TUFF Builder: Typed Unified Flex Format 构建工具
 * 提供便捷的 TuffItem 创建和管理工具
 *
 * @description
 * 这个模块提供了一套高效的工具，用于创建和管理 TuffItem 对象。
 * 它结合了 Builder 模式和工厂方法，既保证了 API 的流畅性，又确保了性能。
 *
 * @design 设计理念：
 * - 流畅的 API：支持链式调用，简化创建过程
 * - 性能优化：最小化中间对象创建，适合大量对象场景
 * - 类型安全：完整的 TypeScript 类型支持
 * - 便捷工厂：针对常见场景提供快捷创建方法
 *
 * @version 2.0.0
 * @module core-box/tuff-builder
 */

import type {
  IProviderActivate,
  TuffAction,
  TuffActionType,
  TuffBasicRender,
  TuffContext,
  TuffCustomRender,
  TuffIcon,
  TuffItem,
  TuffItemKind,
  TuffLayout,
  TuffMeta,
  TuffPermissionLevel,
  TuffPreview,
  TuffQuery,
  TuffRender,
  TuffRenderMode,
  TuffScoring,
  TuffSearchResult,
  TuffSource,
  TuffSourceType,
  TuffTag,
} from '../tuff/tuff-dsl'

// ==================== Builder 类 ====================

/**
 * TuffItemBuilder - TuffItem 构建器
 *
 * @description
 * 使用 Builder 模式实现的 TuffItem 构建器，支持链式调用。
 * 提供流畅的 API 用于创建和配置 TuffItem 对象。
 *
 * @example
 * ```typescript
 * const item = new TuffItemBuilder()
 *   .setSource('plugin', 'my-plugin')
 *   .setTitle('我的项目')
 *   .setIcon('🚀')
 *   .createAndAddAction('open', 'open', '打开')
 *   .build();
 * ```
 */
class TuffItemBuilder {
  private item: Partial<TuffItem> = {}
  private basicRender: Partial<TuffBasicRender> = {}
  private customRender: Partial<TuffCustomRender> | null = null
  private renderMode: TuffRenderMode = 'default'
  private layout: Partial<TuffLayout> | null = null
  private preview: Partial<TuffPreview> | null = null
  private renderStyle: Record<string, string> | null = null
  private renderClassName: string | null = null
  private scoring: Partial<TuffScoring> = {}

  /**
   * 创建一个新的 TuffItemBuilder 实例
   *
   * @param id - 项目 ID
   * @param sourceType - 可选的来源类型
   * @param sourceId - 可选的来源 ID
   */
  constructor(id: string, sourceType?: TuffSourceType, sourceId?: string) {
    this.item.id = id
    if (sourceType && sourceId) {
      this.item.source = {
        type: sourceType,
        id: sourceId,
      }
    }
  }

  /**
   * 设置项目 ID
   *
   * @param id - 项目唯一标识符
   * @returns 当前构建器实例，用于链式调用
   */
  setId(id: string): TuffItemBuilder {
    this.item.id = id
    return this
  }

  /**
   * 设置数据来源
   *
   * @param type - 来源类型
   * @param id - 来源标识符
   * @param name - 可选的来源名称
   * @param version - 可选的来源版本
   * @param permission - 可选的权限级别
   * @returns 当前构建器实例，用于链式调用
   */
  setSource(
    type: TuffSourceType,
    id: string,
    name?: string,
    version?: string,
    permission?: TuffPermissionLevel,
  ): TuffItemBuilder {
    this.item.source = { type, id }

    if (name)
      this.item.source.name = name
    if (version)
      this.item.source.version = version
    if (permission)
      this.item.source.permission = permission

    return this
  }

  /**
   * 设置项目类型
   *
   * @param kind - 项目类型
   * @returns 当前构建器实例，用于链式调用
   */
  setKind(kind: TuffItemKind): TuffItemBuilder {
    this.item.kind = kind
    return this
  }

  /**
   * 设置项目标题
   *
   * @param title - 项目标题
   * @returns 当前构建器实例，用于链式调用
   */
  setTitle(title: string): TuffItemBuilder {
    this.basicRender.title = title
    return this
  }

  /**
   * 设置项目副标题
   *
   * @param subtitle - 项目副标题
   * @returns 当前构建器实例，用于链式调用
   */
  setSubtitle(subtitle: string): this {
    this.basicRender.subtitle = subtitle
    return this
  }

  /**
   * 设置项目描述
   *
   * @param description - 项目详细描述
   * @returns 当前构建器实例，用于链式调用
   */
  setDescription(description: string): this {
    this.basicRender.description = description
    return this
  }

  /**
   * 设置项目图标
   *
   * @param icon - 项目图标
   * @returns 当前构建器实例，用于链式调用
   */
  setIcon(icon: TuffIcon): this {
    this.basicRender.icon = icon
    return this
  }

  /**
   * 添加标签
   *
   * @param tag - 要添加的标签
   * @returns 当前构建器实例，用于链式调用
   */
  addTag(tag: TuffTag): this {
    if (!this.basicRender.tags) {
      this.basicRender.tags = []
    }
    this.basicRender.tags.push(tag)
    return this
  }

  /**
   * 设置标签列表
   *
   * @param tags - 标签列表
   * @returns 当前构建器实例，用于链式调用
   */
  setTags(tags: TuffTag[]): this {
    this.basicRender.tags = tags
    return this
  }

  /**
   * 设置右侧附加信息
   *
   * @param accessory - 右侧附加信息
   * @returns 当前构建器实例，用于链式调用
   */
  setAccessory(accessory: string): this {
    this.basicRender.accessory = accessory
    return this
  }

  /**
   * 设置渲染模式
   *
   * @param mode - 渲染模式
   * @returns 当前构建器实例，用于链式调用
   */
  setRenderMode(mode: TuffRenderMode): this {
    this.renderMode = mode
    return this
  }

  /**
   * 设置自定义渲染内容
   *
   * @param type - 渲染类型
   * @param content - 渲染内容
   * @param data - 可选的渲染数据
   * @param styles - 可选的样式资源
   * @param scripts - 可选的脚本资源
   * @returns 当前构建器实例，用于链式调用
   */
  setCustomRender(
    type: 'html' | 'vue' | 'react' | 'markdown',
    content: string,
    data?: Record<string, any>,
    styles?: string[],
    scripts?: string[],
  ): this {
    this.renderMode = 'custom'
    this.customRender = { type, content }

    if (data)
      this.customRender.data = data
    if (styles)
      this.customRender.styles = styles
    if (scripts)
      this.customRender.scripts = scripts

    return this
  }

  /**
   * 设置布局配置
   *
   * @param display - 展示方式
   * @param size - 可选的尺寸配置
   * @param align - 可选的对齐方式
   * @returns 当前构建器实例，用于链式调用
   */
  setLayout(
    display: 'list' | 'card' | 'grid' | 'compact' | 'detailed',
    size?: 'small' | 'medium' | 'large',
    align?: 'left' | 'center' | 'right',
  ): this {
    this.layout = { display }

    if (size)
      this.layout.size = size
    if (align)
      this.layout.align = align

    return this
  }

  /**
   * 设置网格布局配置
   *
   * @param columns - 列数
   * @param gap - 间距
   * @returns 当前构建器实例，用于链式调用
   */
  setGridLayout(columns: number, gap?: number): this {
    if (!this.layout) {
      this.layout = { display: 'grid' }
    }
    else {
      this.layout.display = 'grid'
    }

    if (!this.layout.grid) {
      this.layout.grid = {}
    }

    this.layout.grid.columns = columns
    if (gap !== undefined)
      this.layout.grid.gap = gap

    return this
  }

  /**
   * 设置预览配置
   *
   * @param type - 预览类型
   * @param title - 可选的预览标题
   * @param content - 可选的预览内容
   * @param image - 可选的预览图片
   * @param lazy - 可选的懒加载配置
   * @returns 当前构建器实例，用于链式调用
   */
  setPreview(
    type: 'tooltip' | 'panel' | 'modal',
    title?: string,
    content?: string,
    image?: string,
    lazy?: boolean,
  ): this {
    this.preview = { type }

    if (title)
      this.preview.title = title
    if (content)
      this.preview.content = content
    if (image)
      this.preview.image = image
    if (lazy !== undefined)
      this.preview.lazy = lazy

    return this
  }

  /**
   * 设置自定义预览组件
   *
   * @param customRender - 自定义预览渲染配置
   * @returns 当前构建器实例，用于链式调用
   */
  setPreviewComponent(customRender: TuffCustomRender): this {
    if (!this.preview) {
      this.preview = { type: 'panel' }
    }

    this.preview.component = customRender
    return this
  }

  /**
   * 设置渲染样式类名
   *
   * @param className - CSS 类名
   * @returns 当前构建器实例，用于链式调用
   */
  setClassName(className: string): this {
    this.renderClassName = className
    return this
  }

  /**
   * 设置渲染内联样式
   *
   * @param style - 内联样式对象
   * @returns 当前构建器实例，用于链式调用
   */
  setStyle(style: Record<string, string>): this {
    this.renderStyle = style
    return this
  }

  /**
   * 添加行为
   *
   * @param action - 要添加的行为
   * @returns 当前构建器实例，用于链式调用
   */
  addAction(action: TuffAction): this {
    if (!this.item.actions) {
      this.item.actions = []
    }
    this.item.actions.push(action)
    return this
  }

  /**
   * 设置行为列表
   *
   * @param actions - 行为列表
   * @returns 当前构建器实例，用于链式调用
   */
  setActions(actions: TuffAction[]): this {
    this.item.actions = actions
    return this
  }

  /**
   * 创建并添加一个行为
   *
   * @description 便捷方法，用于快速创建并添加一个行为。
   * 如果这是第一个被添加的行为，它将被自动设为主要行为 (primary: true)。
   *
   * @param id - 行为 ID
   * @param type - 行为类型
   * @param label - 行为标签
   * @param payload - 可选的行为参数
   * @returns 当前构建器实例，用于链式调用
   */
  createAndAddAction(
    id: string,
    type: TuffActionType,
    label: string,
    payload?: any,
  ): this {
    const isFirstAction = !this.item.actions || this.item.actions.length === 0

    const action = TuffUtils.createAction(
      id,
      type,
      label,
      isFirstAction, // Set primary to true if it's the first action
      payload,
    )

    return this.addAction(action)
  }

  /**
   * 设置评分信息
   *
   * @param scoring - 评分信息
   * @returns 当前构建器实例，用于链式调用
   */
  setScoring(scoring: TuffScoring): this {
    this.item.scoring = scoring
    return this
  }

  /**
   * 设置项目的最终分数
   *
   * @param score - 最终分数值 (0-1之间)
   * @returns 当前构建器实例，用于链式调用
   */
  setFinalScore(score: number): this {
    if (score < 0 || score > 1) {
      throw new Error('Score must be between 0 and 1')
    }
    this.scoring.final = score
    return this
  }

  /**
   * 设置上下文信息
   *
   * @param context - 上下文信息
   * @returns 当前构建器实例，用于链式调用
   */
  setContext(context: TuffContext): this {
    this.item.context = context
    return this
  }

  /**
   * 设置元数据
   *
   * @param meta - 元数据
   * @returns 当前构建器实例，用于链式调用
   */
  setMeta(meta: TuffMeta): this {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  /**
   * 构建 TuffItem 对象
   *
   * @returns 构建好的 TuffItem 对象
   * @throws 如果缺少必要的属性（id, source 或 render.basic.title）
   */
  build(): TuffItem {
    // 检查并自动生成 ID
    if (!this.item.id) {
      // this.item.id = TuffUtils.generateId();
      throw new Error('TuffItem 必须设置 id 属性')
    }

    // 检查必要属性
    if (!this.item.source) {
      throw new Error('TuffItem 必须设置 source 属性')
    }

    // 构建渲染配置
    const render: TuffRender = {
      mode: this.renderMode,
    }

    // 根据渲染模式设置相应的渲染配置
    if (this.renderMode === 'default' || this.renderMode === 'rich' || this.renderMode === 'card') {
      if (!this.basicRender.title) {
        throw new Error('默认渲染模式下 TuffItem 必须设置 title 属性')
      }
      render.basic = this.basicRender as TuffBasicRender
    }
    else if (this.renderMode === 'custom') {
      if (!this.customRender) {
        throw new Error('自定义渲染模式下必须设置 customRender 属性')
      }
      render.custom = this.customRender as TuffCustomRender
    }

    // 设置其他渲染属性
    if (this.layout)
      render.layout = this.layout as TuffLayout
    if (this.preview)
      render.preview = this.preview as TuffPreview
    if (this.renderClassName)
      render.className = this.renderClassName
    if (this.renderStyle)
      render.style = this.renderStyle

    // 设置渲染配置
    this.item.render = render

    // 设置评分信息
    if (Object.keys(this.scoring).length > 0) {
      this.item.scoring = this.scoring as TuffScoring
    }

    // 返回完整的 TuffItem
    return this.item as TuffItem
  }
}

// ==================== Fluent Builder ====================

/**
 * A fluent builder for creating TuffSearchResult objects.
 */
class TuffSearchResultBuilder {
  private readonly result: TuffSearchResult

  constructor(query: TuffQuery) {
    this.result = {
      query,
      items: [],
      duration: 0,
      sources: [],
      activate: [],
    }
  }

  public setItems(items: TuffItem[]): this {
    this.result.items = items
    return this
  }

  public setDuration(duration: number): this {
    this.result.duration = duration
    return this
  }

  public setActivate(activate: IProviderActivate[]): this {
    this.result.activate = activate
    return this
  }

  public setSources(sources: TuffSearchResult['sources']): this {
    this.result.sources = sources
    return this
  }

  public setSortStats(stats: any[]): this {
    this.result.sort_stats = stats
    return this
  }

  public build(): TuffSearchResult {
    return this.result
  }
}

// ==================== 工厂方法 ====================

/**
 * Factory for creating TUFF objects using a fluent builder pattern.
 */
class TuffFactory {
  /**
   * 创建基本项目
   *
   * @param title - 项目标题
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @param kind - 可选的项目类型
   * @returns 创建的 TuffItem 对象
   */
  static createBasicItem(
    title: string,
    sourceType: TuffSourceType,
    sourceId: string,
    kind?: TuffItemKind,
  ): TuffItem {
    const builder = new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)

    if (kind)
      builder.setKind(kind)

    return builder.build()
  }

  /**
   * 创建系统项目
   *
   * @param title - 项目标题
   * @param id - 系统项目标识符
   * @param kind - 可选的项目类型
   * @returns 创建的 TuffItem 对象
   */
  static createSystemItem(
    title: string,
    id: string,
    kind?: TuffItemKind,
  ): TuffItem {
    return TuffFactory.createBasicItem(title, 'system', id, kind)
  }

  /**
   * 创建插件项目
   *
   * @param title - 项目标题
   * @param pluginId - 插件标识符
   * @param kind - 可选的项目类型
   * @returns 创建的 TuffItem 对象
   */
  static createPluginItem(
    title: string,
    pluginId: string,
    kind?: TuffItemKind,
  ): TuffItem {
    return TuffFactory.createBasicItem(title, 'plugin', pluginId, kind)
  }

  /**
   * 创建 AI 推荐项目
   *
   * @param title - 项目标题
   * @param aiSourceId - AI 来源标识符
   * @param kind - 可选的项目类型
   * @returns 创建的 TuffItem 对象
   */
  static createAIItem(
    title: string,
    aiSourceId: string,
    kind?: TuffItemKind,
  ): TuffItem {
    return TuffFactory.createBasicItem(title, 'ai', aiSourceId, kind)
  }

  /**
   * 创建文件项目
   *
   * @param title - 文件名称
   * @param path - 文件路径
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createFileItem(
    title: string,
    path: string,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('file')
      .setMeta({
        file: {
          path,
        },
      })
      .createAndAddAction('open', 'open', '打开')
      .build()
  }

  /**
   * 创建文件夹项目
   *
   * @param title - 文件夹名称
   * @param path - 文件夹路径
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createFolderItem(
    title: string,
    path: string,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('folder')
      .setMeta({
        file: {
          path,
        },
      })
      .createAndAddAction('open', 'open', '打开')
      .build()
  }

  /**
   * 创建链接项目
   *
   * @param title - 链接标题
   * @param url - 链接地址
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createUrlItem(
    title: string,
    url: string,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('url')
      .setMeta({
        web: {
          url,
        },
      })
      .createAndAddAction('open', 'open', '打开')
      .build()
  }

  /**
   * 创建应用项目
   *
   * @param title - 应用名称
   * @param path - 应用路径
   * @param bundleId - 应用包标识符
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createAppItem(
    title: string,
    path: string,
    bundleId: string,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('app')
      .setMeta({
        app: {
          path,
          bundleId,
        },
      })
      .createAndAddAction('execute', 'execute', '启动')
      .build()
  }

  /**
   * 创建命令项目
   *
   * @param title - 命令标题
   * @param command - 命令内容
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createCommandItem(
    title: string,
    command: string,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('command')
      .createAndAddAction('execute', 'execute', '执行', { command })
      .build()
  }

  /**
   * 创建操作项目
   *
   * @param title - 操作标题
   * @param action - 操作对象
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象
   */
  static createActionItem(
    title: string,
    action: TuffAction,
    sourceType: TuffSourceType,
    sourceId: string,
  ): TuffItem {
    return new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)
      .setTitle(title)
      .setKind('action')
      .addAction(action)
      .build()
  }

  public static createSearchResult(query: TuffQuery): TuffSearchResultBuilder {
    return new TuffSearchResultBuilder(query)
  }
}

// ==================== 批量创建工具 ====================

/**
 * TuffListBuilder - TuffItem 列表构建器
 *
 * @description
 * 用于高效地批量创建 TuffItem 对象，适用于需要创建大量相似项目的场景。
 * 通过共享配置和独立的自定义函数，简化了批量创建的过程。
 *
 * @example
 * ```typescript
 * const items = new TuffListBuilder('plugin', 'my-plugin')
 *   .setSharedKind('file')
 *   .addSharedAction({ id: 'open', type: 'open', label: '打开' })
 *   .addItem(builder => {
 *     builder.setTitle('文件 A').setMeta({ file: { path: '/path/a' } });
 *   })
 *   .addItemsFromData([{ name: '文件 B', path: '/path/b' }], (builder, data) => {
 *     builder.setTitle(data.name).setMeta({ file: { path: data.path } });
 *   })
 *   .build();
 * ```
 */
class TuffListBuilder {
  private items: TuffItem[] = []
  private sharedSource: TuffSource
  private sharedKind?: TuffItemKind
  private sharedActions: TuffAction[] = []

  /**
   * 创建一个新的列表构建器
   *
   * @param sourceType - 共享的来源类型
   * @param sourceId - 共享的来源标识符
   */
  constructor(sourceType: TuffSourceType, sourceId: string) {
    this.sharedSource = { type: sourceType, id: sourceId }
  }

  /**
   * 设置共享的项目类型
   *
   * @param kind - 项目类型
   * @returns 当前列表构建器实例，用于链式调用
   */
  setSharedKind(kind: TuffItemKind): TuffListBuilder {
    this.sharedKind = kind
    return this
  }

  /**
   * 添加共享的行为
   *
   * @param action - 要添加的共享行为
   * @returns 当前列表构建器实例，用于链式调用
   */
  addSharedAction(action: TuffAction): TuffListBuilder {
    this.sharedActions.push(action)
    return this
  }

  /**
   * 添加一个项目
   *
   * @param customize - 一个函数，接收 TuffItemBuilder 实例用于配置单个项目
   * @returns 当前列表构建器实例，用于链式调用
   */
  addItem(customize: (builder: TuffItemBuilder) => void): TuffListBuilder {
    const builder = new TuffItemBuilder(TuffUtils.generateId())
      .setSource(this.sharedSource.type, this.sharedSource.id)

    // 应用共享配置
    if (this.sharedKind) {
      builder.setKind(this.sharedKind)
    }
    if (this.sharedActions.length > 0) {
      // 克隆共享操作以避免交叉污染
      builder.setActions(JSON.parse(JSON.stringify(this.sharedActions)))
    }

    // 应用自定义配置
    customize(builder)

    try {
      this.items.push(builder.build())
    }
    catch (error) {
      console.error('构建 TuffItem 失败:', error)
    }

    return this
  }

  /**
   * 从数据对象数组批量创建项目
   *
   * @param dataItems - 数据对象数组
   * @param customize - 一个函数，接收 TuffItemBuilder 实例和当前数据对象用于配置项目
   * @returns 当前列表构建器实例，用于链式调用
   */
  addItemsFromData<T>(
    dataItems: T[],
    customize: (builder: TuffItemBuilder, dataItem: T) => void,
  ): TuffListBuilder {
    for (const dataItem of dataItems) {
      this.addItem(builder => customize(builder, dataItem))
    }
    return this
  }

  /**
   * 构建并返回所有创建的项目
   *
   * @returns 创建的 TuffItem 对象数组
   */
  build(): TuffItem[] {
    return this.items
  }

  /**
   * 清空已创建的项目列表
   *
   * @returns 当前列表构建器实例，用于链式调用
   */
  clear(): TuffListBuilder {
    this.items = []
    return this
  }
}

// ==================== 工具函数 ====================

/**
 * TuffUtils - 实用工具函数集合
 *
 * @description
 * 提供一系列实用函数，用于处理和转换 TuffItem 对象。
 */
class TuffUtils {
  /**
   * 生成一个全局唯一的 ID
   *
   * @description
   * 结合了时间戳和随机数，确保在高并发场景下也能保持唯一性。
   * 格式: tuff_[timestamp]_[random1]_[random2]
   *
   * @returns {string} 生成的唯一 ID
   */
  static generateId(): string {
    return `tuff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${Math.random().toString(36).substring(2, 5)}`
  }

  /**
   * 创建图标对象
   *
   * @param value - 图标值 (emoji, URL, base64, etc.)
   * @param type - 图标类型
   * @returns {TuffIcon} 创建的图标对象
   */
  static createIcon(value: string, type: 'emoji' | 'url' | 'file' = 'emoji'): TuffIcon {
    return {
      type,
      value,
    }
  }

  /**
   * 创建标签对象
   *
   * @param text - 标签文本
   * @param color - 可选的标签颜色
   * @param variant - 可选的标签样式
   * @returns 创建的标签对象
   */
  static createTag(text: string, color?: string, variant?: 'filled' | 'outlined' | 'ghost'): TuffTag {
    const tag: TuffTag = { text }
    if (color)
      tag.color = color
    if (variant)
      tag.variant = variant
    return tag
  }

  /**
   * 创建简单的行为对象
   *
   * @param id - 行为 ID
   * @param type - 行为类型
   * @param label - 行为标签
   * @param primary - 是否为主要行为
   * @param payload - 可选的行为参数
   * @returns 创建的行为对象
   */
  static createAction(
    id: string,
    type: TuffActionType,
    label: string,
    primary: boolean = false,
    payload?: any,
  ): TuffAction {
    const action: TuffAction = { id, type, label, primary }
    if (payload)
      action.payload = payload
    return action
  }

  /**
   * 过滤项目列表
   *
   * @param items - 项目列表
   * @param predicate - 过滤函数
   * @returns 过滤后的项目列表
   */
  static filterItems(items: TuffItem[], predicate: (item: TuffItem) => boolean): TuffItem[] {
    return items.filter(predicate)
  }

  /**
   * 按类型过滤项目
   *
   * @param items - 项目列表
   * @param kind - 项目类型
   * @returns 过滤后的项目列表
   */
  static filterByKind(items: TuffItem[], kind: TuffItemKind): TuffItem[] {
    return TuffUtils.filterItems(items, item => item.kind === kind)
  }

  /**
   * 按来源过滤项目
   *
   * @param items - 项目列表
   * @param sourceType - 来源类型
   * @returns 过滤后的项目列表
   */
  static filterBySourceType(items: TuffItem[], sourceType: TuffSourceType): TuffItem[] {
    return TuffUtils.filterItems(items, item => item.source.type === sourceType)
  }

  /**
   * 按标题搜索项目
   *
   * @param items - 项目列表
   * @param query - 搜索关键词
   * @param caseSensitive - 是否区分大小写
   * @returns 匹配的项目列表
   */
  static searchByTitle(items: TuffItem[], query: string, caseSensitive: boolean = false): TuffItem[] {
    const normalizedQuery = caseSensitive ? query : query.toLowerCase()
    return TuffUtils.filterItems(items, (item) => {
      const title = item.render.basic?.title
      if (!title)
        return false
      const normalizedTitle = caseSensitive ? title : title.toLowerCase()
      return normalizedTitle.includes(normalizedQuery)
    })
  }

  /**
   * 按评分排序项目
   *
   * @param items - 项目列表
   * @param ascending - 是否升序排列
   * @returns 排序后的项目列表
   */
  static sortByScore(items: TuffItem[], ascending: boolean = false): TuffItem[] {
    return [...items].sort((a, b) => {
      const scoreA = a.scoring?.final ?? a.scoring?.base ?? 0
      const scoreB = b.scoring?.final ?? b.scoring?.base ?? 0
      return ascending ? scoreA - scoreB : scoreB - scoreA
    })
  }

  /**
   * 按标题排序项目
   *
   * @param items - 项目列表
   * @param ascending - 是否升序排列
   * @returns 排序后的项目列表
   */
  static sortByTitle(items: TuffItem[], ascending: boolean = true): TuffItem[] {
    return [...items].sort((a, b) => {
      const titleA = a.render.basic?.title ?? ''
      const titleB = b.render.basic?.title ?? ''
      return ascending
        ? titleA.localeCompare(titleB)
        : titleB.localeCompare(titleA)
    })
  }

  /**
   * 将普通对象转换为 TuffItem
   *
   * @param obj - 普通对象
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 转换后的 TuffItem 对象
   */
  static fromObject(obj: any, sourceType: TuffSourceType, sourceId: string): TuffItem {
    const builder = new TuffItemBuilder(TuffUtils.generateId())
      .setSource(sourceType, sourceId)

    // 尝试提取标题
    if (obj.title || obj.name || obj.label) {
      builder.setTitle(obj.title || obj.name || obj.label)
    }
    else {
      builder.setTitle(String(obj))
    }

    // 尝试提取描述
    if (obj.description || obj.desc) {
      builder.setDescription(obj.description || obj.desc)
    }

    // 尝试提取图标
    if (obj.icon) {
      builder.setIcon(obj.icon)
    }

    // 尝试提取类型
    if (obj.kind || obj.type) {
      const kind = obj.kind || obj.type
      builder.setKind(kind as TuffItemKind)
    }

    // 尝试提取分数
    if (obj.score !== undefined) {
      builder.setFinalScore(obj.score)
    }

    // 保存原始数据
    builder.setMeta({ raw: obj })

    return builder.build()
  }

  /**
   * 从对象数组批量创建 TuffItem
   *
   * @param objects - 对象数组
   * @param sourceType - 来源类型
   * @param sourceId - 来源标识符
   * @returns 创建的 TuffItem 对象数组
   */
  static fromObjects(objects: any[], sourceType: TuffSourceType, sourceId: string): TuffItem[] {
    return objects.map(obj => TuffUtils.fromObject(obj, sourceType, sourceId))
  }
}

// 导出所有工具
export { TuffFactory, TuffItemBuilder, TuffListBuilder, TuffSearchResultBuilder, TuffUtils }
