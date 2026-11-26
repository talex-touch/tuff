<script lang="ts" name="TdsThemePackSection" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  TDS_DEFAULT_THEME_PACK,
  TDS_DEFAULT_THEME_PACK_ID,
  useTdsThemePack,
  type TdsThemeCanvasPattern,
  type TdsThemePack,
  type TdsThemeWindowPreference
} from '~/modules/tds-theme'

const emits = defineEmits<{
  (e: 'apply-window-preference', preference: TdsThemeWindowPreference): void
}>()

const { t } = useI18n()

const {
  activePackId,
  allPacks,
  selectPack,
  importPackJson,
  exportPackJson,
  removeCustomPack,
  resetPack
} = useTdsThemePack()

const syncWindowMaterial = ref(false)
const importPanelOpen = ref(false)
const importDraft = ref('')
const importErrors = ref<string[]>([])
const exportedJson = ref('')
const statusMessage = ref('')

const BUILTIN_PACK_I18N: Readonly<Record<string, { nameKey: string; descKey: string }>> = {
  'tds-apple-neutral': {
    nameKey: 'themeStyle.tdsPack.pack.appleNeutralName',
    descKey: 'themeStyle.tdsPack.pack.appleNeutralDesc'
  },
  'tds-obsidian-cobalt': {
    nameKey: 'themeStyle.tdsPack.pack.obsidianCobaltName',
    descKey: 'themeStyle.tdsPack.pack.obsidianCobaltDesc'
  },
  'tds-paper-ink': {
    nameKey: 'themeStyle.tdsPack.pack.paperInkName',
    descKey: 'themeStyle.tdsPack.pack.paperInkDesc'
  },
  'tds-graphite-emerald': {
    nameKey: 'themeStyle.tdsPack.pack.graphiteEmeraldName',
    descKey: 'themeStyle.tdsPack.pack.graphiteEmeraldDesc'
  }
}

const isDefaultActive = computed(() => activePackId.value === TDS_DEFAULT_THEME_PACK_ID)

function getPackName(pack: TdsThemePack): string {
  const entry = BUILTIN_PACK_I18N[pack.meta.id]
  return entry ? t(entry.nameKey, pack.meta.name) : pack.meta.name
}

function getPackDescription(pack: TdsThemePack): string {
  const entry = BUILTIN_PACK_I18N[pack.meta.id]
  return entry ? t(entry.descKey, pack.meta.description) : pack.meta.description
}

function getPatternLabel(pattern: TdsThemeCanvasPattern | undefined): string {
  switch (pattern) {
    case 'none':
      return t('themeStyle.tdsPack.patternNone', 'Clean')
    case 'grid':
      return t('themeStyle.tdsPack.patternGrid', 'Grid')
    case 'paper-grain':
      return t('themeStyle.tdsPack.patternPaperGrain', 'Paper grain')
    case 'dots':
    default:
      return t('themeStyle.tdsPack.patternDots', 'Dots')
  }
}

function getLightSwatches(pack: TdsThemePack): string[] {
  const light = pack.tokens.light
  const fallback = TDS_DEFAULT_THEME_PACK.tokens.light
  return [
    light.bg ?? fallback.bg!,
    light.surface ?? fallback.surface!,
    light.primary ?? fallback.primary!,
    light.textPrimary ?? fallback.textPrimary!
  ]
}

function getDarkSwatches(pack: TdsThemePack): string[] {
  const dark = pack.tokens.dark
  const fallback = TDS_DEFAULT_THEME_PACK.tokens.dark
  return [dark.bg ?? fallback.bg!, dark.primary ?? fallback.primary!]
}

function isPackActive(pack: TdsThemePack): boolean {
  return activePackId.value === pack.meta.id
}

function handleSelectPack(pack: TdsThemePack): void {
  const selected = selectPack(pack.meta.id, {
    onWindowPreference: syncWindowMaterial.value
      ? (pref) => emits('apply-window-preference', pref)
      : undefined
  })
  if (selected) {
    statusMessage.value = ''
  }
}

function toggleImportPanel(): void {
  importPanelOpen.value = !importPanelOpen.value
  importErrors.value = []
  if (importPanelOpen.value) {
    exportedJson.value = ''
  }
}

function cancelImport(): void {
  importPanelOpen.value = false
  importErrors.value = []
}

function handleImportSubmit(): void {
  importErrors.value = []
  const result = importPackJson(importDraft.value, {
    select: true,
    onWindowPreference: syncWindowMaterial.value
      ? (pref) => emits('apply-window-preference', pref)
      : undefined
  })

  if (!result.valid) {
    importErrors.value =
      result.errors.length > 0
        ? result.errors
        : [t('themeStyle.tdsPack.importFailed', 'Theme pack validation failed.')]
    return
  }

  importDraft.value = ''
  importPanelOpen.value = false
  statusMessage.value = t('themeStyle.tdsPack.importSuccess', 'Theme pack imported and applied.')
}

async function handleExportJson(): Promise<void> {
  const json = exportPackJson(activePackId.value)
  if (!json) {
    return
  }

  exportedJson.value = json
  importPanelOpen.value = false
  importErrors.value = []

  try {
    if (hasNavigator() && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json)
      statusMessage.value = t(
        'themeStyle.tdsPack.exportCopied',
        'Theme pack JSON copied to clipboard.'
      )
    }
  } catch {
    // Fallback readonly panel remains visible so the user can copy manually.
  }
}

function closeExportPanel(): void {
  exportedJson.value = ''
}

function handleResetPack(): void {
  resetPack()
  if (syncWindowMaterial.value && TDS_DEFAULT_THEME_PACK.material?.windowPreference) {
    emits('apply-window-preference', TDS_DEFAULT_THEME_PACK.material.windowPreference)
  }
  statusMessage.value = t(
    'themeStyle.tdsPack.resetSuccess',
    'Reset to Apple Neutral default theme pack.'
  )
}

function handleRemoveCustom(id: string): void {
  removeCustomPack(id)
}
</script>

<template>
  <TuffGroupBlock
    :name="t('themeStyle.tdsPack.groupTitle', 'Theme Packs')"
    :description="
      t(
        'themeStyle.tdsPack.groupDesc',
        'Switch declarative palette, surface pattern, and material presets verified for WCAG AA contrast.'
      )
    "
  >
    <div class="TdsThemePack-Body">
      <div class="TdsThemePack-Grid" role="list">
        <div
          v-for="pack in allPacks"
          :key="pack.meta.id"
          class="TdsThemePack-CardSlot"
          role="listitem"
        >
          <button
            type="button"
            class="TdsThemePack-Card"
            :class="{ 'is-active': isPackActive(pack) }"
            :aria-pressed="isPackActive(pack)"
            :data-testid="`tds-theme-pack-card-${pack.meta.id}`"
            @click="handleSelectPack(pack)"
          >
            <div class="TdsThemePack-CardTop">
              <div class="TdsThemePack-SwatchRow" aria-hidden="true">
                <span
                  v-for="(color, index) in getLightSwatches(pack)"
                  :key="`light-${index}`"
                  class="TdsThemePack-SwatchDot"
                  :style="{ backgroundColor: color }"
                />
                <span class="TdsThemePack-SwatchDivider" />
                <span
                  v-for="(color, index) in getDarkSwatches(pack)"
                  :key="`dark-${index}`"
                  class="TdsThemePack-SwatchDot TdsThemePack-SwatchDot--dark"
                  :style="{ backgroundColor: color }"
                />
              </div>

              <div class="TdsThemePack-Badges">
                <span
                  class="TdsThemePack-AaBadge"
                  :title="t('themeStyle.tdsPack.wcagTooltip', 'WCAG 2.1 AA contrast verified')"
                >
                  <span class="i-ri-shield-check-line" aria-hidden="true" />
                  <span>{{ t('themeStyle.tdsPack.wcagBadge', 'AA') }}</span>
                </span>
                <span
                  v-if="isPackActive(pack)"
                  class="TdsThemePack-ActiveMark"
                  :aria-label="t('themeStyle.tdsPack.active', 'Active')"
                >
                  <span class="i-ri-check-line" aria-hidden="true" />
                </span>
              </div>
            </div>

            <div class="TdsThemePack-CardMeta">
              <div class="TdsThemePack-CardTitle">{{ getPackName(pack) }}</div>
              <p v-if="getPackDescription(pack)" class="TdsThemePack-CardDesc">
                {{ getPackDescription(pack) }}
              </p>
            </div>

            <div class="TdsThemePack-CardFoot">
              <span class="TdsThemePack-FootItem">
                {{ getPatternLabel(pack.surface?.canvasPattern) }}
              </span>
              <span class="TdsThemePack-FootDot" aria-hidden="true">·</span>
              <span class="TdsThemePack-FootItem">
                {{
                  pack.meta.builtIn
                    ? t('themeStyle.tdsPack.builtIn', 'Built-in')
                    : t('themeStyle.tdsPack.custom', 'Custom')
                }}
              </span>
            </div>
          </button>

          <button
            v-if="!pack.meta.builtIn"
            type="button"
            class="TdsThemePack-RemoveBtn"
            :aria-label="t('themeStyle.tdsPack.removeCustom', 'Remove custom pack')"
            :title="t('themeStyle.tdsPack.removeCustom', 'Remove custom pack')"
            :data-testid="`tds-theme-pack-remove-${pack.meta.id}`"
            @click="handleRemoveCustom(pack.meta.id)"
          >
            <span class="i-ri-delete-bin-line" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="TdsThemePack-Actions">
        <TxButton
          variant="bare"
          native-type="button"
          class="TdsThemePack-ActionBtn"
          data-testid="tds-theme-pack-import-toggle"
          @click="toggleImportPanel"
        >
          <span class="i-ri-upload-2-line" aria-hidden="true" />
          <span>{{ t('themeStyle.tdsPack.importJson', 'Import JSON') }}</span>
        </TxButton>

        <TxButton
          variant="bare"
          native-type="button"
          class="TdsThemePack-ActionBtn"
          data-testid="tds-theme-pack-export-btn"
          @click="handleExportJson"
        >
          <span class="i-ri-download-2-line" aria-hidden="true" />
          <span>{{ t('themeStyle.tdsPack.exportJson', 'Export JSON') }}</span>
        </TxButton>

        <TxButton
          variant="bare"
          native-type="button"
          class="TdsThemePack-ActionBtn"
          :disabled="isDefaultActive"
          data-testid="tds-theme-pack-reset-btn"
          @click="handleResetPack"
        >
          <span class="i-ri-restart-line" aria-hidden="true" />
          <span>{{ t('themeStyle.tdsPack.reset', 'Reset') }}</span>
        </TxButton>
      </div>

      <div
        v-if="importPanelOpen"
        class="TdsThemePack-Drawer"
        data-testid="tds-theme-pack-import-panel"
      >
        <textarea
          v-model="importDraft"
          class="TdsThemePack-JsonArea"
          rows="6"
          spellcheck="false"
          :placeholder="
            t(
              'themeStyle.tdsPack.importPlaceholder',
              'Paste a TDS Theme Pack JSON payload (schemaVersion: 1)...'
            )
          "
          data-testid="tds-theme-pack-import-input"
        />

        <div
          v-if="importErrors.length > 0"
          class="TdsThemePack-ErrorBox"
          role="alert"
          data-testid="tds-theme-pack-import-error"
        >
          <div class="TdsThemePack-ErrorHeader">
            <span class="i-ri-error-warning-line" aria-hidden="true" />
            <span>{{ t('themeStyle.tdsPack.importFailed', 'Theme pack validation failed.') }}</span>
          </div>
          <ul class="TdsThemePack-ErrorList">
            <li v-for="(err, idx) in importErrors" :key="idx">{{ err }}</li>
          </ul>
        </div>

        <div class="TdsThemePack-DrawerActions">
          <TxButton
            variant="bare"
            native-type="button"
            class="TdsThemePack-ActionBtn TdsThemePack-ActionBtn--primary"
            data-testid="tds-theme-pack-import-submit"
            @click="handleImportSubmit"
          >
            {{ t('themeStyle.tdsPack.importConfirm', 'Validate & Import') }}
          </TxButton>
          <TxButton
            variant="bare"
            native-type="button"
            class="TdsThemePack-ActionBtn"
            data-testid="tds-theme-pack-import-cancel"
            @click="cancelImport"
          >
            {{ t('themeStyle.tdsPack.importCancel', 'Cancel') }}
          </TxButton>
        </div>
      </div>

      <div
        v-if="exportedJson"
        class="TdsThemePack-Drawer"
        data-testid="tds-theme-pack-export-panel"
      >
        <div class="TdsThemePack-DrawerHead">
          <span class="TdsThemePack-DrawerTitle">
            {{ t('themeStyle.tdsPack.exportTitle', 'Exported Theme Pack JSON') }}
          </span>
          <button
            type="button"
            class="TdsThemePack-CloseBtn"
            :aria-label="t('themeStyle.tdsPack.importCancel', 'Cancel')"
            @click="closeExportPanel"
          >
            <span class="i-ri-close-line" aria-hidden="true" />
          </button>
        </div>
        <textarea
          :value="exportedJson"
          class="TdsThemePack-JsonArea"
          rows="6"
          readonly
          spellcheck="false"
          data-testid="tds-theme-pack-export-output"
        />
      </div>

      <div
        v-if="statusMessage"
        class="TdsThemePack-Status"
        role="status"
        aria-live="polite"
        data-testid="tds-theme-pack-status"
      >
        {{ statusMessage }}
      </div>
    </div>

    <TuffBlockSwitch
      v-model="syncWindowMaterial"
      :title="t('themeStyle.tdsPack.syncMaterial', 'Sync window material')"
      :description="
        t(
          'themeStyle.tdsPack.syncMaterialDesc',
          'Apply the theme pack\'s preferred window material when switching packs.'
        )
      "
    />
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
.TdsThemePack-Body {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3);
  padding: var(--shell-space-4);
  border-bottom: 1px solid var(--shell-border);
}

:global(.window-refraction) .TdsThemePack-Body,
:global(.window-filter) .TdsThemePack-Body {
  background: color-mix(in srgb, var(--shell-bg) 86%, transparent);
}

.TdsThemePack-Grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--shell-space-3);
}

.TdsThemePack-CardSlot {
  position: relative;
  display: flex;
}

.TdsThemePack-Card {
  appearance: none;
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
  color: var(--shell-text-primary);
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--shell-border-strong);
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px var(--shell-primary-soft);
  }

  &.is-active {
    border-color: var(--shell-primary);
    background: var(--shell-bg);
    box-shadow:
      inset 0 0 0 1px var(--shell-primary),
      0 0 0 3px var(--shell-primary-soft);
  }
}

:global(.window-refraction) .TdsThemePack-Card,
:global(.window-filter) .TdsThemePack-Card {
  background: color-mix(in srgb, var(--shell-surface) 94%, var(--shell-bg));
  border-color: var(--shell-border-strong);
  box-shadow: 0 1px 2px var(--shell-shadow);

  &:hover {
    background: var(--shell-surface-2);
  }

  &.is-active {
    border-color: var(--shell-primary);
    background: var(--shell-bg);
    box-shadow:
      inset 0 0 0 1px var(--shell-primary),
      0 0 0 3px var(--shell-primary-soft);
  }
}

.TdsThemePack-RemoveBtn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-secondary);
  cursor: pointer;
  font-size: var(--shell-fs-sm);

  &:hover {
    border-color: var(--shell-danger-border);
    color: var(--shell-danger);
    background: var(--shell-danger-soft);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.TdsThemePack-CardTop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-2);
}

.TdsThemePack-SwatchRow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
}

.TdsThemePack-SwatchDot {
  width: 13px;
  height: 13px;
  border-radius: var(--shell-radius-full);
  box-shadow: inset 0 0 0 1px var(--shell-border-strong);
  box-sizing: border-box;
  flex-shrink: 0;
}

.TdsThemePack-SwatchDot--dark {
  width: 11px;
  height: 11px;
}

.TdsThemePack-SwatchDivider {
  width: 1px;
  height: 12px;
  margin: 0 2px;
  background: var(--shell-border);
}

.TdsThemePack-Badges {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.TdsThemePack-AaBadge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border: 1px solid var(--shell-success-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-success-soft);
  color: var(--shell-success);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-semibold);
  letter-spacing: 0.04em;
  line-height: 1.2;
}

.TdsThemePack-ActiveMark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  font-size: var(--shell-fs-sm);
}

.TdsThemePack-CardMeta {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.TdsThemePack-CardTitle {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: var(--shell-font-weight-semibold);
  line-height: 1.35;
}

.TdsThemePack-CardDesc {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  text-wrap: pretty;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.TdsThemePack-CardFoot {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  padding-top: 2px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.2;
}

.TdsThemePack-Actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
}

.TdsThemePack-ActionBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--shell-text-secondary);
    color: var(--shell-text-primary);
    background: var(--shell-surface);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.TdsThemePack-ActionBtn--primary {
  border-color: var(--shell-primary);
  background: var(--shell-primary);
  color: var(--shell-on-primary);

  &:hover:not(:disabled) {
    border-color: var(--shell-primary);
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    opacity: 0.92;
  }
}

.TdsThemePack-Drawer {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);
}

:global(.window-refraction) .TdsThemePack-Drawer,
:global(.window-filter) .TdsThemePack-Drawer {
  border-color: var(--shell-border-strong);
  box-shadow: 0 2px 8px var(--shell-shadow);
}

.TdsThemePack-DrawerHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-2);
}

.TdsThemePack-DrawerTitle {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-semibold);
}

.TdsThemePack-CloseBtn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-secondary);
  cursor: pointer;

  &:hover {
    border-color: var(--shell-border);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.TdsThemePack-JsonArea {
  width: 100%;
  min-height: 112px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  color: var(--shell-text-primary);
  font-family: var(--shell-font-mono);
  font-size: 0.9em;
  line-height: 1.5;
  resize: vertical;

  &:focus {
    outline: 2px solid var(--shell-primary);
    outline-offset: 1px;
  }
}

.TdsThemePack-DrawerActions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.TdsThemePack-ErrorBox {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--shell-danger-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-danger-soft);
  color: var(--shell-danger);
  font-size: var(--shell-fs-sm);
}

.TdsThemePack-ErrorHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: var(--shell-font-weight-semibold);
}

.TdsThemePack-ErrorList {
  margin: 0;
  padding-left: 18px;
  line-height: 1.45;
}

.TdsThemePack-Status {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.4;
}
</style>
