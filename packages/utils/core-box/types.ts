/**
 * Core Box Type Definitions
 * Universal types extracted from various parts of the project for reuse across the entire codebase
 */

import type { IPluginIcon, IFeatureCommand } from '@talex-touch/utils/plugin';

/**
 * Render mode enumeration for search result items
 * Defines different ways to render search result content
 */
export enum RenderMode {
  /** Standard text-based rendering */
  STANDARD = 'standard',
  /** URL-based rendering - loads and displays remote URL content */
  URL = 'url',
  /** HTML content rendering */
  HTML = 'html',
  /** JavaScript code rendering with syntax highlighting */
  JAVASCRIPT = 'javascript',
  /** JSX component rendering */
  JSX = 'jsx',
  /** Vue Single File Component rendering */
  VUE_SFC = 'vue-sfc'
}

/**
 * Render configuration for search result items
 * Specifies how the search result should be displayed in the UI
 */
export interface IRenderConfig {
  /** The rendering mode to use */
  mode: RenderMode;

  /**
   * Content to render
   * - For URL mode: The remote URL to load and display
   * - For HTML mode: HTML content string
   * - For code modes: Source code string
   */
  content?: string;
  
  /** Additional render options */
  options?: {
    /** Whether to enable syntax highlighting for code */
    syntaxHighlight?: boolean;
    /** Theme for code highlighting */
    theme?: string;
    /** Whether to show line numbers */
    showLineNumbers?: boolean;
    /** Custom CSS classes */
    className?: string;
    /** Inline styles */
    style?: Record<string, string>;
    /** Whether content is trusted (for HTML rendering) */
    trusted?: boolean;
  };
  
  /**
   * Preview configuration - provides metadata for URL previews
   * Used to show rich preview information before loading the actual URL content
   */
  preview?: {
    /** Whether to show URL preview */
    enabled?: boolean;
    /** Preview image URL */
    image?: string;
    /** Preview title */
    title?: string;
    /** Preview description */
    description?: string;
  };
}

/**
 * Search result item interface - unified data structure
 * Compatible with SearchItem in app/core/src/views/box/search-box.ts
 * 
 * @example
 * ```typescript
 * const searchItem: ISearchItem = {
 *   name: "Example Result",
 *   desc: "This is an example search result",
 *   icon: { type: 'remix', value: 'search', init: async () => {} },
 *   push: false,
 *   names: ["Example Result"],
 *   keyWords: ["example", "result"],
 *   pluginType: "feature",
 *   type: "plugin",
 *   value: "example-plugin",
 *   render: {
 *     mode: RenderMode.STANDARD
 *   }
 * };
 * ```
 */
export interface ISearchItem {
  /** Display name of the search result */
  name: string;
  
  /** Description or subtitle of the search result */
  desc: string;
  
  /** Icon configuration for visual representation */
  icon: IPluginIcon;
  
  /** Whether this item supports push mode functionality */
  push: boolean;
  
  /** List of feature commands associated with this item */
  commands?: IFeatureCommand[];
  
  /** Array of searchable names for this item */
  names: string[];
  
  /** Array of keywords for search matching */
  keyWords: string[];
  
  /** Type of plugin this item belongs to */
  pluginType: string;
  
  /** General type classification of the item */
  type: string;
  
  /** Associated value, typically the plugin name */
  value: string;
  
  /** Usage frequency counter for ranking */
  amo?: number;
  
  /** Matching information from search algorithms */
  matched?: any;
  
  /** Whether this item was matched by name */
  matchedByName?: boolean;
  
  /** Whether this item was matched by description */
  descMatched?: boolean;
  
  /** Whether this item was matched by abbreviation */
  abridgeMatched?: boolean;
  
  /** Unique identifier for this search item */
  id?: string;
  
  /** Action to execute when this item is selected */
  action?: string;
  
  /** Reference to original feature object for command matching */
  originFeature?: ISearchItem;
  
  /** Render configuration for custom display */
  render?: IRenderConfig;
  
  /** Additional properties for extensibility */
  [key: string]: any;
}

/**
 * Search mode enumeration
 * Defines different modes of operation for the search box
 */
export enum BoxMode {
  /** Standard input mode for text search */
  INPUT = 0,
  /** Command mode for executing specific commands */
  COMMAND = 1,
  /** Image mode for image-based search */
  IMAGE = 2,
  /** File mode for file-based operations */
  FILE = 3,
  /** Feature mode for plugin feature activation */
  FEATURE = 4
}

/**
 * Search options configuration
 * Configures how search operations should be performed
 */
export interface ISearchOptions {
  /** The search mode to use */
  mode: BoxMode;
  
  /** Maximum number of results to return */
  maxResults?: number;
  
  /** Whether to enable fuzzy matching algorithms */
  fuzzyMatch?: boolean;
  
  /** Search timeout in milliseconds */
  timeout?: number;
  
  /** Whether to include cached results */
  includeCached?: boolean;
  
  /** Minimum confidence score for results */
  minConfidence?: number;
}

/**
 * Plugin search result push interface
 * Used when plugins push search results to the core box
 */
export interface IPluginSearchResult {
  /** Name of the plugin pushing the results */
  pluginName: string;
  
  /** Array of search result items */
  items: ISearchItem[];
  
  /** Timestamp when results were generated */
  timestamp: number;
  
  /** Original query that generated these results */
  query: string;
  
  /** Total number of results available */
  total: number;
  
  /** Whether more results are available */
  hasMore?: boolean;
  
  /** Metadata about the search operation */
  metadata?: {
    /** Time taken to generate results in milliseconds */
    processingTime?: number;
    /** Source of the results */
    source?: string;
    /** Confidence score of the overall result set */
    confidence?: number;
  };
}

/**
 * Search result manager interface
 * Manages search results within the core box
 */
export interface ISearchResultManager {
  /** Push new search results to the manager */
  pushItems(items: ISearchItem[]): void;
  
  /** Clear all current search results */
  clearItems(): void;
  
  /** Get all current search results */
  getItems(): ISearchItem[];
  
  /** Update a specific search result item */
  updateItem(id: string, item: Partial<ISearchItem>): boolean;
  
  /** Remove a specific search result item */
  removeItem(id: string): boolean;
  
  /** Get the total count of search results */
  getCount(): number;
  
  /** Filter results based on criteria */
  filterItems(predicate: (item: ISearchItem) => boolean): ISearchItem[];
  
  /** Sort results using a comparison function */
  sortItems(compareFn: (a: ISearchItem, b: ISearchItem) => number): void;
}

/**
 * Generic data item interface
 * Extended search item for various types of data processing results
 *
 * @example
 * ```typescript
 * const dataItem: IDataItem = {
 *   name: "Translation Result",
 *   desc: "English to Chinese translation",
 *   // ... other ISearchItem properties
 *   source: "google-translate",
 *   dataType: "translation",
 *   originalData: "Hello World",
 *   processedData: "你好世界",
 *   confidence: 95
 * };
 * ```
 */
export interface IDataItem extends ISearchItem {
  /** Source service or system that generated this data */
  source?: string;

  /** Type of data processing performed */
  dataType?: string;

  /** Original input data before processing */
  originalData?: any;

  /** Processed output data */
  processedData?: any;

  /** Quality score of the processing result (0-100) */
  quality?: number;

  /** Whether this result was retrieved from cache */
  cached?: boolean;

  /** Processing time in milliseconds */
  duration?: number;

  /** Confidence level of the result (0-100) */
  confidence?: number;

  /** Additional metadata about the processing */
  metadata?: Record<string, any>;
}

/**
 * Application item interface
 * Represents an application in search results
 */
export interface IAppItem extends ISearchItem {
  /** File system path to the application */
  path?: string;

  /** Version string of the application */
  version?: string;

  /** File size in bytes */
  size?: number;

  /** Timestamp of last usage */
  lastUsed?: number;

  /** Application category */
  category?: string;

  /** Whether the application is currently running */
  isRunning?: boolean;
}

/**
 * File item interface
 * Represents a file in search results
 */
export interface IFileItem extends ISearchItem {
  /** Full file system path */
  filePath: string;

  /** File size in bytes */
  fileSize?: number;

  /** MIME type of the file */
  fileType?: string;

  /** File extension */
  extension?: string;

  /** Last modified timestamp */
  modifiedTime?: number;

  /** Creation timestamp */
  createdTime?: number;

  /** Whether the file is currently accessible */
  accessible?: boolean;
}

/**
 * Feature item interface
 * Represents a plugin feature in search results
 */
export interface IFeatureItem extends ISearchItem {
  /** Unique identifier for the feature */
  featureId: string;

  /** Name of the plugin that owns this feature */
  pluginName: string;

  /** Detailed description of the feature */
  featureDesc?: string;

  /** Parameters required by the feature */
  parameters?: Record<string, any>;

  /** Whether the feature is currently enabled */
  enabled?: boolean;

  /** Feature category or group */
  category?: string;
}
