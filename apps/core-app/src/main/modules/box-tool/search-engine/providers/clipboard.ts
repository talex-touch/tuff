import {
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult,
  ProviderContext,
  TuffRender
} from '../types'
import { clipboardHistory } from '../../../../db/schema'
import { desc, like } from 'drizzle-orm'
import { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from '../../../../db/schema'

export class ClipboardProvider implements ISearchProvider {
  public readonly id = 'clipboard-history'
  public readonly type = 'history'
  public readonly name = 'Clipboard History'
  public readonly icon = 'ri:clipboard-line'

  private db!: LibSQLDatabase<typeof schema>

  async onLoad(context: ProviderContext): Promise<void> {
    this.db = context.databaseManager.getDb()
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    if (!this.db) {
      return {
        items: [],
        query,
        duration: 0,
        sources: [
          {
            providerId: this.id,
            providerName: this.name,
            duration: 0,
            resultCount: 0,
            status: 'success'
          }
        ]
      }
    }

    const keyword = query.text
    const startTime = Date.now()

    let results: (typeof clipboardHistory.$inferSelect)[]

    if (!keyword) {
      results = await this.db
        .select()
        .from(clipboardHistory)
        .orderBy(desc(clipboardHistory.timestamp))
        .limit(20)
    } else {
      results = await this.db
        .select()
        .from(clipboardHistory)
        .where(like(clipboardHistory.content, `%${keyword}%`))
        .orderBy(desc(clipboardHistory.timestamp))
        .limit(20)
    }

    const items = results.map((item) => this.transformToSearchItem(item))
    const duration = Date.now() - startTime

    return {
      items,
      query,
      duration,
      sources: [
        {
          providerId: this.id,
          providerName: this.name,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ]
    }
  }

  private transformToSearchItem(item: typeof clipboardHistory.$inferSelect): TuffItem {
    const render: TuffRender = {
      mode: 'default',
      basic: {
        title: ''
      }
    }

    let kind: TuffItem['kind'] = 'document'

    if (item.type === 'text') {
      kind = 'document'
      render.basic.title =
        item.content.length > 100 ? `${item.content.substring(0, 97)}...` : item.content
      render.basic.subtitle = `Text from ${item.sourceApp || 'Unknown'}`
      render.basic.icon = 'ri:file-text-line'
      render.preview = {
        type: 'panel',
        content: item.content
      }
    } else if (item.type === 'image') {
      kind = 'image'
      render.basic.title = `Image from ${item.sourceApp || 'Unknown'}`
      render.basic.icon = item.thumbnail || 'ri:image-line'
      render.preview = {
        type: 'panel',
        image: item.content // Full image data URL
      }
    } else if (item.type === 'files') {
      kind = 'file'
      try {
        const files = JSON.parse(item.content)
        if (files.length === 1) {
          const filePath = files[0]
          render.basic.title = typeof filePath === 'string' ? filePath.split(/[\\/]/).pop() || 'File' : 'File'
        } else {
          render.basic.title = `${files.length} files`
        }
      } catch {
        render.basic.title = 'Files from clipboard'
      }
      render.basic.icon = 'ri:file-copy-2-line'
    }

    return {
      id: `clipboard-${item.id}`,
      source: {
        id: this.id,
        type: this.type,
        name: this.name,
        icon: this.icon
      },
      kind,
      render,
      actions: [
        {
          id: 'paste',
          type: 'execute',
          label: 'Paste',
          shortcut: 'Enter'
        },
        {
          id: 'copy',
          type: 'copy',
          label: 'Copy',
          shortcut: 'CmdOrCtrl+C'
        }
      ],
      meta: {
        raw: item
      }
    }
  }
}