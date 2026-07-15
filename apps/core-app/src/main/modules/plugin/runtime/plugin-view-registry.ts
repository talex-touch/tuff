/**
 * Registry of webContents that render third-party plugin surfaces.
 *
 * The channel layer derives a message's channel type from the self-declared
 * `uniqueKey` in the payload. A compromised plugin view could omit or forge that
 * key to masquerade as a trusted first-party (MAIN) caller and reach gated main
 * handlers. This registry lets the channel layer verify the *real* origin from
 * the sender's webContents id: any message from a registered plugin webContents
 * is forced onto the PLUGIN channel (and its permission checks), regardless of
 * what the payload claims.
 *
 * First-party views are never registered here, so their IPC is unaffected.
 */
const pluginWebContentsToName = new Map<number, string>()

export function registerPluginWebContents(webContentsId: number, pluginName: string): void {
  pluginWebContentsToName.set(webContentsId, pluginName)
}

export function unregisterPluginWebContents(webContentsId: number): void {
  pluginWebContentsToName.delete(webContentsId)
}

export function resolvePluginNameByWebContents(
  webContentsId: number | undefined
): string | undefined {
  if (typeof webContentsId !== 'number') {
    return undefined
  }
  return pluginWebContentsToName.get(webContentsId)
}
