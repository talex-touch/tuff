/**
 * Search utility functions and helpers
 * Provides tools for creating, managing, and manipulating search results
 */

import type { 
  ISearchItem, 
  IDataItem, 
  IAppItem, 
  IFileItem, 
  IFeatureItem,
  RenderMode,
  IRenderConfig
} from './types';

/**
 * Search result utility functions
 * Collection of helper functions for working with search results
 */
export const SearchUtils = {
  /**
   * Creates a basic search result item with standard configuration
   * 
   * @param options - Configuration options for the search item
   * @returns A configured ISearchItem instance
   * 
   * @example
   * ```typescript
   * const item = SearchUtils.createSearchItem({
   *   name: "My Feature",
   *   desc: "A useful feature",
   *   pluginName: "my-plugin",
   *   keyWords: ["feature", "utility"]
   * });
   * ```
   */
  createSearchItem(options: {
    /** Display name of the item */
    name: string;
    /** Description text */
    desc: string;
    /** Name of the associated plugin */
    pluginName: string;
    /** Plugin type classification */
    pluginType?: string;
    /** General type classification */
    type?: string;
    /** Whether push mode is supported */
    push?: boolean;
    /** Additional search keywords */
    keyWords?: string[];
    /** Icon type (e.g., 'remix', 'file') */
    iconType?: string;
    /** Icon value/name */
    iconValue?: string;
    /** Custom render configuration */
    render?: IRenderConfig;
    /** Additional properties */
    [key: string]: any;
  }): ISearchItem {
    const {
      name,
      desc,
      pluginName,
      pluginType = 'feature',
      type = 'plugin',
      push = false,
      keyWords = [],
      iconType = 'remix',
      iconValue = 'function',
      render,
      ...extra
    } = options;
    
    return {
      name,
      desc,
      icon: {
        type: iconType,
        value: iconValue,
        init: async () => {}
      },
      push,
      names: [name],
      keyWords: [name, ...keyWords],
      pluginType,
      type,
      value: pluginName,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD },
      ...extra
    };
  },
  
  /**
   * Creates a data processing result item
   * Specialized for items that represent processed data
   * 
   * @param options - Configuration options for the data item
   * @returns A configured IDataItem instance
   */
  createDataItem(options: {
    /** Display name of the processed result */
    name: string;
    /** Description of the processing */
    desc: string;
    /** Name of the plugin that processed the data */
    pluginName: string;
    /** Source service or system */
    source?: string;
    /** Type of data processing */
    dataType?: string;
    /** Original input data */
    originalData?: any;
    /** Processed output data */
    processedData?: any;
    /** Quality score (0-100) */
    quality?: number;
    /** Whether result is from cache */
    cached?: boolean;
    /** Processing duration in ms */
    duration?: number;
    /** Confidence level (0-100) */
    confidence?: number;
    /** Additional metadata */
    metadata?: Record<string, any>;
    /** Icon configuration */
    iconType?: string;
    iconValue?: string;
    /** Search keywords */
    keyWords?: string[];
    /** Plugin type */
    pluginType?: string;
    /** Custom render configuration */
    render?: IRenderConfig;
  }): IDataItem {
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
      iconType = 'remix',
      iconValue = 'function',
      keyWords = [],
      pluginType = 'data',
      render
    } = options;
    
    return {
      name,
      desc,
      icon: {
        type: iconType,
        value: iconValue,
        init: async () => {}
      },
      push: false,
      names: [name],
      keyWords: [name, ...keyWords],
      pluginType,
      type: 'plugin',
      value: pluginName,
      source,
      dataType,
      originalData,
      processedData,
      quality,
      cached,
      duration,
      confidence,
      metadata,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD }
    };
  },
  
  /**
   * Creates an application search result item
   * Specialized for representing applications in search results
   * 
   * @param options - Configuration options for the app item
   * @returns A configured IAppItem instance
   */
  createAppItem(options: {
    /** Application name */
    name: string;
    /** Application description */
    desc: string;
    /** Action to execute when selected */
    action: string;
    /** Application file path */
    path?: string;
    /** Application version */
    version?: string;
    /** File size in bytes */
    size?: number;
    /** Last used timestamp */
    lastUsed?: number;
    /** Application category */
    category?: string;
    /** Whether app is running */
    isRunning?: boolean;
    /** Icon file path */
    iconPath?: string;
    /** Search keywords */
    keyWords?: string[];
    /** Custom render configuration */
    render?: IRenderConfig;
  }): IAppItem {
    const { 
      name, 
      desc, 
      action, 
      path, 
      version, 
      size, 
      lastUsed, 
      category,
      isRunning,
      iconPath, 
      keyWords = [],
      render
    } = options;
    
    return {
      name,
      desc,
      icon: {
        type: iconPath ? 'file' : 'remix',
        value: iconPath || 'apps',
        init: async () => {}
      },
      push: false,
      names: [name],
      keyWords: [name, ...keyWords],
      pluginType: 'app',
      type: 'app',
      value: name,
      action,
      path,
      version,
      size,
      lastUsed,
      category,
      isRunning,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD }
    };
  },
  
  /**
   * Creates a file search result item
   * Specialized for representing files in search results
   * 
   * @param options - Configuration options for the file item
   * @returns A configured IFileItem instance
   */
  createFileItem(options: {
    /** File name */
    name: string;
    /** Full file path */
    filePath: string;
    /** File description */
    desc?: string;
    /** File size in bytes */
    fileSize?: number;
    /** MIME type */
    fileType?: string;
    /** File extension */
    extension?: string;
    /** Modified timestamp */
    modifiedTime?: number;
    /** Created timestamp */
    createdTime?: number;
    /** Whether file is accessible */
    accessible?: boolean;
    /** Search keywords */
    keyWords?: string[];
    /** Custom render configuration */
    render?: IRenderConfig;
  }): IFileItem {
    const { 
      name, 
      filePath, 
      desc, 
      fileSize, 
      fileType, 
      extension,
      modifiedTime, 
      createdTime,
      accessible,
      keyWords = [],
      render
    } = options;
    
    return {
      name,
      desc: desc || filePath,
      icon: {
        type: 'remix',
        value: 'file',
        init: async () => {}
      },
      push: false,
      names: [name],
      keyWords: [name, filePath, ...keyWords],
      pluginType: 'file',
      type: 'file',
      value: filePath,
      action: `open "${filePath}"`,
      filePath,
      fileSize,
      fileType,
      extension,
      modifiedTime,
      createdTime,
      accessible,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD }
    };
  },

  /**
   * Creates a feature search result item
   * Specialized for representing plugin features in search results
   *
   * @param options - Configuration options for the feature item
   * @returns A configured IFeatureItem instance
   */
  createFeatureItem(options: {
    /** Feature name */
    name: string;
    /** Feature description */
    desc: string;
    /** Unique feature identifier */
    featureId: string;
    /** Name of the owning plugin */
    pluginName: string;
    /** Detailed feature description */
    featureDesc?: string;
    /** Feature parameters */
    parameters?: Record<string, any>;
    /** Whether feature is enabled */
    enabled?: boolean;
    /** Feature category */
    category?: string;
    /** Icon configuration */
    iconType?: string;
    iconValue?: string;
    /** Search keywords */
    keyWords?: string[];
    /** Custom render configuration */
    render?: IRenderConfig;
  }): IFeatureItem {
    const {
      name,
      desc,
      featureId,
      pluginName,
      featureDesc,
      parameters,
      enabled,
      category,
      iconType = 'remix',
      iconValue = 'function',
      keyWords = [],
      render
    } = options;

    return {
      name,
      desc,
      icon: {
        type: iconType,
        value: iconValue,
        init: async () => {}
      },
      push: false,
      names: [name],
      keyWords: [name, ...keyWords],
      pluginType: 'feature',
      type: 'plugin',
      value: pluginName,
      featureId,
      pluginName,
      featureDesc,
      parameters,
      enabled,
      category,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD }
    };
  },

  /**
   * Creates an error search result item
   * Used to display error states in search results
   *
   * @param options - Configuration options for the error item
   * @returns A configured ISearchItem representing an error
   */
  createErrorItem(options: {
    /** Error title */
    title: string;
    /** Error message */
    error: string;
    /** Plugin that generated the error */
    pluginName: string;
    /** Original query that caused the error */
    originalQuery?: string;
    /** Custom render configuration */
    render?: IRenderConfig;
  }): ISearchItem {
    const { title, error, pluginName, originalQuery, render } = options;

    return {
      name: title,
      desc: `Error: ${error}`,
      icon: {
        type: 'remix',
        value: 'error-warning',
        init: async () => {}
      },
      push: false,
      names: [title],
      keyWords: originalQuery ? [originalQuery, 'error', 'failed'] : ['error', 'failed'],
      pluginType: 'error',
      type: 'plugin',
      value: pluginName,
      error,
      originalQuery,
      amo: 0,
      render: render || { mode: RenderMode.STANDARD }
    };
  },

  /**
   * Sorts search results by priority and relevance
   * Uses a weighted scoring system based on type, usage, and name
   *
   * @param items - Array of search items to sort
   * @returns Sorted array of search items
   */
  sortByPriority(items: ISearchItem[]): ISearchItem[] {
    return items.sort((a, b) => {
      // Type-based weight scoring
      const typeWeights: Record<string, number> = {
        app: 10,
        feature: 5,
        cmd: 5,
        plugin: 3,
        file: 2,
        text: 1,
        error: 0
      };

      const aWeight = typeWeights[a.pluginType] || typeWeights[a.type] || 0;
      const bWeight = typeWeights[b.pluginType] || typeWeights[b.type] || 0;

      if (aWeight !== bWeight) {
        return bWeight - aWeight;
      }

      // Usage frequency scoring
      const aAmo = a.amo || 0;
      const bAmo = b.amo || 0;

      if (aAmo !== bAmo) {
        return bAmo - aAmo;
      }

      // Alphabetical sorting as final tiebreaker
      return a.name.localeCompare(b.name);
    });
  },

  /**
   * Removes duplicate search result items
   * Uses a combination of name, description, and value for uniqueness
   *
   * @param items - Array of search items that may contain duplicates
   * @returns Array with duplicate items removed
   */
  removeDuplicates(items: ISearchItem[]): ISearchItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
      const key = `${item.name}-${item.desc}-${item.value}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  },

  /**
   * Filters search results based on confidence score
   * Only returns items that meet the minimum confidence threshold
   *
   * @param items - Array of search items to filter
   * @param minConfidence - Minimum confidence score (0-100)
   * @returns Filtered array of search items
   */
  filterByConfidence(items: ISearchItem[], minConfidence: number = 0): ISearchItem[] {
    return items.filter(item => {
      const confidence = (item as IDataItem).confidence;
      return confidence === undefined || confidence >= minConfidence;
    });
  },

  /**
   * Groups search results by their plugin type
   * Useful for organizing results in the UI
   *
   * @param items - Array of search items to group
   * @returns Object with plugin types as keys and arrays of items as values
   */
  groupByPluginType(items: ISearchItem[]): Record<string, ISearchItem[]> {
    return items.reduce((groups, item) => {
      const type = item.pluginType;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(item);
      return groups;
    }, {} as Record<string, ISearchItem[]>);
  }
};
