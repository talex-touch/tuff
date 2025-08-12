
/**
 * Interface for command line argument mapper options
 * @interface IArgMapperOptions
 */
export interface IArgMapperOptions {
  /** The type of touch window - either main window or core-box popup */
  touchType?: 'main' | 'core-box'
  /** User data directory path */
  userDataDir?: string
  /** Application path */
  appPath?: string
  /** Renderer client identifier */
  rendererClientId?: string
  /** Launch time ticks value */
  launchTimeTicks?: string
  /** Time ticks value */
  timeTicks?: string
  /** Additional dynamic string properties */
  [key: string]: string | undefined
}

declare global {
  export interface Window {
    /** Global argument mapper cache */
    $argMapper: IArgMapperOptions
  }
}

/**
 * Converts environment arguments into a structured mapper object
 * @param args - Array of command line arguments (defaults to process.argv)
 * @returns Mapped command line arguments as key-value pairs
 */
export function useArgMapper(args: string[] = process.argv): IArgMapperOptions {
  if ( window.$argMapper ) {
    return window.$argMapper
  }

  const mapper: IArgMapperOptions = {}

  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...valueParts] = arg.slice(2).split('=')
      const value = valueParts.join('=')

      const camelCaseKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      mapper[camelCaseKey] = value
    }
  }

  return window.$argMapper = mapper
}

/**
 * Gets the current touch type from command line arguments
 * @returns The touch type ('main' | 'core-box') or undefined
 */
export function useTouchType() {
  const argMapper = useArgMapper()

  return argMapper.touchType
}

/**
 * Checks if the current window is the main window
 * @returns True if the current window is the main window
 */
export function isMainWindow() {
  return useTouchType() === 'main'
}

/**
 * Checks if the current window is a core-box popup
 * @returns True if the current window is a core-box popup
 */
export function isCoreBox() {
  return useTouchType() === 'core-box'
}
