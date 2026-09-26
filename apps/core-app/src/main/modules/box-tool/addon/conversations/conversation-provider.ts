import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffAction,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ConversationSearchHit } from '../../../conversation/conversation-store'
import type { ProviderContext } from '../../search-engine/types'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffItemBuilder, TuffSearchResultBuilder } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  getAppDestinationNavigationService,
  normalizeConversationId
} from '../../../app-destination/app-destination-navigation'
import { searchConversations } from '../../../conversation/conversation-store'
import { t } from '../../../../utils/i18n-helper'

const conversationLog = getLogger('conversation-provider')

/** Item id shape: `conversation:<id>`. The action carries the same id under its own prefix. */
const CONVERSATION_ITEM_ID_PREFIX = 'conversation:'
const CONVERSATION_ACTION_PREFIX = 'open-conversation:'

const CONVERSATION_ICON = 'i-ri-chat-3-line'

/**
 * Searches the conversations the MainWindow already holds, so the command bar can reach a thread
 * by what was said in it rather than only by browsing the sidebar.
 *
 * Deliberately *not* a second conversation list: rows are produced only from a query, and a
 * title-or-content hit is the whole match rule. That keeps the provider stateless — nothing to
 * hydrate, nothing to keep in sync with the sidebar — and keeps the CoreBox free of a second
 * "recent chats" grid competing with recommendations.
 */
export class ConversationProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'conversation-provider'
  readonly type = 'history' as const
  readonly name = 'Conversations'
  readonly supportedInputTypes = [TuffInputType.Text]
  readonly priority = 'fast' as const

  private context: ProviderContext | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startedAt = performance.now()
    const rawText = query.text?.trim() ?? ''
    if (signal.aborted || !rawText) {
      return this.createResult(query, [], startedAt, 'success')
    }

    let hits: ConversationSearchHit[]
    try {
      hits = await searchConversations(rawText)
    } catch (error) {
      // A failed source must not take the search down with it: the rest of the results are still
      // what the user asked for, and the source row says this one did not answer.
      conversationLog.warn('Conversation search failed', { error })
      return this.createResult(query, [], startedAt, 'error')
    }

    // The abort can land while the query is in flight; a dropped batch is the correct answer then.
    if (signal.aborted) {
      return this.createResult(query, [], startedAt, 'success')
    }

    return this.createResult(
      query,
      hits.map((hit) => this.buildConversationItem(hit, rawText)),
      startedAt,
      'success'
    )
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const conversationId = this.resolveExecuteConversationId(args)
    if (!conversationId) {
      return null
    }

    const context = this.context
    if (!context) {
      conversationLog.warn('Conversation navigation requested before provider load')
      return null
    }

    // Fire and forget: the row's job is to move the user, and the navigation service reports its
    // own failures to the log rather than to a return value nobody displays.
    getAppDestinationNavigationService(context.touchApp).openConversation(conversationId)
    return null
  }

  /**
   * Which conversation a row or an action names, or `null` for a forged/unparseable id.
   *
   * Both carriers are allowlisted rather than trusted: the item id is what an honest rebuild
   * emits, and the action id is what a row's own primary action carries. `normalizeConversationId`
   * is the same boundary the navigation service applies, so a crafted id cannot reach a route.
   */
  private resolveExecuteConversationId(args: IExecuteArgs): string | null {
    const actionId = typeof args.actionId === 'string' ? args.actionId : ''
    if (actionId) {
      return actionId.startsWith(CONVERSATION_ACTION_PREFIX)
        ? normalizeConversationId(actionId.slice(CONVERSATION_ACTION_PREFIX.length))
        : null
    }

    const itemId = typeof args.item?.id === 'string' ? args.item.id : ''
    if (itemId.startsWith(CONVERSATION_ITEM_ID_PREFIX)) {
      return normalizeConversationId(itemId.slice(CONVERSATION_ITEM_ID_PREFIX.length))
    }

    const metaConversationId = args.item?.meta?.extension?.conversationId
    return normalizeConversationId(metaConversationId)
  }

  private buildConversationItem(hit: ConversationSearchHit, rawQueryText: string): TuffItem {
    // An untitled thread is a real state (the title is generated after the first turn), and a blank
    // row in the list reads as a rendering bug rather than as a conversation.
    const title = hit.title.trim() || t('shell.history.untitled')
    const action: TuffAction = {
      id: `${CONVERSATION_ACTION_PREFIX}${hit.id}`,
      type: 'execute',
      label: title,
      primary: true
    }

    const builder = new TuffItemBuilder(
      `${CONVERSATION_ITEM_ID_PREFIX}${hit.id}`,
      this.type,
      this.id
    )
      .setKind('command')
      .setTitle(title)
      .setIcon({
        type: 'class',
        value: CONVERSATION_ICON
      })
      .setActions([action])
      .setMeta({
        extension: {
          conversationId: hit.id,
          matchResult: literalMatchRanges(title, rawQueryText),
          /**
           * A content hit has a title the query never reached, so the ranker would score the row
           * at zero and the excerpt would carry no weight at all. Handing the excerpt over as a
           * search token is what makes "the words are in this conversation" a real match — the
           * ranker scores tokens below a visible title match, which is the order we want.
           */
          searchTokens: hit.excerpt ? [hit.excerpt] : []
        }
      })

    if (hit.excerpt) {
      builder.setSubtitle(hit.excerpt)
    }

    return builder.build()
  }

  private createResult(
    query: TuffQuery,
    items: TuffItem[],
    startedAt: number,
    status: 'success' | 'error'
  ): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: items.length,
          status
        }
      ])
      .build()
  }
}

/**
 * Where the query literally appears in the title, for the highlight only.
 *
 * No fuzzy pass: a conversation's title is free text, so a pinyin or typo-tolerant highlight could
 * paint characters the user never typed. A content hit has no title match at all, which is the
 * honest answer — the excerpt under it shows where the words came from.
 */
function literalMatchRanges(
  title: string,
  rawQueryText: string
): Array<{
  start: number
  end: number
}> {
  const needle = rawQueryText.trim().toLowerCase()
  if (!needle) return []

  const start = title.toLowerCase().indexOf(needle)
  return start < 0 ? [] : [{ start, end: start + needle.length }]
}

export const conversationProvider = new ConversationProvider()
