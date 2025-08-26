/**
 * @fileoverview Search Types and Utilities
 *
 * This module provides comprehensive type definitions and utility functions
 * for search result items across the Tuff application. It defines
 * the core interfaces and factory functions used by the search system,
 * plugins, and UI components.
 *
 * Key exports:
 * - {@link ISearchItem} - Core search result item interface
 * - {@link IDataItem} - Extended interface for data processing results
 * - {@link createDataItem} - Factory function for creating data items
 *
 * @author Tuff Team
 * @since 1.0.0
 * @version 1.0.0
 */

import type { IPluginIcon, IFeatureCommand } from '../plugin';

/**
 * Search Result Item Interface
 *
 * Unified data structure definition for search results, maintaining consistency
 * with SearchItem in app/core/src/views/box/search-box.ts
 *
 * This interface serves as the foundation for all search result items across
 * the application, ensuring type safety and consistent data handling.
 *
 * @public
 * @since 2.0.0
 */
export interface ISearchItem {
  /**
   * Display name of the search result item
   *
   * This is the primary text shown to users in search results.
   * Should be concise and descriptive.
   *
   * @example "Calculator" for an application
   * @example "Translate Text" for a plugin feature
   */
  name: string;

  /**
   * Description or subtitle of the search result item
   *
   * Provides additional context about the item, such as file paths,
   * feature descriptions, or application details.
   *
   * @example "/Applications/Calculator.app" for an application
   * @example "Translate text using Google Translate" for a feature
   */
  desc: string;

  /**
   * Icon configuration for visual representation
   *
   * Defines how the item's icon should be displayed in the UI.
   * Supports various icon types including files, remix icons, and data URLs.
   *
   * @see {@link IPluginIcon} for icon configuration options
   */
  icon: IPluginIcon;

  /**
   * Whether this item supports push mode functionality
   *
   * Push mode allows items to dynamically update their content or
   * provide interactive features beyond simple execution.
   *
   * @defaultValue false
   * @example true for plugin features that accept user input
   * @example false for simple applications or static items
   */
  push: boolean;

  /**
   * List of feature commands associated with this item
   *
   * Commands provide additional actions that can be performed on this item.
   * Only applicable for plugin features that support multiple operations.
   *
   * @optional
   * @see {@link IFeatureCommand} for command structure
   */
  commands?: IFeatureCommand[];

  /**
   * Array of searchable names for this item
   *
   * Alternative names that can be used to find this item in search.
   * Typically includes the primary name and common variations.
   *
   * @example ["Calculator", "Calc", "Math"] for a calculator app
   */
  names: string[];

  /**
   * Array of keywords for search matching
   *
   * Additional terms that should match this item in search results.
   * Includes synonyms, categories, and related terms.
   *
   * @example ["math", "arithmetic", "numbers"] for a calculator
   */
  keyWords: string[];

  /**
   * Type of plugin this item belongs to
   *
   * Categorizes the item by its plugin type for filtering and sorting.
   * Common values include "app", "feature", "file", "cmd".
   *
   * @example "app" for applications
   * @example "feature" for plugin features
   * @example "file" for file system items
   */
  pluginType: string;

  /**
   * General type classification of the item
   *
   * Broader categorization used for grouping and display logic.
   * Often matches pluginType but can be more generic.
   *
   * @example "plugin" for plugin-based items
   * @example "app" for applications
   */
  type: string;

  /**
   * Associated value, typically the plugin name or identifier
   *
   * Links this item to its source plugin or system component.
   * Used for routing actions and maintaining relationships.
   *
   * @example "calculator-plugin" for a plugin feature
   * @example "system" for built-in functionality
   */
  value: string;

  /**
   * Usage frequency counter for ranking and sorting
   *
   * Tracks how often this item has been selected or used.
   * Higher values indicate more frequently used items.
   *
   * @optional
   * @defaultValue 0
   * @minimum 0
   */
  amo?: number;

  /**
   * Matching information from search algorithms
   *
   * Contains details about how this item matched the search query.
   * Used for highlighting and relevance scoring.
   *
   * @optional
   * @internal Used by search algorithms
   */
  matched?: any;

  /**
   * Whether this item was matched by its name
   *
   * Indicates if the search match occurred against the item's name field.
   * Used for determining match quality and highlighting.
   *
   * @optional
   * @defaultValue false
   */
  matchedByName?: boolean;

  /**
   * Whether this item was matched by its description
   *
   * Indicates if the search match occurred against the item's description.
   * Typically has lower priority than name matches.
   *
   * @optional
   * @defaultValue false
   */
  descMatched?: boolean;

  /**
   * Whether this item was matched by abbreviation
   *
   * Indicates if the search match occurred against abbreviated forms
   * of the item's name or keywords.
   *
   * @optional
   * @defaultValue false
   */
  abridgeMatched?: boolean;

  /**
   * Unique identifier for this search item
   *
   * Optional unique ID that can be used to distinguish items
   * with similar names or for caching purposes.
   *
   * @optional
   * @example "app-calculator-v1.0"
   * @example "feature-translate-google"
   */
  id?: string;

  /**
   * Action to execute when this item is selected
   *
   * Command or action string that defines what happens when
   * the user selects this item. Format varies by item type.
   *
   * @optional
   * @example "open /Applications/Calculator.app" for applications
   * @example "translate:google" for plugin features
   */
  action?: string;

  /**
   * Reference to original feature object for command matching
   *
   * Used internally for items that are derived from plugin features.
   * Maintains a link to the original feature for command resolution.
   *
   * @optional
   * @internal Used by plugin system
   */
  originFeature?: ISearchItem;

  /**
   * Additional properties for extensibility
   *
   * Allows for custom properties to be added to search items
   * without breaking the interface contract. Use sparingly
   * and prefer explicit properties when possible.
   *
   * @example { customData: "value", metadata: { source: "api" } }
   */
  [key: string]: any;
}

/**
 * Generic Data Item Interface
 *
 * Extended search item interface for various types of data processing results.
 * Inherits all properties from ISearchItem and adds data-specific fields
 * for tracking processing metadata, quality metrics, and source information.
 *
 * Commonly used for:
 * - Translation results
 * - Text analysis outputs
 * - Format conversion results
 * - API response data
 * - Computed values
 *
 * @public
 * @extends ISearchItem
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const translationResult: IDataItem = {
 *   name: "Hello World",
 *   desc: "English to Chinese translation",
 *   // ... other ISearchItem properties
 *   source: "google-translate",
 *   dataType: "translation",
 *   originalData: "Hello World",
 *   processedData: "你好世界",
 *   confidence: 95,
 *   duration: 120,
 *   cached: false
 * };
 * ```
 */
export interface IDataItem extends ISearchItem {
  /**
   * Source service or system that generated this data
   *
   * Identifies the origin of the processed data, such as an API service,
   * local processor, or external tool. Useful for debugging and analytics.
   *
   * @optional
   * @example "google-translate"
   * @example "local-analyzer"
   * @example "openai-api"
   */
  source?: string;

  /**
   * Type of data processing performed
   *
   * Categorizes the kind of data transformation or analysis that was applied.
   * Used for filtering, grouping, and applying type-specific logic.
   *
   * @optional
   * @example "translation"
   * @example "analysis"
   * @example "conversion"
   * @example "summarization"
   */
  dataType?: string;

  /**
   * Original input data before processing
   *
   * Preserves the raw input that was provided to the processing system.
   * Can be any type depending on the processing context.
   *
   * @optional
   * @example "Hello World" for translation input
   * @example { text: "...", options: {...} } for complex inputs
   */
  originalData?: any;

  /**
   * Processed output data
   *
   * Contains the result of the data processing operation.
   * Type varies based on the processing performed.
   *
   * @optional
   * @example "你好世界" for translation output
   * @example { summary: "...", keywords: [...] } for analysis results
   */
  processedData?: any;

  /**
   * Quality score of the processing result (0-100)
   *
   * Numerical assessment of the processing quality or accuracy.
   * Higher values indicate better quality results.
   *
   * @optional
   * @minimum 0
   * @maximum 100
   * @example 95 for high-quality translation
   * @example 78 for moderate-quality analysis
   */
  quality?: number;

  /**
   * Whether this result was retrieved from cache
   *
   * Indicates if the result came from a cached previous computation
   * rather than fresh processing. Useful for performance tracking.
   *
   * @optional
   * @defaultValue false
   */
  cached?: boolean;

  /**
   * Processing time in milliseconds
   *
   * Time taken to generate this result, excluding any caching.
   * Used for performance monitoring and user feedback.
   *
   * @optional
   * @minimum 0
   * @example 120 for a 120ms processing time
   * @example 1500 for a 1.5 second operation
   */
  duration?: number;

  /**
   * Confidence level of the result (0-100)
   *
   * Statistical confidence or certainty in the processing result.
   * Different from quality - indicates algorithmic confidence.
   *
   * @optional
   * @minimum 0
   * @maximum 100
   * @example 92 for high-confidence translation
   * @example 67 for moderate-confidence analysis
   */
  confidence?: number;

  /**
   * Additional metadata about the processing
   *
   * Flexible container for any additional information about
   * the processing operation, source, or result context.
   *
   * @optional
   * @example { apiVersion: "v2", model: "gpt-4", tokens: 150 }
   * @example { processingNode: "server-1", retryCount: 0 }
   */
  metadata?: Record<string, any>;
}

/**
 * 搜索模式枚举
 */
export enum SearchMode {
  INPUT = 'INPUT',
  COMMAND = 'COMMAND',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  FEATURE = 'FEATURE'
}

/**
 * 搜索选项接口
 */
export interface ISearchOptions {
  /** 搜索模式 */
  mode: SearchMode;

  /** 最大结果数量 */
  maxResults?: number;

  /** 是否启用模糊匹配 */
  fuzzyMatch?: boolean;

  /** 搜索超时时间（毫秒） */
  timeout?: number;
}

/**
 * 插件搜索结果推送接口
 */
export interface IPluginSearchResult {
  /** 插件名称 */
  pluginName: string;

  /** 搜索结果列表 */
  items: ISearchItem[];

  /** 推送时间戳 */
  timestamp: number;

  /** 查询关键词 */
  query: string;

  /** 结果总数 */
  total: number;

  /** 是否有更多结果 */
  hasMore?: boolean;
}

/**
 * 搜索结果管理器接口
 */
export interface ISearchResultManager {
  /** 推送搜索结果 */
  pushItems(items: ISearchItem[]): void;

  /** 清空搜索结果 */
  clearItems(): void;

  /** 获取当前搜索结果 */
  getItems(): ISearchItem[];

  /** 更新单个搜索结果 */
  updateItem(id: string, item: Partial<ISearchItem>): boolean;

  /** 删除单个搜索结果 */
  removeItem(id: string): boolean;

  /** 获取结果数量 */
  getCount(): number;
}

/**
 * Creates a data processing result item
 *
 * Factory function for creating IDataItem instances with proper defaults
 * and validation. Handles the common pattern of converting processed data
 * into searchable items with metadata tracking.
 *
 * This function is particularly useful for plugins that perform data
 * transformations, API calls, or analysis operations and need to present
 * their results in the search interface.
 *
 * @param options - Configuration object for the data item
 * @param options.name - Display name for the processed result
 * @param options.desc - Description of the processing or result
 * @param options.pluginName - Name of the plugin that created this item
 * @param options.source - Optional source identifier (e.g., "google-api")
 * @param options.dataType - Optional type of processing (e.g., "translation")
 * @param options.originalData - Optional input data before processing
 * @param options.processedData - Optional output data after processing
 * @param options.quality - Optional quality score (0-100)
 * @param options.cached - Optional flag indicating cached result
 * @param options.duration - Optional processing time in milliseconds
 * @param options.confidence - Optional confidence score (0-100)
 * @param options.metadata - Optional additional metadata
 * @param options.iconType - Optional icon type (defaults to "remix")
 * @param options.iconValue - Optional icon value (defaults to "function")
 * @param options.keyWords - Optional additional search keywords
 * @param options.pluginType - Optional plugin type (defaults to "data")
 *
 * @returns A properly configured IDataItem instance
 *
 * @public
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const translationItem = createDataItem({
 *   name: "你好世界",
 *   desc: "English to Chinese translation",
 *   pluginName: "translator",
 *   source: "google-translate",
 *   dataType: "translation",
 *   originalData: "Hello World",
 *   processedData: "你好世界",
 *   confidence: 95,
 *   duration: 120,
 *   cached: false
 * });
 * ```
 *
 * @example
 * ```typescript
 * const analysisItem = createDataItem({
 *   name: "Text Analysis Complete",
 *   desc: "Analyzed 150 words, 3 sentences",
 *   pluginName: "text-analyzer",
 *   dataType: "analysis",
 *   quality: 88,
 *   metadata: { wordCount: 150, sentenceCount: 3 }
 * });
 * ```
 */
export function createDataItem(options: {
  /** Display name for the processed result */
  name: string;
  /** Description of the processing or result */
  desc: string;
  /** Name of the plugin that created this item */
  pluginName: string;
  /** Source identifier (e.g., "google-api") */
  source?: string;
  /** Type of processing performed (e.g., "translation") */
  dataType?: string;
  /** Input data before processing */
  originalData?: any;
  /** Output data after processing */
  processedData?: any;
  /** Quality score (0-100) */
  quality?: number;
  /** Whether result is from cache */
  cached?: boolean;
  /** Processing time in milliseconds */
  duration?: number;
  /** Confidence score (0-100) */
  confidence?: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Icon type (defaults to "remix") */
  iconType?: string;
  /** Icon value (defaults to "function") */
  iconValue?: string;
  /** Additional search keywords */
  keyWords?: string[];
  /** Plugin type (defaults to "data") */
  pluginType?: string;
}): IDataItem {
  // Extract options with defaults for optional parameters
  const {
    name,
    desc,
    pluginName,
    source,
    dataType,
    originalData,
    processedData,
    quality,
    cached,
    duration,
    confidence,
    metadata,
    iconType = 'remix',        // Default to remix icon type
    iconValue = 'function',    // Default to function icon
    keyWords = [],             // Default to empty keywords array
    pluginType = 'data'        // Default to data plugin type
  } = options;

  // Create and return the data item with all required and optional properties
  return {
    // Core search item properties
    name,
    desc,
    icon: {
      type: iconType,
      value: iconValue,
      init: async () => {} // Required by IPluginIcon interface
    },
    push: false,                    // Data items don't support push mode
    names: [name],                  // Include name in searchable names
    keyWords: [name, ...keyWords],  // Combine name with additional keywords
    pluginType,
    type: 'plugin',                 // All plugin-generated items have type 'plugin'
    value: pluginName,              // Link to source plugin
    amo: 0,                         // Initialize usage counter

    // Data-specific properties
    source,
    dataType,
    originalData,
    processedData,
    quality,
    cached,
    duration,
    confidence,
    metadata
  };
}

/**
 * Creates a basic search result item
 *
 * Factory function for creating standard ISearchItem instances with
 * sensible defaults. This is the most commonly used function for
 * creating search results from plugins and system components.
 *
 * Unlike createDataItem, this function is for general-purpose search
 * items that don't require data processing metadata. It's ideal for
 * applications, features, files, and other standard search results.
 *
 * @param options - Configuration object for the search item
 * @param options.name - Display name of the search result
 * @param options.desc - Description or subtitle text
 * @param options.icon - Icon configuration object
 * @param options.pluginName - Name of the plugin creating this item
 * @param options.pluginType - Optional plugin type (defaults to "feature")
 * @param options.type - Optional general type (defaults to "plugin")
 * @param options.push - Optional push mode support (defaults to false)
 * @param options.commands - Optional list of available commands
 * @param options.keyWords - Optional additional search keywords
 * @param options.[key] - Any additional properties to include
 *
 * @returns A properly configured ISearchItem instance
 *
 * @public
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const appItem = createSearchItem({
 *   name: "Calculator",
 *   desc: "Built-in calculator application",
 *   icon: { type: 'file', value: '/path/to/icon.png', init: async () => {} },
 *   pluginName: "system-apps",
 *   pluginType: "app",
 *   keyWords: ["math", "arithmetic", "calc"]
 * });
 * ```
 *
 * @example
 * ```typescript
 * const featureItem = createSearchItem({
 *   name: "Search Files",
 *   desc: "Search for files on your system",
 *   icon: { type: 'remix', value: 'search', init: async () => {} },
 *   pluginName: "file-search",
 *   push: true,
 *   commands: [
 *     { name: "Search in Documents", action: "search:documents" }
 *   ]
 * });
 * ```
 */
export function createSearchItem(options: {
  /** Display name of the search result */
  name: string;
  /** Description or subtitle text */
  desc: string;
  /** Icon configuration object */
  icon: IPluginIcon;
  /** Name of the plugin creating this item */
  pluginName: string;
  /** Plugin type (defaults to "feature") */
  pluginType?: string;
  /** General type (defaults to "plugin") */
  type?: string;
  /** Push mode support (defaults to false) */
  push?: boolean;
  /** List of available commands */
  commands?: IFeatureCommand[];
  /** Additional search keywords */
  keyWords?: string[];
  /** Any additional properties to include */
  [key: string]: any;
}): ISearchItem {
  // Extract options with defaults for optional parameters
  const {
    name,
    desc,
    icon,
    pluginName,
    pluginType = 'feature',    // Default to feature type
    type = 'plugin',           // Default to plugin type
    push = false,              // Default to no push mode
    commands = [],             // Default to empty commands array
    keyWords = [],             // Default to empty keywords array
    ...extra                   // Capture any additional properties
  } = options;

  // Create and return the search item with all properties
  return {
    // Core required properties
    name,
    desc,
    icon,
    push,
    commands,
    names: [name],                  // Include name in searchable names
    keyWords: [name, ...keyWords],  // Combine name with additional keywords
    pluginType,
    type,
    value: pluginName,              // Link to source plugin
    amo: 0,                         // Initialize usage counter

    // Spread any additional properties provided
    ...extra
  };
}
