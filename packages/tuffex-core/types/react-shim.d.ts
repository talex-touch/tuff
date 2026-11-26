// Local-only type shim for optional peerDependency 'react' when @types/react is not installed.
// Lives outside src/ so vite-plugin-dts never emits it into dist/.
declare module 'react' {
  export function useSyncExternalStore<Snapshot>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot?: () => Snapshot,
  ): Snapshot
  export function useRef<T>(initialValue: T): { current: T }
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[],
  ): void
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T
}
