import type { TuffItem } from '@talex-touch/utils/core-box'
import type { CoreBoxImageTranslateResponse } from '../../../../shared/events/corebox-scenes'
import { readFile } from 'node:fs/promises'
import { resolveLocalFilePath } from '@talex-touch/utils/network'
import { clipboard, nativeImage } from 'electron'
import { COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID } from '../../../../shared/events/corebox-scenes'
import { extractTranslatedImageFromSceneRun, runNexusScene } from '../../nexus/scene-client'
import { openImageTranslatePinWindow } from './image-translate-pin-window'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getMetaRecord(item: TuffItem): Record<string, unknown> | null {
  return isRecord(item.meta) ? item.meta : null
}

function getClipboardRecord(item: TuffItem): Record<string, unknown> | null {
  const raw = getMetaRecord(item)?.raw
  return isRecord(raw) ? raw : null
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(',')
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : value
}

async function readImageBase64FromSource(source: string): Promise<string | null> {
  const trimmed = source.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:image/')) {
    return stripDataUrlPrefix(trimmed)
  }

  const localPath = resolveLocalFilePath(trimmed)
  if (!localPath) return null

  const buffer = await readFile(localPath)
  return buffer.toString('base64')
}

export async function translateCoreBoxImageItem(
  item: TuffItem,
  targetLang = 'zh',
  options: { openPinWindow?: boolean } = {}
): Promise<CoreBoxImageTranslateResponse> {
  if (item.kind !== 'image') {
    return {
      success: false,
      code: 'INVALID_ITEM',
      error: 'Only image items can be translated.'
    }
  }

  const record = getClipboardRecord(item)
  const content = typeof record?.content === 'string' ? record.content : null
  const imageBase64 = content ? await readImageBase64FromSource(content) : null
  if (!imageBase64) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Image source is unavailable.'
    }
  }

  const run = await runNexusScene(COREBOX_SCREENSHOT_TRANSLATE_SCENE_ID, {
    input: {
      imageBase64,
      targetLang
    },
    capability: options.openPinWindow ? undefined : 'image.translate.e2e'
  })
  const translated = extractTranslatedImageFromSceneRun(run)
  if (!translated) {
    return {
      success: false,
      code: 'SCENE_UNAVAILABLE',
      error: 'Nexus image translate scene is unavailable.'
    }
  }

  const image = nativeImage.createFromBuffer(
    Buffer.from(translated.translatedImageBase64, 'base64')
  )
  if (image.isEmpty()) {
    return {
      success: false,
      code: 'IMAGE_UNAVAILABLE',
      error: 'Translated image payload is invalid.'
    }
  }

  if (options.openPinWindow) {
    await openImageTranslatePinWindow({
      translatedImageBase64: translated.translatedImageBase64,
      imageMimeType: translated.imageMimeType,
      sourceText: translated.sourceText,
      targetText: translated.targetText,
      overlay: translated.overlay
    })
  } else {
    clipboard.writeImage(image)
  }

  return {
    success: true,
    translatedImageBase64: translated.translatedImageBase64,
    sourceText: translated.sourceText,
    targetText: translated.targetText
  }
}
