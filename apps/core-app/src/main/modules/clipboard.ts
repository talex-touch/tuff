import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NativeImage } from 'electron'
import type * as schema from '../db/schema'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { DataCode } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { clipboard, nativeImage } from 'electron'
import { genTouchChannel } from '../core/channel-core'
import { clipboardHistory, clipboardHistoryMeta } from '../db/schema'
import { BaseModule } from './abstract-base-module'
import { coreBoxManager } from './box-tool/core-box/manager'
import { windowManager } from './box-tool/core-box/window'
import { databaseModule } from './database'
import { ocrService } from './ocr/ocr-service'
import { activeAppService } from './system/active-app'

const FILE_URL_FORMATS = new Set([
  'public.file-url',
  'public.file-url-multiple',
  'text/uri-list',
  'text/x-moz-url',
  'NSFilenamesPboardType',
  'com.apple.pasteboard.promised-file-url',
])

const IMAGE_FORMATS = new Set([
  'public.tiff',
  'public.png',
  'public.jpeg',
  'public.heic',
  'image/png',
  'image/jpeg',
  'image/webp',
  'NSTIFFPboardType',
])

const TEXT_FORMATS = new Set([
  'public.utf8-plain-text',
  'public.utf16-plain-text',
  'text/plain',
  'text/html',
  'public.html',
  'NSStringPboardType',
])

interface ClipboardMetaEntry {
  key: string
  value: unknown
}

function includesAny(formats: string[], candidates: Set<string>): boolean {
  return formats.some(format => candidates.has(format))
}

export interface IClipboardItem {
  id?: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  rawContent?: string | null
  sourceApp?: string | null
  timestamp?: Date
  isFavorite?: boolean | null
  metadata?: string | null
  meta?: Record<string, unknown> | null
}

interface ClipboardApplyPayload {
  item?: Partial<IClipboardItem> & { type?: IClipboardItem['type'] }
  text?: string
  html?: string | null
  type?: IClipboardItem['type']
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

const PAGE_SIZE = 20
const CACHE_MAX_COUNT = 20
const CACHE_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

const execFileAsync = promisify(execFile)

class ClipboardHelper {
  private lastText: string = clipboard.readText()
  private lastImageHash: string = clipboard.readImage().toDataURL()
  private lastFiles: string[] = this.readClipboardFiles()

  public readClipboardFiles(): string[] {
    const raw = clipboard.read('public.file-url').toString()
    if (!raw)
      return []
    return raw
      .split(/\r\n|\n|\r/)
      .filter(Boolean)
      .map((url) => {
        try {
          return decodeURI(new URL(url).pathname)
        }
        catch {
          return ''
        }
      })
      .filter(Boolean)
  }

  public didFilesChange(nextFiles: string[]): boolean {
    if (nextFiles.length === 0)
      return false
    if (
      nextFiles.length === this.lastFiles.length
      && nextFiles.every((file, index) => file === this.lastFiles[index])
    ) {
      return false
    }
    this.lastFiles = [...nextFiles]
    return true
  }

  public getLastFilesSnapshot(): string[] {
    return [...this.lastFiles]
  }

  public didImageChange(image: NativeImage): boolean {
    if (image.isEmpty())
      return false
    const hash = image.toDataURL()
    if (hash === this.lastImageHash)
      return false
    this.lastImageHash = hash
    return true
  }

  public primeImage(image: NativeImage | null): void {
    this.lastImageHash = image && !image.isEmpty() ? image.toDataURL() : ''
  }

  public primeFiles(files: string[]): void {
    this.lastFiles = [...files]
  }

  public didTextChange(text: string): boolean {
    if (!text || text === this.lastText)
      return false
    this.lastText = text
    return true
  }

  public markText(text: string): void {
    this.lastText = text
  }
}

export class ClipboardModule extends BaseModule {
  private memoryCache: IClipboardItem[] = []
  private intervalId: NodeJS.Timeout | null = null
  private isDestroyed = false
  private clipboardHelper?: ClipboardHelper
  private db?: LibSQLDatabase<typeof schema>

  static key: symbol = Symbol.for('Clipboard')
  name: ModuleKey = ClipboardModule.key

  constructor() {
    super(ClipboardModule.key, {
      create: true,
      dirName: 'clipboard',
    })
  }

  private async hydrateWithMeta<T extends { id?: number | null, metadata?: string | null }>(
    rows: readonly T[],
  ): Promise<Array<T & { meta: Record<string, unknown> | null }>> {
    if (!this.db || rows.length === 0) {
      return rows.map(row => ({ ...row, meta: null }))
    }

    const ids = rows.map(item => item.id).filter((id): id is number => typeof id === 'number')

    const metaMap = new Map<number, Record<string, unknown>>()

    if (ids.length > 0) {
      const metaRows = await this.db
        .select()
        .from(clipboardHistoryMeta)
        .where(inArray(clipboardHistoryMeta.clipboardId, ids))

      for (const metaRow of metaRows) {
        if (typeof metaRow.clipboardId !== 'number')
          continue
        const existing = metaMap.get(metaRow.clipboardId) ?? {}
        try {
          existing[metaRow.key] = metaRow.value ? JSON.parse(metaRow.value) : null
        }
        catch {
          existing[metaRow.key] = metaRow.value
        }
        metaMap.set(metaRow.clipboardId, existing)
      }
    }

    return rows.map((row) => {
      let fallback: Record<string, unknown> | null = null
      if (typeof row.metadata === 'string' && row.metadata.trim().length > 0) {
        try {
          fallback = JSON.parse(row.metadata)
        }
        catch {
          fallback = null
        }
      }

      const meta = row.id ? (metaMap.get(row.id) ?? fallback) : fallback
      return {
        ...row,
        meta: meta ?? null,
      }
    })
  }

  private async loadInitialCache() {
    if (!this.db)
      return

    const rows = await this.db
      .select()
      .from(clipboardHistory)
      .orderBy(desc(clipboardHistory.timestamp))
      .limit(CACHE_MAX_COUNT)

    this.memoryCache = await this.hydrateWithMeta(rows)
  }

  private updateMemoryCache(item: IClipboardItem) {
    this.memoryCache.unshift(item)
    if (this.memoryCache.length > CACHE_MAX_COUNT) {
      this.memoryCache.pop()
    }
    const oneHourAgo = Date.now() - CACHE_MAX_AGE_MS
    this.memoryCache = this.memoryCache.filter((i) => {
      const ts = i.timestamp
      if (!ts)
        return false
      const timeValue = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
      return Number.isFinite(timeValue) && timeValue > oneHourAgo
    })
  }

  private parseFileList(content?: string | null): string[] {
    if (!content)
      return []
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (entry): entry is string => typeof entry === 'string' && entry.length > 0,
        )
      }
    }
    catch (error) {
      console.debug('[Clipboard] Failed to parse file list from clipboard item:', error)
    }
    return []
  }

  private normalizeApplyPayload(payload: ClipboardApplyPayload): IClipboardItem {
    if (!payload) {
      throw new Error('Clipboard apply payload is missing.')
    }

    const base = payload.item ?? {}
    const derivedType = payload.type ?? base.type ?? (payload.files ? 'files' : undefined)
    let resolvedType: IClipboardItem['type'] | null = derivedType ?? null

    if (!resolvedType) {
      if (payload.text !== undefined || payload.html !== undefined) {
        resolvedType = 'text'
      }
    }

    if (!resolvedType) {
      throw new Error('Unable to resolve clipboard content type for auto paste.')
    }

    if (resolvedType === 'text') {
      const content = payload.text ?? base.content ?? ''
      const rawContent = payload.html ?? base.rawContent ?? null
      return {
        type: 'text',
        content,
        rawContent,
      }
    }

    if (resolvedType === 'image') {
      const content = base.content ?? payload.text
      if (!content) {
        throw new Error('Image clipboard item is missing data URL content.')
      }
      return {
        type: 'image',
        content,
      }
    }

    const files = payload.files ?? this.parseFileList(base.content)
    if (!files.length) {
      throw new Error('File clipboard item has no file paths to apply.')
    }

    return {
      type: 'files',
      content: JSON.stringify(files),
    }
  }

  private writeItemToClipboard(item: IClipboardItem, payload: ClipboardApplyPayload): void {
    if (item.type === 'text') {
      const html = item.rawContent ?? payload.html ?? undefined
      clipboard.write({
        text: item.content ?? '',
        html: html ?? undefined,
      })
      this.clipboardHelper?.markText(item.content ?? '')
      return
    }

    if (item.type === 'image') {
      const image = nativeImage.createFromDataURL(item.content)
      if (image.isEmpty()) {
        throw new Error('Image clipboard item could not be reconstructed.')
      }
      clipboard.writeImage(image)
      this.clipboardHelper?.primeImage(image)
      return
    }

    const files = this.parseFileList(item.content)
    if (!files.length) {
      throw new Error('File clipboard item is empty.')
    }

    const resolvedPaths = files.map((filePath) => {
      try {
        return path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
      }
      catch {
        return filePath
      }
    })

    const fileUrlContent = resolvedPaths
      .map(filePath => pathToFileURL(filePath).toString())
      .join('\n')
    const buffer = Buffer.from(fileUrlContent, 'utf8')

    try {
      for (const format of ['public.file-url', 'public.file-url-multiple', 'text/uri-list']) {
        clipboard.writeBuffer(format, buffer)
      }
    }
    catch (error) {
      console.warn('[Clipboard] Failed to populate file clipboard formats:', error)
    }

    // Ensure at least the path text is available as a fallback.
    clipboard.write({ text: resolvedPaths[0] ?? '' })
    this.clipboardHelper?.primeFiles(resolvedPaths)
  }

  private async wait(ms: number): Promise<void> {
    if (!ms || ms <= 0)
      return
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  private async simulatePasteCommand(): Promise<void> {
    try {
      if (process.platform === 'darwin') {
        await execFileAsync('osascript', [
          '-e',
          'tell application "System Events" to keystroke "v" using {command down}',
        ])
        return
      }

      if (process.platform === 'win32') {
        const script
          = '$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys(\'^v\')'
        await execFileAsync('powershell', ['-NoLogo', '-NonInteractive', '-Command', script])
        return
      }

      if (process.platform === 'linux') {
        await execFileAsync('xdotool', ['key', '--clearmodifiers', 'ctrl+v'])
        return
      }

      throw new Error(`Auto paste is not supported on platform: ${process.platform}`)
    }
    catch (error) {
      console.error('[Clipboard] Failed to simulate paste command:', error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  private async applyToActiveApp(payload: ClipboardApplyPayload): Promise<void> {
    const item = this.normalizeApplyPayload(payload)

    this.writeItemToClipboard(item, payload)

    if (payload.hideCoreBox !== false) {
      try {
        coreBoxManager.trigger(false)
      }
      catch (error) {
        console.debug('[Clipboard] Failed to hide CoreBox before auto paste:', error)
      }
    }

    const delay = Number.isFinite(payload.delayMs) ? Math.max(0, Number(payload.delayMs)) : 150
    await this.wait(delay)

    await this.simulatePasteCommand()
  }

  private mergeMetadataString(
    original: string | null | undefined,
    patch: Record<string, unknown>,
  ): string {
    let base: Record<string, unknown> = {}
    if (original) {
      try {
        base = JSON.parse(original)
      }
      catch {
        base = {}
      }
    }
    return JSON.stringify({ ...base, ...patch })
  }

  private handleMetaPatch = (clipboardId: number, patch: Record<string, unknown>): void => {
    const index = this.memoryCache.findIndex(entry => entry.id === clipboardId)
    if (index === -1)
      return

    const current = this.memoryCache[index]
    const nextMeta = { ...(current.meta ?? {}), ...patch }
    const metadata = this.mergeMetadataString(current.metadata, patch)

    this.memoryCache[index] = {
      ...current,
      meta: nextMeta,
      metadata,
    }
  }

  private async persistMetaEntries(
    clipboardId: number,
    meta: Record<string, unknown>,
  ): Promise<void> {
    if (!this.db)
      return
    const values = Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        clipboardId,
        key,
        value: JSON.stringify(value ?? null),
      }))

    if (values.length === 0)
      return

    await this.db.insert(clipboardHistoryMeta).values(values)
  }

  public async saveVirtualEntry({
    content,
    rawContent,
    source = 'virtual',
    meta,
  }: {
    content: string
    rawContent?: string | null
    source?: string
    meta?: Record<string, unknown>
  }): Promise<IClipboardItem | null> {
    if (!this.db)
      return null

    const metaEntries: ClipboardMetaEntry[] = [{ key: 'source', value: source }]
    if (meta) {
      for (const [key, value] of Object.entries(meta)) {
        metaEntries.push({ key, value })
      }
    }

    const mergedMeta: Record<string, unknown> = {}
    for (const entry of metaEntries) {
      mergedMeta[entry.key] = entry.value
    }

    const metadata = this.mergeMetadataString(null, mergedMeta)
    const record = {
      type: 'text' as const,
      content,
      rawContent: rawContent ?? null,
      thumbnail: null,
      timestamp: new Date(),
      sourceApp: 'Talex Touch',
      isFavorite: false,
      metadata,
    }

    const inserted = await this.db.insert(clipboardHistory).values(record).returning()
    if (inserted.length === 0) {
      return null
    }

    const persisted = inserted[0] as IClipboardItem
    persisted.meta = mergedMeta

    if (persisted.id) {
      await this.persistMetaEntries(persisted.id, mergedMeta)
    }

    this.updateMemoryCache(persisted)

    const touchChannel = genTouchChannel()
    for (const win of windowManager.windows) {
      if (!win.window.isDestroyed()) {
        touchChannel.sendToMain(win.window, 'clipboard:new-item', persisted)
      }
    }

    return persisted
  }

  private startClipboardMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.intervalId = setInterval(this.checkClipboard.bind(this), 1000)
    this.registerIpcHandlers()
  }

  private async checkClipboard(): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) {
      return
    }

    const helper = this.clipboardHelper
    const formats = clipboard.availableFormats()
    if (formats.length === 0) {
      return
    }

    const metaEntries: ClipboardMetaEntry[] = [{ key: 'formats', value: formats }]
    let item: Omit<IClipboardItem, 'timestamp' | 'id' | 'metadata' | 'meta'> | null = null

    // Priority: IMAGE -> FILES -> TEXT
    // Check for standalone image first
    if (includesAny(formats, IMAGE_FORMATS)) {
      const image = clipboard.readImage()
      if (helper.didImageChange(image)) {
        if (includesAny(formats, FILE_URL_FORMATS)) {
          const files = helper.readClipboardFiles()
          helper.primeFiles(files)
        }
        helper.markText('')
        const size = image.getSize()
        metaEntries.push({ key: 'image_size', value: size })
        item = {
          type: 'image',
          content: image.toDataURL(),
          thumbnail: image.resize({ width: 128 }).toDataURL(),
        }
      }
    }

    // Then check for files (only if no image detected)
    if (!item && includesAny(formats, FILE_URL_FORMATS)) {
      const files = helper.readClipboardFiles()
      if (helper.didFilesChange(files)) {
        const serialized = JSON.stringify(files)
        let thumbnail: string | undefined
        let imageSize: { width: number, height: number } | undefined

        if (includesAny(formats, IMAGE_FORMATS)) {
          const image = clipboard.readImage()
          if (!image.isEmpty()) {
            helper.primeImage(image)
            imageSize = image.getSize()
            thumbnail = image.resize({ width: 128 }).toDataURL()
          }
          else {
            helper.primeImage(null)
          }
        }
        else {
          helper.primeImage(null)
        }

        helper.markText('')
        metaEntries.push({ key: 'file_count', value: files.length })
        metaEntries.push({ key: 'has_sidecar_image', value: Boolean(thumbnail) })
        if (imageSize) {
          metaEntries.push({ key: 'image_size', value: imageSize })
        }
        item = {
          type: 'files',
          content: serialized,
          thumbnail,
        }
      }
    }

    if (!item && includesAny(formats, TEXT_FORMATS)) {
      const text = clipboard.readText()
      if (helper.didTextChange(text)) {
        const html = clipboard.readHTML()
        metaEntries.push({ key: 'text_length', value: text.length })
        if (html) {
          metaEntries.push({ key: 'html_length', value: html.length })
        }
        item = {
          type: 'text',
          content: text,
          rawContent: html || null,
        }
      }
    }

    if (!item) {
      return
    }

    try {
      const activeApp = await activeAppService.getActiveApp()
      if (activeApp) {
        item.sourceApp = activeApp.bundleId || activeApp.identifier || activeApp.displayName || null

        const activeAppMeta = {
          bundleId: activeApp.bundleId ?? null,
          displayName: activeApp.displayName ?? null,
          processId: activeApp.processId ?? null,
          executablePath: activeApp.executablePath ?? null,
          icon: activeApp.icon ?? null,
        }

        for (const [key, value] of Object.entries(activeAppMeta)) {
          if (value !== null && value !== undefined) {
            metaEntries.push({ key: `source_${key}`, value })
          }
        }

        metaEntries.push({ key: 'source', value: activeAppMeta })
      }
    }
    catch (error) {
      console.error('[Clipboard] Failed to resolve active app info:', error)
    }

    const metaObject: Record<string, unknown> = {}
    for (const { key, value } of metaEntries) {
      if (value === undefined)
        continue
      metaObject[key] = value
    }

    const metadataPayload = Object.keys(metaObject).length > 0 ? JSON.stringify(metaObject) : null
    const record = {
      ...item,
      metadata: metadataPayload,
      timestamp: new Date(),
    }

    const inserted = await this.db.insert(clipboardHistory).values(record).returning()
    if (inserted.length === 0) {
      return
    }

    const persisted = inserted[0] as IClipboardItem
    persisted.meta = metaObject

    if (persisted.id) {
      await this.persistMetaEntries(persisted.id, metaObject)
      await ocrService.enqueueFromClipboard({
        clipboardId: persisted.id,
        item: persisted,
        formats,
      })
    }

    this.updateMemoryCache(persisted)

    const touchChannel = genTouchChannel()
    for (const win of windowManager.windows) {
      if (!win.window.isDestroyed()) {
        touchChannel.sendToMain(win.window, 'clipboard:new-item', persisted)
      }
    }

    const activePlugin = windowManager.getAttachedPlugin()
    if (activePlugin?._uniqueChannelKey) {
      touchChannel
        .sendToPlugin(activePlugin.name, 'core-box:clipboard-change', { item: persisted })
        .catch((error) => {
          console.warn('[Clipboard] Failed to notify plugin UI view about clipboard change:', error)
        })
    }
  }

  private registerIpcHandlers(): void {
    const touchChannel = genTouchChannel()

    const registerHandlers = (type: ChannelType) => {
      touchChannel.regChannel(type, 'clipboard:get-latest', async ({ reply }) => {
        const latest = this.memoryCache.length > 0 ? this.memoryCache[0] : null
        reply(DataCode.SUCCESS, latest)
      })

      touchChannel.regChannel(type, 'clipboard:get-history', async ({ data: payload, reply }) => {
        const { page = 1 } = payload ?? {}
        const offset = (page - 1) * PAGE_SIZE
        const historyRows = await this.db!.select().from(clipboardHistory).orderBy(desc(clipboardHistory.timestamp)).limit(PAGE_SIZE).offset(offset)
        const history = await this.hydrateWithMeta(historyRows)
        const totalResult = await this.db!.select({ count: sql<number>`count(*)` }).from(
          clipboardHistory,
        )
        const total = totalResult[0]?.count ?? 0
        reply(DataCode.SUCCESS, { history, total, page, pageSize: PAGE_SIZE })
      })

      touchChannel.regChannel(type, 'clipboard:set-favorite', async ({ data, reply }) => {
        const { id, isFavorite } = data ?? {}
        await this.db!.update(clipboardHistory).set({ isFavorite }).where(eq(clipboardHistory.id, id))
        reply(DataCode.SUCCESS, null)
      })

      touchChannel.regChannel(type, 'clipboard:delete-item', async ({ data, reply }) => {
        const { id } = data ?? {}
        await this.db!.delete(clipboardHistory).where(eq(clipboardHistory.id, id))
        this.memoryCache = this.memoryCache.filter(item => item.id !== id)
        reply(DataCode.SUCCESS, null)
      })

      touchChannel.regChannel(type, 'clipboard:clear-history', async ({ reply }) => {
        const oneHourAgo = new Date(Date.now() - CACHE_MAX_AGE_MS)
        await this.db!.delete(clipboardHistory).where(gt(clipboardHistory.timestamp, oneHourAgo))
        this.memoryCache = []
        reply(DataCode.SUCCESS, null)
      })

      touchChannel.regChannel(type, 'clipboard:apply-to-active-app', async ({ data, reply }) => {
        try {
          await this.applyToActiveApp((data ?? {}) as ClipboardApplyPayload)
          reply(DataCode.SUCCESS, { success: true })
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          reply(DataCode.ERROR, { success: false, message })
        }
      })

      touchChannel.regChannel(type, 'clipboard:write-text', async ({ data, reply }) => {
        try {
          clipboard.writeText((data?.text ?? '') as string)
          reply(DataCode.SUCCESS, null)
        }
        catch (error) {
          reply(DataCode.ERROR, (error as Error).message)
        }
      })

      // 通用查询接口：按 source 筛选 clipboard 记录
      touchChannel.regChannel(type, 'clipboard:query-by-source', async ({ data, reply }) => {
        if (!this.db) {
          reply(DataCode.ERROR, null)
          return
        }

        const { source, limit: requestedLimit } = data ?? {}
        if (!source) {
          reply(DataCode.ERROR, { error: 'source parameter is required' })
          return
        }

        const limit = Math.min(Math.max(requestedLimit ?? 5, 1), 50) // 限制最多50条

        const idRows = await this.db
          .select({ clipboardId: clipboardHistoryMeta.clipboardId })
          .from(clipboardHistoryMeta)
          .where(
            and(
              eq(clipboardHistoryMeta.key, 'source'),
              eq(clipboardHistoryMeta.value, JSON.stringify(source)),
            ),
          )
          .orderBy(desc(clipboardHistoryMeta.createdAt))
          .limit(limit)

        const ids = idRows.map(row => row.clipboardId).filter((id): id is number => !!id)
        if (ids.length === 0) {
          reply(DataCode.SUCCESS, [])
          return
        }

        const rows = await this.db
          .select()
          .from(clipboardHistory)
          .where(inArray(clipboardHistory.id, ids))
          .orderBy(desc(clipboardHistory.timestamp))

        const history = await this.hydrateWithMeta(rows)
        reply(DataCode.SUCCESS, history)
      })

      // 通用查询接口：按 meta key-value 筛选 clipboard 记录
      touchChannel.regChannel(type, 'clipboard:query-by-meta', async ({ data, reply }) => {
        if (!this.db) {
          reply(DataCode.ERROR, null)
          return
        }

        const { key, value, limit: requestedLimit } = data ?? {}
        if (!key) {
          reply(DataCode.ERROR, { error: 'key parameter is required' })
          return
        }

        const limit = Math.min(Math.max(requestedLimit ?? 5, 1), 50) // 限制最多50条

        const whereConditions = value !== undefined
          ? and(
              eq(clipboardHistoryMeta.key, key),
              eq(clipboardHistoryMeta.value, JSON.stringify(value)),
            )
          : eq(clipboardHistoryMeta.key, key)

        const idRows = await this.db
          .select({ clipboardId: clipboardHistoryMeta.clipboardId })
          .from(clipboardHistoryMeta)
          .where(whereConditions)
          .orderBy(desc(clipboardHistoryMeta.createdAt))
          .limit(limit)

        const ids = idRows.map(row => row.clipboardId).filter((id): id is number => !!id)
        if (ids.length === 0) {
          reply(DataCode.SUCCESS, [])
          return
        }

        const rows = await this.db
          .select()
          .from(clipboardHistory)
          .where(inArray(clipboardHistory.id, ids))
          .orderBy(desc(clipboardHistory.timestamp))

        const history = await this.hydrateWithMeta(rows)
        reply(DataCode.SUCCESS, history)
      })
    }

    registerHandlers(ChannelType.MAIN)
    registerHandlers(ChannelType.PLUGIN)
  }

  public destroy(): void {
    this.isDestroyed = true
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  onInit(): MaybePromise<void> {
    this.db = databaseModule.getDb()
    this.clipboardHelper = new ClipboardHelper()
    this.startClipboardMonitoring()
    this.loadInitialCache()
    ocrService
      .start()
      .catch(error => console.error('[Clipboard] Failed to start OCR service:', error))
    ocrService.registerClipboardMetaListener(this.handleMetaPatch)
  }

  onDestroy(): MaybePromise<void> {
    this?.destroy()
  }
}

const clipboardModule = new ClipboardModule()

export default clipboardModule
export { clipboardModule }
