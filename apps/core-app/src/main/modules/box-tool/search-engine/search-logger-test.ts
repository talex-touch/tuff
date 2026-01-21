import { searchLogger } from './search-logger'

/**
 * Test function for search logger functionality
 * This can be called to verify that the logger is working correctly
 */
export function testSearchLogger(): void {
  console.log('🧪 Testing Enhanced Search Engine Logger...')

  // Test complete search session
  searchLogger.searchSessionStart('test query', 'test-session-123')

  // Test keyword analysis
  searchLogger.logKeywordAnalysis('test query', ['test', 'query'], 0)

  // Test search phases
  searchLogger.logSearchPhase('Initialization', 'Setting up search aggregator')
  searchLogger.logSearchPhase('Gatherer Setup', 'Initializing 3 providers')
  searchLogger.logSearchPhase('Worker Pool', 'Starting 3 workers')
  searchLogger.logSearchPhase('FTS Search', 'Provider: file-provider, Query: "test query"')

  // Test search engine core logs
  searchLogger.searchProviders(['file-provider', 'app-provider'])
  searchLogger.searchUpdate(false, 5)
  searchLogger.searchUpdate(true, 10)

  // Test search gatherer logs
  searchLogger.gathererStart(3, 'test query')
  searchLogger.workerStart(0)
  searchLogger.workerProcessing(0, 'file-provider')
  searchLogger.providerCall('file-provider')
  searchLogger.providerResult('file-provider', 5)
  searchLogger.resultReceived(5)
  searchLogger.firstBatch(50)
  searchLogger.allProvidersComplete()
  searchLogger.workerComplete(0)

  // Test file provider logs
  searchLogger.logProviderSearch('file-provider', 'test query', 'File System')
  searchLogger.fileSearchStart('test query')
  searchLogger.fileSearchText('test query', 0)
  searchLogger.filePreciseSearch(['test', 'query'])
  searchLogger.filePreciseQueries(2)
  searchLogger.filePreciseResults([3, 2])
  searchLogger.fileFtsQuery('test query')
  searchLogger.fileFtsResults(5, 25)
  searchLogger.fileDataFetch(10)
  searchLogger.fileDataResults(8, 15)

  // Test search index logs
  searchLogger.indexSearchStart('file-provider', 'test query', 50)
  searchLogger.indexSearchExecuting()
  searchLogger.indexSearchComplete(5, 30)

  // Test search session end
  searchLogger.searchSessionEnd('test-session-123', 15)

  console.log('✅ Enhanced Search Engine Logger test completed!')
}

export function testSearchLoggerLifecycle(): void {
  // Manual validation helper:
  // - Call after StorageModule is ready.
  // - Ensure init/destroy do not throw and do not duplicate subscriptions.
  try {
    const logger = searchLogger
    logger.isEnabled()
    logger.destroy()
  } catch (error) {
    console.error('[SearchLoggerTest] lifecycle validation failed', error)
  }
}

// Export for potential use in development
export { testSearchLogger as default }
