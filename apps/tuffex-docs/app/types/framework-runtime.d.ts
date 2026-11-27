declare module 'virtual:tuffex-wc-runtime' {
  export interface TuffexWcModule {
    registerTuffexElements?: (options?: Record<string, unknown>) => void
    WC_ELEMENTS_MANIFEST?: Record<string, unknown>
    [key: string]: unknown
  }

  export const available: boolean
  export const reason: string
  export function loadTuffexWcRuntime(): Promise<TuffexWcModule | null>
}

declare module 'virtual:tuffex-react-runtime' {
  export interface ReactRootLike {
    render: (element: unknown) => void
    unmount: () => void
  }

  export interface ReactModuleLike {
    createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
    Fragment: unknown
    useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
  }

  export interface TuffexReactRuntime {
    React: ReactModuleLike
    createRoot: (container: Element) => ReactRootLike
    TuffexReact: Record<string, unknown>
  }

  export const available: boolean
  export const reason: string
  export function loadTuffexReactRuntime(): Promise<TuffexReactRuntime | null>
}
