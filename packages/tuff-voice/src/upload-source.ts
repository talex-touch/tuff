import type {
  VoiceResolvedUploadSource,
  VoiceUploadRequest,
  VoiceUploadSource,
} from './contracts'
import { throwIfAborted } from './async'
import { assertVoiceUploadUrl, VoiceProviderError } from './contracts'

export type VoiceUploadUrlResolver = (
  source: VoiceUploadSource,
  signal?: AbortSignal,
) => Promise<VoiceResolvedUploadSource>

export async function resolveUploadSource(
  request: VoiceUploadRequest,
  resolver?: VoiceUploadUrlResolver,
): Promise<VoiceResolvedUploadSource> {
  throwIfAborted(request.signal)
  if (request.source.kind === 'url') {
    return { url: assertVoiceUploadUrl(request.source.url) }
  }
  if (!resolver) {
    throw new VoiceProviderError(
      'VOICE_UPLOAD_SOURCE_UNAVAILABLE',
      'A main-owned upload URL resolver is required for binary voice uploads.',
    )
  }
  const resolved = await resolver(request.source, request.signal)
  if (!resolved || typeof resolved.url !== 'string') {
    throw new VoiceProviderError(
      'VOICE_UPLOAD_SOURCE_INVALID',
      'The upload URL resolver returned an invalid source.',
    )
  }
  return { ...resolved, url: assertVoiceUploadUrl(resolved.url) }
}

export async function withResolvedUploadSource<T>(
  request: VoiceUploadRequest,
  resolver: VoiceUploadUrlResolver | undefined,
  operation: (source: VoiceResolvedUploadSource) => Promise<T>,
): Promise<T> {
  const source = await resolveUploadSource(request, resolver)
  try {
    return await operation(source)
  }
  finally {
    await source.release?.()
  }
}
