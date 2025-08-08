import { AggregatedSection, IconOptions, SearchItem as TuffItem } from '@talex-touch/utils/types/touch-app-core'

export { TuffItem }

/**
 * 搜索上下文
 */
export interface SearchContext {
  keyword: string
  [key: string]: any
}

/**
 * 聚合后的区域
 */
export interface AggregatedSection {
  source: string;
  layout: 'list' | 'card' | 'horizontal';
  items: TuffItem[];
}

export enum SearchSourceType {
  Application = 'application',
  File = 'file',
  Plugin = 'plugin',
  System = 'system',
  Web = 'web',
  Custom = 'custom'
}

export interface ISearchSource {
  // --- 基础元数据 ---
  readonly name: string; // 唯一标识符, e.g., "mac-applications"
  readonly type: SearchSourceType; // 源的类型

  // --- 行为配置 ---
  /**
   * 激活关键词。当用户输入以这些词开头（加空格）时，优先调用此源。
   * e.g., ['find', 'file:']
   */
  readonly activationKeywords?: string[];

  /**
   * 源的数据是否易变且需要频繁刷新。
   * true: 比如实时汇率、剪贴板。
   * false: 比如应用列表（变化频率低）。
   */
  readonly isVolatile: boolean;

  // --- 生命周期与核心方法 ---
  /**
   * 当源被注册到 SearchEngine 时调用，可用于初始化。
   * @param engine - SearchEngine 的实例，方便回调
   */
  onRegister?(engine: ISearchEngine): Promise<void>;

  /**
   * 核心搜索方法 (PULL 模式)
   * @param context - 搜索上下文
   * @returns 返回匹配的 TuffItem 数组
   */
  onSearch(context: SearchContext): Promise<TuffItem[]>;

  /**
   * 后台数据刷新 (可选)
   * 由 SearchEngine 根据策略（如 isVolatile 和系统闲置状态）调用。
   * 用于更新内部缓存，如重新扫描应用程序目录。
   */
  onRefresh?(): Promise<void>;

  // --- PUSH 模式相关 (可选) ---
  /**
   * 当源被激活时调用 (e.g., 用户输入了 activationKeyword)
   */
  onActivate?(): void;

  /**
   * 当源失活时调用
   */
  onDeactivate?(): void;
}

export interface ISearchEngine {
  /**
   * 注册一个搜索源
   * @param source - ISearchSource 的实例
   */
  registerSource(source: ISearchSource): void;

  /**
   * 根据名称注销一个搜索源
   * @param name - 搜索源的唯一名称
   */
  unregisterSource(name: string): void;

  /**
   * 执行搜索
   * @param context - 包含关键字等信息的搜索上下文
   * @returns 返回聚合和排序后的结果
   */
  search(context: SearchContext): Promise<AggregatedSection[]>;

  /**
   * 负责后台数据预热、缓存清理等任务
   */
  maintain(): void;
}