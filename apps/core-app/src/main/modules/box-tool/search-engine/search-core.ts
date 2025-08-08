import { AggregatedSection, ISearchEngine, ISearchSource, SearchContext, TuffItem } from './types'

export class SearchEngineCore implements ISearchEngine {
  private sources: Map<string, ISearchSource> = new Map()

  constructor() {
    console.log('[SearchEngineCore] constructor')
  }

  registerSource(source: ISearchSource): void {
    if (this.sources.has(source.name)) {
      console.warn(`[SearchEngineCore] Search source '${source.name}' is already registered.`)
      return
    }
    this.sources.set(source.name, source)
    source.onRegister?.(this)
    console.log(`[SearchEngineCore] Search source '${source.name}' registered.`)
  }

  unregisterSource(name: string): void {
    if (!this.sources.has(name)) {
      console.warn(`[SearchEngineCore] Search source '${name}' is not registered.`)
      return
    }
    const source = this.sources.get(name)
    source?.onDeactivate?.()
    this.sources.delete(name)
    console.log(`[SearchEngineCore] Search source '${name}' unregistered.`)
  }

  async search(context: SearchContext): Promise<AggregatedSection[]> {
    console.log('[SearchEngineCore] search', context.keyword)

    const allResults: TuffItem[] = []
    const searchPromises: Promise<TuffItem[]>[] = []

    for (const source of this.sources.values()) {
      searchPromises.push(source.onSearch(context))
    }

    const resultsBySource = await Promise.all(searchPromises)
    resultsBySource.forEach(result => allResults.push(...result))

    // TODO: Implement proper aggregation and sorting
    const aggregatedSection: AggregatedSection = {
      source: 'aggregated',
      layout: 'list',
      items: allResults
    }

    return [aggregatedSection]
  }

  maintain(): void {
    console.log('[SearchEngineCore] Starting maintenance...')
    for (const source of this.sources.values()) {
      source.onRefresh?.()
    }
  }
}
