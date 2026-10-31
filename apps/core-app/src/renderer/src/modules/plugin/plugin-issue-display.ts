import type { PluginIssue } from '@talex-touch/utils/plugin'
import { isI18nMessage, resolveI18nMessage } from '@talex-touch/utils/i18n'
import {
  CURRENT_SDK_VERSION,
  INTERACTION_EXCLUSIVITY_STRICT_MIN_VERSION,
  OMNI_TRANSFER_DECLARATIVE_MIN_VERSION,
  PERMISSION_ENFORCEMENT_MIN_VERSION
} from '@talex-touch/utils/plugin'
import { WIDGET_ALLOWED_PACKAGES } from '@talex-touch/utils/plugin/widget'
import { PLUGIN_SDK_BLOCKED_CODE } from '../../../../shared/plugin-sdk-blocked'
import type { Translate } from '~/modules/lang'
import { resolvePermissionDisplayName } from '~/modules/permission/permission-request-card'

/**
 * A plugin's issues as the plugin pages show them.
 *
 * Main records an issue with a code, the place it came from, its details as `meta`, and an English
 * sentence written for the plugin's developer. The pages word the issue from its code and details in
 * the interface language, add what to do about it where main has advice, and keep the code and
 * main's sentence beneath as the technical detail. An issue whose code has no words here reads as an
 * error or a warning, with its sentence beneath.
 */

/** The fields these words read; main's issues, a load error and a widget failure all have them. */
export interface PluginIssueLike {
  type?: PluginIssue['type'] | string
  code?: string | null
  source?: string | null
  message?: string | null
  suggestion?: string | null
  meta?: unknown
}

interface PluginWithIssues {
  loadError?: { code?: string | null; message?: string | null } | null
  issues?: PluginIssueLike[] | null
}

export interface PluginIssueDisplay {
  /** What happened, in the interface language. */
  title: string
  /** What to do about it, in the interface language; empty when there is nothing to add. */
  advice: string
  /** The issue's code and main's own sentence, kept beneath the words; empty when it has neither. */
  detail: string
}

interface IssueWords {
  title: string
  advice?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function joinList(items: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

/** A policy reason main reports as an identifier, in the interface language when there are words for it. */
function blockReason(reason: string, t: Translate): string {
  const key = `plugin.permissions.searchProviders.blockReasons.${reason}`
  const word = t(key)
  return word === key ? reason : word
}

function blockedSentence(
  provider: string,
  reasons: unknown,
  t: Translate,
  locale: string
): string | null {
  const words = stringList(reasons).map((reason) => blockReason(reason, t))
  if (!provider || words.length === 0) return null
  return t('plugin.permissions.searchProviders.issues.blocked', {
    provider,
    reasons: joinList(words, locale)
  })
}

function permissionSentence(
  provider: string,
  permissionIds: unknown,
  t: Translate,
  locale: string
): string | null {
  const permissions = stringList(permissionIds).map((id) => resolvePermissionDisplayName(id, t))
  if (!provider || permissions.length === 0) return null
  return t('plugin.permissions.searchProviders.issues.permissionMissing', {
    provider,
    permissions: joinList(permissions, locale)
  })
}

/**
 * The sentence for a search source's registration issue, built from the fields main reports with
 * it. Null for an issue it has no words for, or one that arrived without the fields its sentence
 * needs; the search sources page then shows main's message, and the issue list its generic words.
 */
export function describeSearchProviderIssue(
  issue: Pick<PluginIssueLike, 'code' | 'meta'>,
  provider: string,
  t: Translate,
  locale: string
): string | null {
  const meta = isRecord(issue.meta) ? issue.meta : {}

  switch (issue.code) {
    case 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE': {
      const features = stringList(meta.featureIds)
      if (features.length === 0) return null
      return t('plugin.permissions.searchProviders.issues.derived', {
        features: joinList(features, locale)
      })
    }
    case 'SEARCH_PROVIDER_PARTIAL_PUSH_FEATURE_COVERAGE': {
      const features = stringList(meta.featureIds)
      if (features.length === 0) return null
      return t('plugin.permissions.searchProviders.issues.uncovered', {
        features: joinList(features, locale)
      })
    }
    case 'SEARCH_PROVIDER_INVALID':
      return typeof meta.index === 'number'
        ? t('plugin.permissions.searchProviders.issues.invalidEntry', { position: meta.index + 1 })
        : t('plugin.permissions.searchProviders.issues.invalidList')
    case 'SEARCH_PROVIDER_POLICY_BLOCKED':
      return blockedSentence(provider, meta.issues, t, locale)
    case 'SEARCH_PROVIDER_PERMISSION_MISSING':
      return permissionSentence(provider, meta.missingPermissionIds, t, locale)
    case 'SEARCH_PROVIDER_ID_COLLISION':
      return provider
        ? t('plugin.permissions.searchProviders.issues.idCollision', { provider })
        : null
    default:
      return null
  }
}

/**
 * Why the sdkapi gate blocked the plugin. The version is shown as main normalised it where main
 * reports one, and as the manifest declares it otherwise: an outdated 20230101 reads as 230101,
 * the version it was compared as, while an invalid or unsupported one reads as written.
 */
function sdkapiWords(meta: Record<string, unknown>, t: Translate): IssueWords {
  const declaredValue = meta.resolvedVersion ?? meta.declaredVersion
  const declared =
    declaredValue === undefined || declaredValue === null ? '' : String(declaredValue)
  const advice = t('plugin.issues.advice.updateSdkapi', {
    current: meta.currentVersion ?? CURRENT_SDK_VERSION
  })

  switch (meta.reason) {
    case 'missing-sdkapi':
      return { title: t('plugin.issues.sdkapi.missing'), advice }
    case 'invalid-sdkapi':
      if (declared) return { title: t('plugin.issues.sdkapi.invalid', { declared }), advice }
      break
    case 'outdated-sdkapi':
      if (declared) {
        return {
          title: t('plugin.issues.sdkapi.outdated', {
            declared,
            minimum: PERMISSION_ENFORCEMENT_MIN_VERSION
          }),
          advice
        }
      }
      break
    case 'unsupported-sdkapi':
      if (declared) return { title: t('plugin.issues.sdkapi.unsupported', { declared }), advice }
      break
  }
  return { title: t('plugin.issues.sdkapi.incompatible'), advice }
}

/**
 * A runtime issue is known by where it happened rather than by its code: a lifecycle call can fail
 * with any code, a Node error such as ENOENT included. `stage` is a lifecycle hook, one of the two
 * calls Tuff makes into the plugin's runtime, or the runtime's own start, crash or stop.
 */
function runtimeWords(stage: string, code: string, t: Translate): IssueWords | null {
  switch (stage) {
    case 'activation':
      return {
        title: t('plugin.issues.runtime.activation'),
        // A prelude that is missing, stale or broken is fixed by building the plugin again.
        advice: code.startsWith('PLUGIN_RUNTIME_PRELUDE_') ? t('plugin.issues.advice.rebuild') : ''
      }
    case 'crash':
      return { title: t('plugin.issues.runtime.crash') }
    case 'teardown':
      return {
        title:
          code === 'PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED'
            ? t('plugin.issues.runtime.cleanup')
            : t('plugin.issues.runtime.stop')
      }
    case 'loadPluginView':
      return { title: t('plugin.issues.runtime.view') }
    case 'registerWidget':
      return { title: t('plugin.issues.runtime.widget') }
    case '':
      return null
    default:
      return { title: t('plugin.issues.runtime.hook', { hook: stage }) }
  }
}

function issueWords(issue: PluginIssueLike, t: Translate, locale: string): IssueWords | null {
  const code = issue.code?.trim() ?? ''
  const source = issue.source?.trim() ?? ''
  const meta = isRecord(issue.meta) ? issue.meta : {}

  if (source.startsWith('runtime:') && code !== 'AUTO_DISABLED_EXCESSIVE_ERRORS') {
    return runtimeWords(source.slice('runtime:'.length), code, t)
  }

  switch (code) {
    // manifest.json
    case 'NAME_MISMATCH':
      return {
        title: t('plugin.issues.manifest.nameMismatch'),
        advice: t('plugin.issues.advice.renameToMatch')
      }
    case 'MANIFEST_MISSING_VERSION':
      return { title: t('plugin.issues.manifest.versionMissing') }
    case 'PLUGIN_STORAGE_SYNC_MANIFEST_INVALID':
      return {
        title: t('plugin.issues.manifest.storageSyncInvalid'),
        advice: t('plugin.issues.advice.storageSync')
      }
    case PLUGIN_SDK_BLOCKED_CODE:
      return sdkapiWords(meta, t)
    case 'CATEGORY_MISSING':
      return {
        title: t('plugin.issues.manifest.categoryMissing'),
        advice: t('plugin.issues.categoryMissingDesc')
      }
    case 'UNKNOWN_PERMISSION_IDS': {
      const ids = stringList(meta.unknownIds)
      if (ids.length === 0) return null
      return {
        title: t('plugin.issues.manifest.unknownPermissions', { ids: joinList(ids, locale) }),
        advice: t('plugin.issues.advice.checkPermissionIds')
      }
    }
    case 'PERMISSION_MISSING':
      return {
        title: t('plugin.issues.manifest.permissionsNotGranted'),
        advice: t('plugin.issues.advice.grantPermissions')
      }
    case 'MISSING_WEBCONTENT_ENTRY':
      return {
        title: t('plugin.issues.manifest.webcontentMissing'),
        advice: meta.archivePath
          ? t('plugin.issues.advice.restorePackage')
          : t('plugin.issues.advice.reinstall')
      }
    case 'INVALID_MANIFEST_JSON':
      return { title: t('plugin.issues.manifest.invalidJson') }
    case 'DUPLICATE_PLUGIN_NAME':
      return {
        title: t('plugin.issues.manifest.duplicateName'),
        advice: t('plugin.issues.advice.uniqueName')
      }
    case 'PLUGIN_LOAD_FAILED':
      return { title: t('plugin.issues.manifest.metadataInvalid') }
    case 'PLUGIN_ICON_LOAD_FAILED':
      return { title: t('plugin.issues.manifest.iconFailed') }

    // A feature's declaration
    case 'OMNI_TRANSFER_SDK_TOO_LOW':
      return {
        title: t('plugin.issues.feature.omniTransferIgnored', {
          required: meta.requiredSdkapi ?? OMNI_TRANSFER_DECLARATIVE_MIN_VERSION
        })
      }
    case 'FEATURE_PLATFORM_EXCLUDED':
      return { title: t('plugin.issues.feature.platformExcluded') }
    case 'PLUGIN_MANIFEST_INTERACTION_CONFLICT':
      return { title: t('plugin.issues.feature.interactionConflict') }
    case 'PLUGIN_MANIFEST_INTERACTION_CONFLICT_WARN':
      return {
        title: t('plugin.issues.feature.interactionConflictWarn', {
          strict: INTERACTION_EXCLUSIVITY_STRICT_MIN_VERSION
        })
      }
    case 'INVALID_FEATURE_COMMANDS':
      return { title: t('plugin.issues.feature.invalidCommands') }
    case 'FEATURE_ADD_FAILED':
      return { title: t('plugin.issues.feature.addFailed') }
    case 'FEATURE_ICON_LOAD_FAILED':
      return { title: t('plugin.issues.feature.iconFailed') }
    case 'INVALID_VIEW_PATH':
      return {
        title: t('plugin.issues.feature.invalidViewPath'),
        advice: t('plugin.issues.advice.fixInteractionPath')
      }

    // Development mode
    case 'DEV_SOURCE_FALLBACK_LOCAL':
      return {
        title: t('plugin.issues.dev.sourceFallback'),
        advice: t('plugin.issues.advice.checkDevServer')
      }
    case 'REMOTE_MANIFEST_FAILED':
      return {
        title: t('plugin.issues.dev.manifestFailed'),
        advice: t('plugin.issues.advice.checkDevServerManifest')
      }
    case 'DEV_ADDRESS_INVALID':
      return {
        title: t('plugin.issues.dev.addressInvalid'),
        advice: t('plugin.issues.advice.fixDevAddress')
      }
    case 'DEV_MODE_ACTIVE':
      return { title: t('plugin.issues.dev.modeActive') }
    case 'DEV_VIEW_NOT_ALLOWED':
      return {
        title: t('plugin.issues.dev.viewNotAllowed'),
        advice: t('plugin.issues.advice.useLoopback')
      }
    case 'DEV_SERVER_DISCONNECTED':
      // Main words the advice itself, in the shared message table.
      return { title: t('plugin.devServerDisconnected') }

    // Search sources and indexed sources
    case 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE':
    case 'SEARCH_PROVIDER_PARTIAL_PUSH_FEATURE_COVERAGE':
    case 'SEARCH_PROVIDER_INVALID':
    case 'SEARCH_PROVIDER_POLICY_BLOCKED':
    case 'SEARCH_PROVIDER_PERMISSION_MISSING': {
      const provider = typeof meta.providerId === 'string' ? meta.providerId : ''
      const title = describeSearchProviderIssue(issue, provider, t, locale)
      if (!title) return null
      if (code === 'SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE') {
        return { title, advice: t('plugin.issues.advice.declareSearchProviders') }
      }
      if (code === 'SEARCH_PROVIDER_PARTIAL_PUSH_FEATURE_COVERAGE') {
        return { title, advice: t('plugin.issues.advice.coverPushFeatures') }
      }
      if (code === 'SEARCH_PROVIDER_PERMISSION_MISSING') {
        return { title, advice: t('plugin.issues.advice.declarePermissions') }
      }
      return { title }
    }
    case 'INDEXED_SOURCE_PERMISSION_MISSING': {
      const sourceId = typeof meta.sourceId === 'string' ? meta.sourceId : ''
      const title = permissionSentence(sourceId, meta.missingPermissionIds, t, locale)
      return title ? { title, advice: t('plugin.issues.advice.declarePermissions') } : null
    }
    case 'INDEXED_SOURCE_ADMISSION_BLOCKED': {
      const sourceId = typeof meta.sourceId === 'string' ? meta.sourceId : ''
      const title = blockedSentence(sourceId, meta.admissionIssues, t, locale)
      return title ? { title } : null
    }
    case 'INDEXED_SOURCE_INVALID':
      if (typeof meta.sourceId === 'string' && meta.sourceId) {
        return {
          title: t('plugin.issues.indexedSources.incompleteEntry', { source: meta.sourceId })
        }
      }
      return {
        title:
          typeof meta.index === 'number'
            ? t('plugin.issues.indexedSources.invalidEntry', { position: meta.index + 1 })
            : t('plugin.issues.indexedSources.invalidList')
      }

    // Loading and running the plugin
    case 'PLUGIN_RUNTIME_DRIFT':
      return {
        title: t('plugin.issues.runtime.drift'),
        advice: t('plugin.issues.advice.rebuild')
      }
    case 'LOADER_FATAL':
      return { title: t('plugin.issues.runtime.loaderFailed') }
    case 'AUTO_DISABLED_EXCESSIVE_ERRORS':
      return { title: t('plugin.issues.runtime.autoDisabled') }

    // Widgets
    case 'WIDGET_PATH_MISSING':
      return { title: t('plugin.issues.widget.pathMissing') }
    case 'WIDGET_DEV_ADDRESS_MISSING':
      return { title: t('plugin.issues.widget.devAddressMissing') }
    case 'WIDGET_PATH_INVALID':
      return { title: t('plugin.issues.widget.pathInvalid') }
    case 'WIDGET_NOT_FOUND':
      return { title: t('plugin.issues.widget.notFound') }
    case 'WIDGET_READ_FAILED':
      return { title: t('plugin.issues.widget.readFailed') }
    case 'WIDGET_REMOTE_PATH_INVALID':
      return { title: t('plugin.issues.widget.remotePathInvalid') }
    case 'WIDGET_REMOTE_FETCH_FAILED':
      return { title: t('plugin.issues.widget.remoteFetchFailed') }
    case 'WIDGET_UNSUPPORTED_TYPE':
      return {
        title: t('plugin.issues.widget.unsupportedType'),
        advice: t('plugin.issues.advice.widgetFileTypes')
      }
    case 'WIDGET_INVALID_DEPENDENCY': {
      const advice = t('plugin.issues.advice.widgetPackages', {
        packages: joinList(WIDGET_ALLOWED_PACKAGES, locale)
      })
      // A widget failure carries the code without the module the issue named.
      if (typeof meta.module !== 'string' || !meta.module)
        return { title: t('plugin.issues.widget.compileFailed'), advice }
      return {
        title: t('plugin.issues.widget.invalidDependency', { module: meta.module }),
        advice
      }
    }
    case 'WIDGET_COMPILE_SKIPPED':
      return {
        title: t('plugin.issues.widget.compileSkipped'),
        advice: t('plugin.issues.advice.checkWidgetPath')
      }
    case 'WIDGET_COMPILE_FAILED':
      return {
        title: t('plugin.issues.widget.compileFailed'),
        advice: t('plugin.issues.advice.checkWidgetSource')
      }
    case 'WIDGET_COMPILER_BINARY_UNAVAILABLE':
      return { title: t('plugin.issues.widget.compilerUnavailable') }
    case 'WIDGET_COMPILER_SERVICE_UNAVAILABLE':
      return { title: t('plugin.issues.widget.compilerServiceUnavailable') }
    case 'WIDGET_SOURCE_MISSING':
      // Main also reports a missing source it could do without: the package carries the widget
      // already compiled, and that output is used.
      return {
        title: meta.compiledPath
          ? t('plugin.issues.widget.sourceMissingPrecompiled')
          : t('plugin.issues.widget.sourceMissing')
      }
    case 'WIDGET_REGISTER_FAILED':
      return { title: t('plugin.issues.widget.registerFailed') }
    case 'WIDGET_RUNTIME_REGISTER_FAILED':
      return { title: t('plugin.issues.widget.runtimeRegisterFailed') }
    case 'WIDGET_PRECOMPILED_MISSING':
      return {
        title: t('plugin.issues.widget.precompiledMissing'),
        advice: t('plugin.issues.advice.rebuild')
      }
    case 'WIDGET_PRECOMPILED_STALE':
      return {
        title: t('plugin.issues.widget.precompiledStale'),
        advice: t('plugin.issues.advice.rebuild')
      }
    case 'WIDGET_PRECOMPILED_INTEGRITY_MISMATCH':
      return {
        title: t('plugin.issues.widget.precompiledMismatch'),
        advice: t('plugin.issues.advice.rebuild')
      }
    case 'WIDGET_RUNTIME_COMPILE_DISABLED':
      return {
        title: t('plugin.issues.widget.runtimeCompileDisabled'),
        advice: t('plugin.issues.advice.rebuild')
      }
    case 'WIDGET_UNUSED_FILES':
      return {
        title: t('plugin.issues.widget.unusedFiles'),
        advice: t('plugin.issues.advice.removeUnusedWidgets')
      }
    case 'WIDGET_SCAN_FAILED':
      return { title: t('plugin.issues.widget.scanFailed') }
  }

  // A load error copied from an activation failure arrives without the issue's source.
  if (code.startsWith('PLUGIN_RUNTIME_')) return runtimeWords('activation', code, t)
  return null
}

/** Main's own words, sent as an `$i18n:` key into the shared message table; empty for anything else. */
function sharedWords(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  return isI18nMessage(text) ? resolveI18nMessage(text) : ''
}

function issueDetail(issue: PluginIssueLike): string {
  const code = issue.code?.trim() ?? ''
  const raw = issue.message?.trim() ?? ''
  // A `$i18n:` message is main's words rather than what it saw; what it saw is in `meta.error`.
  const message = isI18nMessage(raw)
    ? isRecord(issue.meta) && typeof issue.meta.error === 'string'
      ? issue.meta.error.trim()
      : ''
    : raw
  if (!code) return message
  if (!message) return code
  return message.includes(code) ? message : `${code} · ${message}`
}

export function describePluginIssue(
  issue: PluginIssueLike,
  t: Translate,
  locale: string
): PluginIssueDisplay {
  const words = issueWords(issue, t, locale)
  const title =
    words?.title ||
    sharedWords(issue.message) ||
    (issue.type === 'error' ? t('plugin.issues.unknownError') : t('plugin.issues.unknownWarning'))
  return {
    title,
    advice: words?.advice || sharedWords(issue.suggestion),
    detail: issueDetail(issue)
  }
}

/**
 * The plugin's load error. Main records it as a copy of one of the plugin's issues, without the
 * details its words need, so the issue it copies is worded while the plugin still has it.
 */
export function describePluginLoadError(
  plugin: PluginWithIssues,
  t: Translate,
  locale: string
): PluginIssueDisplay | null {
  const loadError = plugin.loadError
  if (!loadError || (!loadError.code && !loadError.message)) return null
  const issue = loadError.code
    ? plugin.issues?.find((candidate) => candidate.code === loadError.code)
    : undefined
  return describePluginIssue(
    issue ?? { type: 'error', code: loadError.code, message: loadError.message },
    t,
    locale
  )
}

/**
 * Why the plugin's sdkapi keeps it from running. The issue main recorded carries the reason and the
 * versions; the load error copied from it does not, so the issue is read first.
 */
export function describePluginSdkBlock(
  plugin: PluginWithIssues,
  t: Translate,
  locale: string
): string {
  const issue =
    plugin.issues?.find((candidate) => candidate.code === PLUGIN_SDK_BLOCKED_CODE) ??
    (plugin.loadError?.code === PLUGIN_SDK_BLOCKED_CODE
      ? { type: 'error', ...plugin.loadError }
      : { type: 'error', code: PLUGIN_SDK_BLOCKED_CODE })
  return describePluginIssue(issue, t, locale).title
}
