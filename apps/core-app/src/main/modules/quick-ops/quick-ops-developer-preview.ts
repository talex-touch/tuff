import type { AppSetting } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '@talex-touch/utils/core-box/preview'
import type {
  QuickOpsDeveloperPreviewRequest,
  QuickOpsDeveloperPreviewResponse,
  QuickOpsDeveloperPreviewSaveRequest,
  QuickOpsDeveloperPreviewSaveResponse
} from '@talex-touch/utils/transport/events/types'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeLocale, StorageList, TuffInputType } from '@talex-touch/utils'
import {
  hasQuickOpsDeveloperCommand,
  QuickOpsDeveloperAbility
} from '@talex-touch/utils/core-box/preview'
import { app, clipboard } from 'electron'
import { getLocale } from '../../utils/i18n-helper'
import { getMainConfig } from '../storage'
import { extractQrSvg, isQrSvgPayload, renderQrSvgToPng } from './quick-ops-qr-png'

export const QUICK_OPS_DEVELOPER_POLICY_REASON = 'developer-tools-disabled-by-policy'

function assertDeveloperPreviewActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')
}

export async function createQuickOpsDeveloperPreviewResponse(
  request: QuickOpsDeveloperPreviewRequest,
  signal?: AbortSignal
): Promise<QuickOpsDeveloperPreviewResponse> {
  const query = request.query
  if (!hasQuickOpsDeveloperCommand(query)) {
    return {
      state: 'empty',
      reason: 'not-developer-command'
    }
  }

  if (isQuickOpsDeveloperToolsDisabled()) {
    return {
      state: 'blocked',
      reason: QUICK_OPS_DEVELOPER_POLICY_REASON
    }
  }

  assertDeveloperPreviewActive(signal)
  const ability = new QuickOpsDeveloperAbility()
  const sdkQuery = withQuickOpsDeveloperClipboardInput(query, signal)
  assertDeveloperPreviewActive(signal)
  const canHandle = await ability.canHandle(sdkQuery)
  if (!canHandle) {
    return {
      state: 'empty',
      reason: 'no-preview-result'
    }
  }

  assertDeveloperPreviewActive(signal)
  const context: PreviewAbilityContext = {
    query: sdkQuery,
    signal: signal ?? new AbortController().signal,
    locale: normalizeLocale(getLocale()) ?? 'en-US'
  }
  const result = await ability.execute(context)
  assertDeveloperPreviewActive(signal)
  if (!result) {
    return {
      state: 'empty',
      reason: 'no-preview-result'
    }
  }

  return {
    state: 'ready',
    abilityId: result.abilityId,
    confidence: result.confidence,
    payload: result.payload
  }
}

export async function saveQuickOpsDeveloperPreview(
  request: QuickOpsDeveloperPreviewSaveRequest,
  signal?: AbortSignal
): Promise<QuickOpsDeveloperPreviewSaveResponse> {
  assertDeveloperPreviewActive(signal)
  if (isQuickOpsDeveloperToolsDisabled()) {
    return { state: 'skipped', reason: QUICK_OPS_DEVELOPER_POLICY_REASON }
  }
  if (!isQrSvgPayload(request.payload)) {
    return {
      state: 'skipped',
      reason: 'not-qr-svg-payload'
    }
  }

  const svg = extractQrSvg(request.payload)
  if (!svg) {
    return {
      state: 'skipped',
      reason: 'invalid-qr-svg-payload'
    }
  }

  const data = request.format === 'png' ? renderQrSvgToPng(svg) : Buffer.from(svg, 'utf8')
  if (!data) {
    return {
      state: 'degraded',
      reason: 'qr-png-render-failed',
      message: '无法生成 QR PNG'
    }
  }

  let filePath: string | undefined
  try {
    assertDeveloperPreviewActive(signal)
    const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
    await mkdir(outputDir, { recursive: true })
    assertDeveloperPreviewActive(signal)
    filePath = path.join(outputDir, `qr-code-${crypto.randomUUID()}.${request.format}`)
    await writeFile(filePath, request.format === 'svg' ? svg : data, { flag: 'wx' })
    if (signal?.aborted) {
      await unlink(filePath).catch(() => undefined)
      throw new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')
    }
    clipboard.writeText(filePath)
    return {
      state: 'saved',
      format: request.format,
      path: filePath,
      bytes: data.length
    }
  } catch (error) {
    if (signal?.aborted) {
      if (filePath) await unlink(filePath).catch(() => undefined)
      throw new Error('PLUGIN_HOST_CAPABILITY_CANCELLED')
    }
    const code = (error as NodeJS.ErrnoException).code
    return {
      state: 'degraded',
      reason:
        code === 'EACCES' || code === 'EPERM'
          ? 'developer-preview-save-permission-denied'
          : 'developer-preview-save-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '保存预览文件失败'
    }
  }
}

function isQuickOpsDeveloperToolsDisabled(): boolean {
  const appSetting = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
  return appSetting?.quickOps?.allowDeveloperTools === false
}

function withQuickOpsDeveloperClipboardInput(
  query: QuickOpsDeveloperPreviewRequest['query'],
  signal?: AbortSignal
): QuickOpsDeveloperPreviewRequest['query'] {
  if (query.inputs?.some((input) => input.content?.trim() || input.rawContent?.trim())) {
    return query
  }
  assertDeveloperPreviewActive(signal)

  const text = clipboard.readText().trim()
  assertDeveloperPreviewActive(signal)
  if (!text) return query

  return {
    ...query,
    inputs: [
      ...(query.inputs ?? []),
      {
        type: TuffInputType.Text,
        content: text
      }
    ]
  }
}
