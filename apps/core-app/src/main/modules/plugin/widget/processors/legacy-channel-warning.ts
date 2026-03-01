import type { DependencyValidationResult, WidgetCompilationContext } from '../widget-processor'
import { pushWidgetFeatureIssue } from '../widget-issue'

export const LEGACY_WIDGET_CHANNEL_PACKAGE = '@talex-touch/utils/channel'
export const LEGACY_WIDGET_CHANNEL_MIGRATION_TARGET = '@talex-touch/utils/transport/legacy'
const LEGACY_CHANNEL_IMPORT_WARNING_CODE = 'WIDGET_LEGACY_CHANNEL_IMPORT'

export function warnLegacyWidgetChannelImport(
  validation: DependencyValidationResult,
  context: WidgetCompilationContext,
  processorName: string
): void {
  if (!validation.allowedImports.includes(LEGACY_WIDGET_CHANNEL_PACKAGE)) {
    return
  }

  const { plugin, feature } = context
  const featureSource = `feature:${feature.id}`
  const alreadyWarned = plugin.issues.some(
    (issue) => issue.code === LEGACY_CHANNEL_IMPORT_WARNING_CODE && issue.source === featureSource
  )

  if (!alreadyWarned) {
    pushWidgetFeatureIssue(plugin, feature, {
      type: 'warning',
      code: LEGACY_CHANNEL_IMPORT_WARNING_CODE,
      message: `Deprecated widget dependency "${LEGACY_WIDGET_CHANNEL_PACKAGE}" detected.`,
      suggestion: `Prefer "${LEGACY_WIDGET_CHANNEL_MIGRATION_TARGET}" or "@talex-touch/utils/transport".`,
      meta: {
        from: LEGACY_WIDGET_CHANNEL_PACKAGE,
        to: LEGACY_WIDGET_CHANNEL_MIGRATION_TARGET
      }
    })
  }

  plugin.logger.warn(
    `[${processorName}] Deprecated dependency "${LEGACY_WIDGET_CHANNEL_PACKAGE}" detected for feature "${feature.id}". Prefer "${LEGACY_WIDGET_CHANNEL_MIGRATION_TARGET}".`
  )
}
