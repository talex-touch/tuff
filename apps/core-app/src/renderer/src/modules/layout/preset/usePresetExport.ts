import type { CoreBoxThemeConfig, LayoutAtomConfig, PresetExportData } from '@talex-touch/utils'
import { createPresetExport, validatePresetData } from '@talex-touch/utils'
import { appSettingsData } from '@talex-touch/utils/renderer/storage'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCoreBoxThemePreset } from '~/views/box/theme'
import { getLayoutAtomPreset, isLayoutPresetKey } from '~/modules/layout/atoms'

const openFileEvent = defineRawEvent<
  { title?: string; filters?: { name: string; extensions: string[] }[]; properties?: string[] },
  { filePaths?: string[] }
>('dialog:open-file')

const saveFileEvent = defineRawEvent<
  { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
  { filePath?: string }
>('dialog:save-file')

const writeFileEvent = defineRawEvent<{ path: string; data: string }, { success: boolean }>(
  'fs:write-file'
)
const readFileEvent = defineRawEvent<{ path: string }, { data?: string; error?: string }>(
  'fs:read-file'
)

/**
 * Composable for preset export/import functionality
 */
export function usePresetExport() {
  const { t } = useI18n()
  const transport = useTuffTransport()
  const isExporting = ref(false)
  const isImporting = ref(false)

  /**
   * Get current layout configuration
   */
  function getCurrentLayoutConfig(): LayoutAtomConfig | undefined {
    const saved = appSettingsData?.layoutAtomConfig
    if (saved?.preset === 'custom') return saved
    const layout = appSettingsData?.layout ?? 'simple'
    if (layout === 'custom') return saved ?? getLayoutAtomPreset('simple')
    return isLayoutPresetKey(layout) ? getLayoutAtomPreset(layout) : getLayoutAtomPreset('simple')
  }

  /**
   * Get current CoreBox theme configuration
   */
  function getCurrentCoreBoxConfig(): CoreBoxThemeConfig | undefined {
    const saved = appSettingsData?.coreBoxThemeConfig
    if (saved?.preset === 'custom') return saved
    return saved ?? getCoreBoxThemePreset('default')
  }

  /**
   * Export current preset to a JSON file
   */
  async function exportPreset(options?: {
    name?: string
    includeLayout?: boolean
    includeCoreBox?: boolean
  }) {
    const includeLayout = options?.includeLayout ?? true
    const includeCoreBox = options?.includeCoreBox ?? true

    if (!includeLayout && !includeCoreBox) {
      ElMessage.warning(t('preset.nothingToExport', 'Nothing selected to export'))
      return
    }

    isExporting.value = true
    try {
      // Prompt for preset name
      const name = options?.name || (await promptPresetName())
      if (!name) {
        isExporting.value = false
        return
      }

      // Create export data
      const preset = createPresetExport({
        name,
        layout: includeLayout ? getCurrentLayoutConfig() : undefined,
        coreBox: includeCoreBox ? getCurrentCoreBoxConfig() : undefined
      })

      // Show save dialog
      const result = await transport.send(saveFileEvent, {
        title: t('preset.exportTitle', 'Export Preset'),
        defaultPath: `${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.tpreset.json`,
        filters: [{ name: 'Tuff Preset', extensions: ['tpreset.json', 'json'] }]
      })

      if (!result.filePath) {
        isExporting.value = false
        return
      }

      // Write file
      await transport.send(writeFileEvent, {
        path: result.filePath,
        data: JSON.stringify(preset, null, 2)
      })

      ElMessage.success(t('preset.exportSuccess', 'Preset exported successfully'))
    } catch (error) {
      console.error('[PresetExport] Export failed:', error)
      ElMessage.error(t('preset.exportError', 'Failed to export preset'))
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Import preset from a JSON file
   */
  async function importPreset() {
    isImporting.value = true
    try {
      // Show open dialog
      const result = await transport.send(openFileEvent, {
        title: t('preset.importTitle', 'Import Preset'),
        filters: [{ name: 'Tuff Preset', extensions: ['tpreset.json', 'json'] }],
        properties: ['openFile']
      })

      if (!result.filePaths || result.filePaths.length === 0) {
        isImporting.value = false
        return
      }

      // Read file
      const fileResult = await transport.send(readFileEvent, { path: result.filePaths[0] })
      if (fileResult.error || !fileResult.data) {
        ElMessage.error(t('preset.readError', 'Failed to read preset file'))
        isImporting.value = false
        return
      }

      // Parse JSON
      let preset: unknown
      try {
        preset = JSON.parse(fileResult.data)
      } catch {
        ElMessage.error(t('preset.parseError', 'Invalid JSON format'))
        isImporting.value = false
        return
      }

      // Validate
      const validation = validatePresetData(preset)
      if (!validation.valid) {
        ElMessage.error(
          t('preset.validationError', 'Invalid preset: ') + validation.errors.join(', ')
        )
        isImporting.value = false
        return
      }

      if (validation.warnings.length > 0) {
        console.warn('[PresetExport] Import warnings:', validation.warnings)
      }

      // Confirm import
      const presetData = preset as PresetExportData
      await confirmAndApplyPreset(presetData)
    } catch (error) {
      console.error('[PresetExport] Import failed:', error)
      ElMessage.error(t('preset.importError', 'Failed to import preset'))
    } finally {
      isImporting.value = false
    }
  }

  /**
   * Prompt user for preset name
   */
  async function promptPresetName(): Promise<string | null> {
    try {
      const result = await ElMessageBox.prompt(
        t('preset.namePrompt', 'Enter a name for your preset'),
        t('preset.exportPreset', 'Export Preset'),
        {
          confirmButtonText: t('common.confirm', 'Confirm'),
          cancelButtonText: t('common.cancel', 'Cancel'),
          inputPlaceholder: t('preset.namePlaceholder', 'My Custom Preset'),
          inputValidator: (val) => {
            if (!val || !val.trim()) return t('preset.nameRequired', 'Name is required')
            return true
          }
        }
      )
      return result.value?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * Confirm and apply imported preset
   */
  async function confirmAndApplyPreset(preset: PresetExportData) {
    const parts: string[] = []
    if (preset.layout) parts.push(t('preset.layout', 'Layout'))
    if (preset.coreBox) parts.push(t('preset.coreBox', 'CoreBox Theme'))

    try {
      const confirmMsg = t('preset.importConfirm', {
        name: preset.meta.name,
        parts: parts.join(', ')
      })
      await ElMessageBox.confirm(confirmMsg, t('preset.importPreset', 'Import Preset'), {
        confirmButtonText: t('common.import', 'Import'),
        cancelButtonText: t('common.cancel', 'Cancel'),
        type: 'warning'
      })

      // Apply preset
      applyPreset(preset)
      ElMessage.success(t('preset.importSuccess', 'Preset imported successfully'))
    } catch {
      // User cancelled
    }
  }

  /**
   * Apply preset data to current settings
   */
  function applyPreset(preset: PresetExportData) {
    if (!appSettingsData) return

    if (preset.layout) {
      appSettingsData.layoutAtomConfig = { ...preset.layout, preset: 'custom' }
      appSettingsData.layout = 'custom'
    }

    if (preset.coreBox) {
      appSettingsData.coreBoxThemeConfig = { ...preset.coreBox, preset: 'custom' }
    }
  }

  return {
    isExporting,
    isImporting,
    exportPreset,
    importPreset,
    getCurrentLayoutConfig,
    getCurrentCoreBoxConfig
  }
}
