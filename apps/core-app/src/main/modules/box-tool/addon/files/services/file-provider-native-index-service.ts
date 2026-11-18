export {
  FileProviderNativeBridge,
  validateDeferredWorkerEntries,
  type FileProviderNativeBridgeOptions
} from './native-index/file-provider-native-bridge'
export {
  FileProviderNativeIndexService,
  type FileProviderNativeIndexServiceDeps
} from './native-index/file-provider-native-index-service'
export {
  NativeScanPolicy,
  buildNativeScanFilterOptions,
  hasExcludedPathSegment,
  isSearchableNativeEntry,
  resolveRelativeSearchPath,
  type CompatibleNativeScanFilterOptions
} from './native-index/native-scan-policy'
