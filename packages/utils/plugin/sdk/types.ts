/**
 * @fileoverview Plugin SDK utilities and interfaces for Talex Touch plugin development
 * @author Talex Touch Team
 * @version 1.0.0
 */

/**
 * Plugin utilities interface providing core functionality for plugin development
 *
 * @public
 */
export interface IPluginUtils {
  /**
   * HTTP client for network requests (axios instance)
   * @remarks Provides direct access to axios for making HTTP requests
   */
  http: any;

  /**
   * Data storage manager for persistent data operations
   * @see {@link IStorageManager}
   */
  storage: IStorageManager;

  /**
   * Clipboard manager for system clipboard operations
   * @see {@link IClipboardManager}
   */
  clipboard: IClipboardManager;

  /**
   * Search result manager for handling search operations
   * @see {@link ISearchManager}
   */
  search: ISearchManager;

  /**
   * Dialog manager for system dialog operations
   * @see {@link IDialogManager}
   */
  dialog: IDialogManager;

  /**
   * Logger for plugin logging operations
   * @see {@link ILogger}
   */
  logger: ILogger;

  /**
   * Event manager for plugin event handling
   * @see {@link IEventManager}
   */
  $event: IEventManager;

  /**
   * Opens a URL in the default browser
   * @param url - The URL to open
   */
  openUrl: (url: string) => void;

  /**
   * Pushes search result items to the search interface
   * @param items - Array of search result items to add
   */
  pushItems: (items: any[]) => void;

  /**
   * Clears all current search results
   */
  clearItems: () => void;

  /**
   * Gets all current search result items
   * @returns Array of current search result items
   */
  getItems: () => any[];
}

/**
 * Storage manager interface for persistent data operations
 *
 * @public
 * @remarks Provides key-value storage functionality with JSON serialization
 */
export interface IStorageManager {
  /**
   * Sets a value for the given key
   * @param key - The storage key
   * @param value - The value to store (will be JSON serialized)
   * @returns Promise that resolves when the value is stored
   */
  set(key: string, value: any): Promise<void>;

  /**
   * Gets a value for the given key
   * @param key - The storage key
   * @param defaultValue - Default value to return if key doesn't exist
   * @returns Promise that resolves to the stored value or default value
   */
  get(key: string, defaultValue?: any): Promise<any>;

  /**
   * Checks if a key exists in storage
   * @param key - The storage key to check
   * @returns Promise that resolves to true if key exists, false otherwise
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes a key from storage
   * @param key - The storage key to remove
   * @returns Promise that resolves when the key is removed
   */
  remove(key: string): Promise<void>;

  /**
   * Clears all stored data
   * @returns Promise that resolves when all data is cleared
   */
  clear(): Promise<void>;

  /**
   * Gets all storage keys
   * @returns Promise that resolves to an array of all storage keys
   */
  keys(): Promise<string[]>;
}

/**
 * Clipboard manager interface for system clipboard operations
 *
 * @public
 * @remarks Provides access to system clipboard for text and image operations
 */
export interface IClipboardManager {
  /**
   * Reads text from the clipboard
   * @returns The text content from clipboard
   */
  readText(): string;

  /**
   * Writes text to the clipboard
   * @param text - The text to write to clipboard
   */
  writeText(text: string): void;

  /**
   * Reads image from the clipboard
   * @returns The image data from clipboard, or null if no image
   */
  readImage(): any | null;

  /**
   * Writes image to the clipboard
   * @param image - The image data to write to clipboard
   */
  writeImage(image: any): void;

  /**
   * Clears the clipboard content
   */
  clear(): void;

  /**
   * Checks if clipboard contains text
   * @returns True if clipboard has text content, false otherwise
   */
  hasText(): boolean;

  /**
   * Checks if clipboard contains image
   * @returns True if clipboard has image content, false otherwise
   */
  hasImage(): boolean;
}

/**
 * Search manager interface for handling search operations
 *
 * @public
 * @remarks Manages search query state and timing information
 */
export interface ISearchManager {
  /**
   * Updates the current search query
   * @param query - The new search query string
   */
  updateQuery(query: string): void;

  /**
   * Gets the current search query
   * @returns The current search query string
   */
  getQuery(): string;

  /**
   * Gets the timestamp of the last query update
   * @returns Timestamp in milliseconds since epoch
   */
  getTimestamp(): number;
}

/**
 * Dialog manager interface for system dialog operations
 *
 * @public
 * @remarks Provides access to native system dialogs
 */
export interface IDialogManager {
  /**
   * Shows a message box dialog
   * @param options - Message box configuration options
   * @param options.type - Dialog type (info, warning, error, question)
   * @param options.title - Dialog title
   * @param options.message - Main message text
   * @param options.detail - Additional detail text
   * @param options.buttons - Array of button labels
   * @returns Promise that resolves to the dialog result
   */
  showMessageBox(options: {
    type?: 'info' | 'warning' | 'error' | 'question';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }): Promise<any>;

  /**
   * Shows an open file/folder dialog
   * @param options - Open dialog configuration options
   * @param options.title - Dialog title
   * @param options.defaultPath - Default path to open
   * @param options.filters - File type filters
   * @param options.properties - Dialog properties (openFile, openDirectory, etc.)
   * @returns Promise that resolves to the selected file/folder paths
   */
  showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: string[];
  }): Promise<any>;

  /**
   * Shows a save file dialog
   * @param options - Save dialog configuration options
   * @param options.title - Dialog title
   * @param options.defaultPath - Default file path
   * @param options.filters - File type filters
   * @returns Promise that resolves to the selected save path
   */
  showSaveDialog(options: {
    title?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<any>;
}

/**
 * Logger interface for plugin logging operations
 *
 * @public
 * @remarks Provides structured logging with different severity levels
 */
export interface ILogger {
  /**
   * Logs an informational message
   * @param message - The log message
   * @param args - Additional arguments to log
   */
  info(message: string, ...args: any[]): void;

  /**
   * Logs a warning message
   * @param message - The warning message
   * @param args - Additional arguments to log
   */
  warn(message: string, ...args: any[]): void;

  /**
   * Logs an error message
   * @param message - The error message
   * @param args - Additional arguments to log
   */
  error(message: string, ...args: any[]): void;

  /**
   * Logs a debug message
   * @param message - The debug message
   * @param args - Additional arguments to log
   */
  debug(message: string, ...args: any[]): void;
}

/**
 * Event manager interface for plugin event handling
 *
 * @public
 * @remarks Provides event-driven communication within plugins
 */
export interface IEventManager {
  /**
   * Registers an event listener
   * @param event - The event name to listen for
   * @param callback - The callback function to execute when event is emitted
   */
  on(event: string, callback: Function): void;

  /**
   * Removes an event listener
   * @param event - The event name to stop listening for
   * @param callback - The callback function to remove
   */
  off(event: string, callback: Function): void;

  /**
   * Emits an event with optional arguments
   * @param event - The event name to emit
   * @param args - Arguments to pass to event listeners
   */
  emit(event: string, ...args: any[]): void;
}

/**
 * Plugin configuration interface
 *
 * @public
 * @remarks Flexible configuration object for plugin settings
 */
export interface IPluginConfig {
  /** Dynamic configuration properties */
  [key: string]: any;
}

/**
 * Plugin context interface providing runtime information and utilities
 *
 * @public
 * @remarks Contains all necessary context information for plugin execution
 */
export interface IPluginContext {
  /**
   * The name of the plugin
   */
  pluginName: string;

  /**
   * The file system path to the plugin directory
   */
  pluginPath: string;

  /**
   * Plugin configuration object
   * @see {@link IPluginConfig}
   */
  config: IPluginConfig;

  /**
   * Plugin utilities and tools
   * @see {@link IPluginUtils}
   */
  utils: IPluginUtils;
}

/**
 * Plugin lifecycle interface defining plugin event handlers
 *
 * @public
 * @remarks Defines the lifecycle methods that plugins can implement
 */
export interface IPluginLifecycle {
  /**
   * Called when the plugin is initialized
   * @param context - The plugin context containing utilities and configuration
   * @returns Promise or void
   * @optional
   */
  onInit?(context: IPluginContext): Promise<void> | void;

  /**
   * Called when a plugin feature is triggered
   * @param featureId - The ID of the triggered feature
   * @param query - The search query or input data
   * @param feature - The feature configuration object
   * @returns Promise or void
   */
  onFeatureTriggered(featureId: string, query: any, feature: any): Promise<void> | void;

  /**
   * Called when user input changes (for real-time features)
   * @param input - The current input string
   * @returns Promise or void
   * @optional
   */
  onInputChanged?(input: string): Promise<void> | void;

  /**
   * Called when an action button is clicked
   * @param actionId - The ID of the clicked action
   * @param data - Optional data associated with the action
   * @returns Promise or void
   * @optional
   */
  onActionClick?(actionId: string, data?: any): Promise<void> | void;

  /**
   * Called when the plugin is being destroyed/unloaded
   * @returns Promise or void
   * @optional
   */
  onDestroy?(): Promise<void> | void;
}

/**
 * Creates a storage manager instance for plugin data persistence
 *
 * @param pluginPath - The file system path to the plugin directory
 * @param fse - File system extra module (fs-extra)
 * @returns A configured storage manager instance
 *
 * @public
 * @remarks Creates a JSON-based storage system in the plugin's data directory
 *
 * @example
 * ```typescript
 * const storage = createStorageManager('/path/to/plugin', fse);
 * await storage.set('config', { theme: 'dark' });
 * const config = await storage.get('config', {});
 * ```
 */
export function createStorageManager(
  pluginPath: string,
  fse: any
): IStorageManager {
  const path = require('path');
  const dataPath = path.join(pluginPath, 'data');

  /**
   * Ensures the data directory exists
   * @internal
   */
  const ensureDataDir = async (): Promise<void> => {
    if (!await fse.pathExists(dataPath)) {
      await fse.ensureDir(dataPath);
    }
  };

  return {
    async set(key: string, value: any): Promise<void> {
      await ensureDataDir();
      const filePath = path.join(dataPath, `${key}.json`);
      await fse.writeJSON(filePath, value, { spaces: 2 });
    },

    async get(key: string, defaultValue?: any): Promise<any> {
      await ensureDataDir();
      const filePath = path.join(dataPath, `${key}.json`);
      if (await fse.pathExists(filePath)) {
        return await fse.readJSON(filePath);
      }
      return defaultValue;
    },

    async has(key: string): Promise<boolean> {
      await ensureDataDir();
      const filePath = path.join(dataPath, `${key}.json`);
      return await fse.pathExists(filePath);
    },

    async remove(key: string): Promise<void> {
      await ensureDataDir();
      const filePath = path.join(dataPath, `${key}.json`);
      if (await fse.pathExists(filePath)) {
        await fse.remove(filePath);
      }
    },

    async clear(): Promise<void> {
      if (await fse.pathExists(dataPath)) {
        await fse.emptyDir(dataPath);
      }
    },

    async keys(): Promise<string[]> {
      await ensureDataDir();
      const files = await fse.readdir(dataPath);
      return files
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => path.basename(file, '.json'));
    }
  };
}

/**
 * Creates a clipboard manager instance for system clipboard operations
 *
 * @param clipboard - The Electron clipboard module
 * @returns A configured clipboard manager instance
 *
 * @public
 * @remarks Provides a wrapper around Electron's clipboard API
 *
 * @example
 * ```typescript
 * const clipboardManager = createClipboardManager(clipboard);
 * clipboardManager.writeText('Hello World');
 * const text = clipboardManager.readText();
 * ```
 */
export function createClipboardManager(clipboard: any): IClipboardManager {
  return {
    readText(): string {
      return clipboard.readText();
    },

    writeText(text: string): void {
      clipboard.writeText(text);
    },

    readImage(): any | null {
      const image = clipboard.readImage();
      return image.isEmpty() ? null : image;
    },

    writeImage(image: any): void {
      clipboard.writeImage(image);
    },

    clear(): void {
      clipboard.clear();
    },

    hasText(): boolean {
      return clipboard.has('text/plain');
    },

    hasImage(): boolean {
      return clipboard.has('image/png') || clipboard.has('image/jpeg');
    }
  };
}

/**
 * Creates a search manager instance for handling search state
 *
 * @returns A configured search manager instance
 *
 * @public
 * @remarks Manages search query state and timing information
 *
 * @example
 * ```typescript
 * const searchManager = createSearchManager();
 * searchManager.updateQuery('hello world');
 * const query = searchManager.getQuery();
 * const timestamp = searchManager.getTimestamp();
 * ```
 */
export function createSearchManager(): ISearchManager {
  let currentQuery = '';
  let timestamp = Date.now();

  return {
    updateQuery(query: string): void {
      currentQuery = query;
      timestamp = Date.now();
    },

    getQuery(): string {
      return currentQuery;
    },

    getTimestamp(): number {
      return timestamp;
    }
  };
}
