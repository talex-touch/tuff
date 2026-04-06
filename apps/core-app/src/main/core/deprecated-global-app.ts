export function resolveRuntimeChannel(
  runtimeChannel: unknown,
  appChannel: unknown,
  _site: string
): unknown {
  if (runtimeChannel) {
    return runtimeChannel
  }
  if (appChannel) {
    return appChannel
  }
  return undefined
}
