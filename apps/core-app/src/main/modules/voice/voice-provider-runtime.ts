import {
  BailianParaformerVoiceProvider,
  createFetchHttpClient,
  createNodeVoiceSocketFactory,
  createVoiceProviderRegistry,
  DoubaoVoiceProvider,
  type VoiceProviderAdapter,
  type VoiceProviderRegistry
} from '@talex-touch/tuff-voice'

let registry: VoiceProviderRegistry | null = null

function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value || undefined
}

function createConfiguredProviders(): VoiceProviderAdapter[] {
  const socketFactory = createNodeVoiceSocketFactory()
  const httpClient = createFetchHttpClient()
  const providers: VoiceProviderAdapter[] = []

  const doubaoApiKey = env('TUFF_VOICE_DOUBAO_API_KEY')
  const doubaoAppKey = env('TUFF_VOICE_DOUBAO_APP_KEY')
  const doubaoAccessKey = env('TUFF_VOICE_DOUBAO_ACCESS_KEY')
  const doubaoResourceId =
    env('TUFF_VOICE_DOUBAO_RESOURCE_ID') ??
    (doubaoApiKey ? 'volc.seedasr.sauc.duration' : undefined)
  if (doubaoResourceId && (doubaoApiKey || (doubaoAppKey && doubaoAccessKey))) {
    providers.push(
      new DoubaoVoiceProvider({
        credentials: {
          ...(doubaoApiKey ? { apiKey: doubaoApiKey } : {}),
          ...(doubaoAppKey ? { appKey: doubaoAppKey } : {}),
          ...(doubaoAccessKey ? { accessKey: doubaoAccessKey } : {}),
          resourceId: doubaoResourceId
        },
        socketFactory,
        httpClient,
        ...(env('TUFF_VOICE_DOUBAO_ASR_WS_URL')
          ? { streamUrl: env('TUFF_VOICE_DOUBAO_ASR_WS_URL') }
          : {}),
        ...(env('TUFF_VOICE_DOUBAO_UPLOAD_VARIANT') === 'standard' ||
        env('TUFF_VOICE_DOUBAO_UPLOAD_VARIANT') === 'idle'
          ? { uploadVariant: env('TUFF_VOICE_DOUBAO_UPLOAD_VARIANT') as 'standard' | 'idle' }
          : {})
      })
    )
  }

  const bailianApiKey = env('TUFF_VOICE_BAILIAN_API_KEY')
  const bailianWorkspaceId = env('TUFF_VOICE_BAILIAN_WORKSPACE_ID')
  if (bailianApiKey && bailianWorkspaceId) {
    providers.push(
      new BailianParaformerVoiceProvider({
        credentials: { apiKey: bailianApiKey, workspaceId: bailianWorkspaceId },
        socketFactory,
        httpClient,
        ...(env('TUFF_VOICE_BAILIAN_MODEL')
          ? { streamOptions: { model: env('TUFF_VOICE_BAILIAN_MODEL') } }
          : {})
      })
    )
  }

  return providers
}

export function getVoiceProviderRegistry(): VoiceProviderRegistry {
  if (!registry) registry = createVoiceProviderRegistry(createConfiguredProviders())
  return registry
}

export function resetVoiceProviderRegistryForTests(): void {
  registry = null
}

export function getVoiceProvider(
  mode: 'stream' | 'upload',
  preferredId?: string
): VoiceProviderAdapter | undefined {
  const active = getVoiceProviderRegistry()
  if (active.list().length === 0) return undefined
  const configuredId = preferredId ?? env('TUFF_VOICE_ASR_PROVIDER')
  return active.resolve(mode, configuredId)
}
