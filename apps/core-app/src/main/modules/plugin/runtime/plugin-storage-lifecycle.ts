type PluginStorageTeardown = (pluginName: string) => Promise<void>

let teardownHandler: PluginStorageTeardown | null = null

export function registerPluginStorageTeardown(handler: PluginStorageTeardown): () => void {
  teardownHandler = handler
  return () => {
    if (teardownHandler === handler) teardownHandler = null
  }
}

export async function teardownPluginStorage(pluginName: string): Promise<void> {
  await teardownHandler?.(pluginName)
}
