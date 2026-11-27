export interface BoxToolCloudSceneRunRequest {
  input?: unknown
  capability?: string
  providerId?: string
  dryRun?: boolean
  timeoutMs?: number
}

export interface BoxToolCloudSceneRunResult {
  runId: string
  sceneId: string
  status: 'planned' | 'completed' | 'failed'
  mode: 'dry_run' | 'execute'
  output: unknown
  trace?: unknown[]
  usage?: unknown[]
  selected?: unknown[]
  candidates?: unknown[]
  fallbackTrail?: unknown[]
  error?: {
    code?: string
    message?: string
  }
}

export interface BoxToolCloudTranslatedImageOutput {
  translatedImageBase64: string
  imageMimeType?: string
  sourceText?: string
  targetText?: string
  overlay?: unknown
}

export interface BoxToolCloudFxConvertOutput {
  base: string
  target: string
  amount: number
  rate: number
  converted: number
  source?: string
  updatedAt?: string
  providerUpdatedAt?: string | null
  fetchedAt?: string
  providerNextUpdateAt?: string | null
}

export interface BoxToolCloudFxRateSnapshotOutput {
  base: string
  rates: Record<string, number>
  source?: string
  asOf?: string
  providerUpdatedAt?: string | null
  fetchedAt?: string
  providerNextUpdateAt?: string | null
}

export interface BoxToolCloudScenePort {
  runScene(
    sceneId: string,
    request: BoxToolCloudSceneRunRequest
  ): Promise<BoxToolCloudSceneRunResult | null>
  extractTranslatedImage(
    run: BoxToolCloudSceneRunResult | null
  ): BoxToolCloudTranslatedImageOutput | null
  extractFxConvert(run: BoxToolCloudSceneRunResult | null): BoxToolCloudFxConvertOutput | null
  extractFxRateSnapshot(
    run: BoxToolCloudSceneRunResult | null
  ): BoxToolCloudFxRateSnapshotOutput | null
}

let activePort: BoxToolCloudScenePort | null = null

export function registerBoxToolCloudScenePort(port: BoxToolCloudScenePort): () => void {
  activePort = port
  return () => {
    if (activePort === port) {
      activePort = null
    }
  }
}

export function getBoxToolCloudScenePort(): BoxToolCloudScenePort | null {
  return activePort
}

export function resetBoxToolCloudScenePort(): void {
  activePort = null
}

export async function runBoxToolCloudScene(
  sceneId: string,
  request: BoxToolCloudSceneRunRequest
): Promise<BoxToolCloudSceneRunResult | null> {
  if (!activePort) {
    return null
  }
  return await activePort.runScene(sceneId, request)
}

export function extractBoxToolTranslatedImageFromSceneRun(
  run: BoxToolCloudSceneRunResult | null
): BoxToolCloudTranslatedImageOutput | null {
  if (!activePort) {
    return null
  }
  return activePort.extractTranslatedImage(run)
}

export function extractBoxToolFxConvertFromSceneRun(
  run: BoxToolCloudSceneRunResult | null
): BoxToolCloudFxConvertOutput | null {
  if (!activePort) {
    return null
  }
  return activePort.extractFxConvert(run)
}

export function extractBoxToolFxRateSnapshotFromSceneRun(
  run: BoxToolCloudSceneRunResult | null
): BoxToolCloudFxRateSnapshotOutput | null {
  if (!activePort) {
    return null
  }
  return activePort.extractFxRateSnapshot(run)
}
