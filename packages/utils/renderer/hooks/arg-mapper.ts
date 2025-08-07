
export interface IArgMapperOptions {
  touchType?: 'main' | 'core-box'
  userDataDir?: string
  appPath?: string
  rendererClientId?: string
  launchTimeTicks?: string
  timeTicks?: string
  [key: string]: string | undefined
}

declare global {
  export interface Window {
    $argMapper: IArgMapperOptions
  }
}

/**
 * 将 environment arguments 收敛为 mapper
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

export function useTouchType() {
  const argMapper = useArgMapper()

  return argMapper.touchType
}

export function isMainWindow() {
  return useTouchType() === 'main'
}

export function isCoreBox() {
  return useTouchType() === 'core-box'
}
