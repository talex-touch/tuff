<script lang="ts" name="TdsMockupExportDialog" setup>
import { TxModal } from '@talex-touch/tuffex/modal'
import { computed, ref, watch } from 'vue'
import { resolveFrameLogicalSize } from './canvas-geometry'
import {
  createDefaultMockupOptions,
  loadMockupOptions,
  saveMockupOptions,
  TDS_MOCKUP_BACKDROP_PRESETS,
  TDS_MOCKUP_MAX_BEZEL,
  TDS_MOCKUP_MAX_RADIUS,
  TDS_MOCKUP_MIN_BEZEL,
  TDS_MOCKUP_MIN_RADIUS,
  TDS_MOCKUP_OPTIONS_STORAGE_KEY,
  TDS_MOCKUP_PER_PAGE_OPTIONS,
  TDS_MOCKUP_SCALE_OPTIONS,
  type TdsMockupBackdropPreset,
  type TdsMockupOptions,
  type TdsMockupPerPage,
  type TdsMockupScale
} from './mockup-options'
import {
  buildPrintableMockupHtml,
  computeMockupPageLayout,
  exportPrintableMockupHtml,
  paginateMockupFrames,
  rasterizeSvgToPngBlob,
  renderMockupPageSvg,
  triggerBlobDownload
} from './mockup-renderer'
import {
  DEFAULT_TDS_CANVAS_LABELS,
  type TdsCanvasFrame,
  type TdsCanvasLabels,
  type TdsMockupExportEventPayload
} from './types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    frames: TdsCanvasFrame[]
    labels?: Partial<TdsCanvasLabels>
    themeCss?: string
    storageKey?: string
    defaultTitle?: string
  }>(),
  {
    labels: undefined,
    themeCss: '',
    storageKey: TDS_MOCKUP_OPTIONS_STORAGE_KEY,
    defaultTitle: 'TDS Mockup Showcase'
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'export', payload: TdsMockupExportEventPayload): void
}>()

const labels = computed<TdsCanvasLabels>(() => ({
  ...DEFAULT_TDS_CANVAS_LABELS,
  ...(props.labels ?? {})
}))

const options = ref<TdsMockupOptions>(
  loadMockupOptions(props.storageKey, createDefaultMockupOptions(props.frames))
)
const selectedIds = ref<string[]>(props.frames.map((frame) => frame.id))
const currentPageIndex = ref(0)
const isExporting = ref(false)
const statusAnnouncement = ref('')

function syncSelectedIds(frames: readonly TdsCanvasFrame[], resetAll = false): void {
  const validIds = new Set(frames.map((frame) => frame.id))
  if (resetAll || selectedIds.value.length === 0) {
    selectedIds.value = frames.map((frame) => frame.id)
    return
  }
  const kept = selectedIds.value.filter((id) => validIds.has(id))
  selectedIds.value = kept.length > 0 ? kept : frames.map((frame) => frame.id)
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      options.value = loadMockupOptions(props.storageKey, createDefaultMockupOptions(props.frames))
      syncSelectedIds(props.frames, selectedIds.value.length === 0)
      currentPageIndex.value = 0
      statusAnnouncement.value = ''
    }
  }
)

watch(
  () => props.frames,
  (nextFrames) => {
    syncSelectedIds(nextFrames)
  }
)

watch(
  options,
  (nextOptions) => {
    saveMockupOptions(props.storageKey, nextOptions)
  },
  { deep: true }
)

const selectedIdSet = computed(() => new Set(selectedIds.value))

const selectedFrames = computed<TdsCanvasFrame[]>(() =>
  props.frames.filter((frame) => selectedIdSet.value.has(frame.id))
)

const pages = computed(() => paginateMockupFrames(selectedFrames.value, options.value.perPage))

watch(pages, (nextPages) => {
  if (nextPages.length === 0) {
    currentPageIndex.value = 0
    return
  }
  if (currentPageIndex.value >= nextPages.length) {
    currentPageIndex.value = nextPages.length - 1
  }
})

const activePage = computed(() => pages.value[currentPageIndex.value] ?? null)

const activePageSvg = computed(() => {
  if (!activePage.value) return ''
  return renderMockupPageSvg(activePage.value, options.value, {
    themeCss: props.themeCss,
    title: props.defaultTitle
  })
})

const activePageLayout = computed(() =>
  activePage.value ? computeMockupPageLayout(activePage.value, options.value) : null
)

const previewSvgDataUrl = computed(() =>
  activePageSvg.value
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(activePageSvg.value)}`
    : ''
)

const canExport = computed(() => selectedFrames.value.length > 0 && !isExporting.value)

function toggleFrameSelection(frameId: string): void {
  if (selectedIdSet.value.has(frameId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== frameId)
  } else {
    selectedIds.value = [...selectedIds.value, frameId]
  }
}

function selectAllFrames(): void {
  selectedIds.value = props.frames.map((frame) => frame.id)
}

function clearFrameSelection(): void {
  selectedIds.value = []
}

function isPresetActive(preset: TdsMockupBackdropPreset): boolean {
  if (preset.transparent) return options.value.transparent
  return (
    !options.value.transparent &&
    options.value.background.toLowerCase() === preset.background.toLowerCase()
  )
}

function applyBackdropPreset(preset: TdsMockupBackdropPreset): void {
  options.value = {
    ...options.value,
    background: preset.background,
    bezelColor: preset.bezelColor,
    transparent: preset.transparent
  }
}

function setPerPage(perPage: TdsMockupPerPage): void {
  options.value = {
    ...options.value,
    perPage
  }
}

function setScale(scale: TdsMockupScale): void {
  options.value = {
    ...options.value,
    scale
  }
}

function stepPage(delta: number): void {
  const total = pages.value.length
  if (total <= 1) return
  currentPageIndex.value = Math.max(0, Math.min(total - 1, currentPageIndex.value + delta))
}

function formatFrameDims(frame: TdsCanvasFrame): string {
  const size = resolveFrameLogicalSize(frame)
  return `${size.width}×${size.height}`
}

function sanitizeFileSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'tds-mockup'
}

function handleExportSvg(): void {
  if (!canExport.value || pages.value.length === 0) return
  const slug = sanitizeFileSlug(props.defaultTitle)
  pages.value.forEach((page) => {
    const svg = renderMockupPageSvg(page, options.value, {
      themeCss: props.themeCss,
      title: props.defaultTitle
    })
    const suffix = pages.value.length > 1 ? `-board-${page.pageIndex + 1}` : ''
    triggerBlobDownload(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${slug}${suffix}.svg`
    )
  })
  const payload: TdsMockupExportEventPayload = {
    format: 'svg',
    pageCount: pages.value.length,
    frameIds: selectedFrames.value.map((frame) => frame.id)
  }
  statusAnnouncement.value = `${labels.value.mockupExportSvg} (${payload.pageCount})`
  emit('export', payload)
}

async function handleExportPng(): Promise<void> {
  if (!canExport.value || pages.value.length === 0) return
  isExporting.value = true
  try {
    const slug = sanitizeFileSlug(props.defaultTitle)
    for (const page of pages.value) {
      const layout = computeMockupPageLayout(page, options.value)
      const svg = renderMockupPageSvg(page, options.value, {
        themeCss: props.themeCss,
        title: props.defaultTitle
      })
      const blob = await rasterizeSvgToPngBlob(
        svg,
        layout.width,
        layout.height,
        options.value.scale
      )
      const suffix = pages.value.length > 1 ? `-board-${page.pageIndex + 1}` : ''
      triggerBlobDownload(blob, `${slug}${suffix}-${options.value.scale}x.png`)
    }
    const payload: TdsMockupExportEventPayload = {
      format: 'png',
      pageCount: pages.value.length,
      frameIds: selectedFrames.value.map((frame) => frame.id)
    }
    statusAnnouncement.value = `${labels.value.mockupExportPng} (${payload.pageCount})`
    emit('export', payload)
  } finally {
    isExporting.value = false
  }
}

function handleExportPrintHtml(): void {
  if (!canExport.value || pages.value.length === 0) return
  const slug = sanitizeFileSlug(props.defaultTitle)
  const html = buildPrintableMockupHtml(pages.value, options.value, props.defaultTitle, {
    themeCss: props.themeCss
  })
  exportPrintableMockupHtml(html, `${slug}-print.html`)
  const payload: TdsMockupExportEventPayload = {
    format: 'print-html',
    pageCount: pages.value.length,
    frameIds: selectedFrames.value.map((frame) => frame.id)
  }
  statusAnnouncement.value = `${labels.value.mockupExportPrintHtml} (${payload.pageCount})`
  emit('export', payload)
}
</script>

<template>
  <TxModal
    :model-value="modelValue"
    :title="labels.mockupDialogTitle"
    :close-label="labels.mockupClose"
    width="920px"
    surface="refraction"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="TdsMockupExport" data-testid="tds-mockup-export-dialog">
      <div class="TdsMockupExport-SrOnly" role="status" aria-live="polite">
        {{ statusAnnouncement }}
      </div>

      <!-- Left: Live scaled SVG board preview + board switcher -->
      <div class="TdsMockupExport-PreviewPane">
        <div
          class="TdsMockupExport-PreviewStage"
          :class="{ 'is-transparent': options.transparent }"
          :data-transparent="String(options.transparent)"
          :data-page-count="pages.length"
          data-testid="tds-mockup-preview-stage"
        >
          <img
            v-if="previewSvgDataUrl"
            :src="previewSvgDataUrl"
            :alt="labels.mockupDialogTitle"
            class="TdsMockupExport-PreviewImg"
            data-testid="tds-mockup-preview-img"
          />
          <div v-else class="TdsMockupExport-PreviewEmpty" data-testid="tds-mockup-preview-empty">
            <span class="TdsMockupExport-Icon" aria-hidden="true">
              <span class="i-ri-artboard-2-line" />
            </span>
            <span>{{ labels.mockupEmptySelection }}</span>
          </div>
        </div>

        <div class="TdsMockupExport-PreviewFooter">
          <div class="TdsMockupExport-PageNav">
            <button
              type="button"
              class="TdsMockupExport-IconBtn"
              :disabled="pages.length <= 1 || currentPageIndex <= 0"
              :title="labels.mockupPrevPage"
              :aria-label="labels.mockupPrevPage"
              data-testid="tds-mockup-page-prev"
              @click="stepPage(-1)"
            >
              <span class="TdsMockupExport-Icon" aria-hidden="true">
                <span class="i-ri-arrow-left-s-line" />
              </span>
            </button>

            <span class="TdsMockupExport-PageReadout" data-testid="tds-mockup-page-readout">
              {{ labels.mockupPage }}
              {{ pages.length > 0 ? currentPageIndex + 1 : 0 }} / {{ pages.length }}
            </span>

            <button
              type="button"
              class="TdsMockupExport-IconBtn"
              :disabled="pages.length <= 1 || currentPageIndex >= pages.length - 1"
              :title="labels.mockupNextPage"
              :aria-label="labels.mockupNextPage"
              data-testid="tds-mockup-page-next"
              @click="stepPage(1)"
            >
              <span class="TdsMockupExport-Icon" aria-hidden="true">
                <span class="i-ri-arrow-right-s-line" />
              </span>
            </button>
          </div>

          <span v-if="activePageLayout" class="TdsMockupExport-BoardDim">
            {{ activePageLayout.width * options.scale }}×{{
              activePageLayout.height * options.scale
            }}px
          </span>
        </div>
      </div>

      <!-- Right: Restrained configuration controls -->
      <div class="TdsMockupExport-Sidebar">
        <!-- Frame multi-select list -->
        <section class="TdsMockupExport-Section">
          <div class="TdsMockupExport-SectionHead">
            <h4 class="TdsMockupExport-SectionTitle">
              {{ labels.mockupFramesSection }} ({{ selectedFrames.length }}/{{ frames.length }})
            </h4>
            <div class="TdsMockupExport-LinkGroup">
              <button
                type="button"
                class="TdsMockupExport-TextBtn"
                data-testid="tds-mockup-select-all"
                @click="selectAllFrames"
              >
                {{ labels.mockupSelectAll }}
              </button>
              <button
                type="button"
                class="TdsMockupExport-TextBtn"
                data-testid="tds-mockup-select-none"
                @click="clearFrameSelection"
              >
                {{ labels.mockupSelectNone }}
              </button>
            </div>
          </div>

          <div class="TdsMockupExport-FrameList">
            <label
              v-for="frame in frames"
              :key="frame.id"
              class="TdsMockupExport-FrameRow"
              :class="{ 'is-checked': selectedIdSet.has(frame.id) }"
            >
              <input
                type="checkbox"
                class="TdsMockupExport-Checkbox"
                :checked="selectedIdSet.has(frame.id)"
                :data-testid="`tds-mockup-frame-check-${frame.id}`"
                @change="toggleFrameSelection(frame.id)"
              />
              <span class="TdsMockupExport-FrameTitle">{{ frame.title }}</span>
              <span class="TdsMockupExport-FrameDims">{{ formatFrameDims(frame) }}</span>
            </label>
          </div>
        </section>

        <!-- Backdrop swatches -->
        <section class="TdsMockupExport-Section">
          <div class="TdsMockupExport-SectionHead">
            <h4 class="TdsMockupExport-SectionTitle">{{ labels.mockupBackdropSection }}</h4>
          </div>
          <div class="TdsMockupExport-Swatches">
            <button
              v-for="preset in TDS_MOCKUP_BACKDROP_PRESETS"
              :key="preset.id"
              type="button"
              class="TdsMockupExport-SwatchBtn"
              :class="{ 'is-active': isPresetActive(preset) }"
              :aria-pressed="isPresetActive(preset)"
              :data-testid="`tds-mockup-swatch-${preset.id}`"
              @click="applyBackdropPreset(preset)"
            >
              <span
                class="TdsMockupExport-SwatchDot"
                :class="{ 'is-checker': preset.transparent }"
                :style="preset.transparent ? undefined : { backgroundColor: preset.background }"
                aria-hidden="true"
              />
              <span class="TdsMockupExport-SwatchLabel">{{ labels[preset.labelKey] }}</span>
            </button>
          </div>
        </section>

        <!-- Layout & appearance controls -->
        <section class="TdsMockupExport-Section">
          <div class="TdsMockupExport-SectionHead">
            <h4 class="TdsMockupExport-SectionTitle">{{ labels.mockupLayoutSection }}</h4>
          </div>

          <div class="TdsMockupExport-ControlRow">
            <span class="TdsMockupExport-ControlLabel">{{ labels.mockupPerPage }}</span>
            <div class="TdsMockupExport-Segmented" role="group" :aria-label="labels.mockupPerPage">
              <button
                v-for="count in TDS_MOCKUP_PER_PAGE_OPTIONS"
                :key="count"
                type="button"
                class="TdsMockupExport-SegBtn"
                :class="{ 'is-active': options.perPage === count }"
                :aria-pressed="options.perPage === count"
                :data-testid="`tds-mockup-per-page-${count}`"
                @click="setPerPage(count)"
              >
                {{ count }}
              </button>
            </div>
          </div>

          <div class="TdsMockupExport-ControlRow">
            <span class="TdsMockupExport-ControlLabel">{{ labels.mockupScale }}</span>
            <div class="TdsMockupExport-Segmented" role="group" :aria-label="labels.mockupScale">
              <button
                v-for="factor in TDS_MOCKUP_SCALE_OPTIONS"
                :key="factor"
                type="button"
                class="TdsMockupExport-SegBtn"
                :class="{ 'is-active': options.scale === factor }"
                :aria-pressed="options.scale === factor"
                :data-testid="`tds-mockup-scale-${factor}`"
                @click="setScale(factor)"
              >
                {{ factor }}x
              </button>
            </div>
          </div>

          <label class="TdsMockupExport-SliderRow">
            <span class="TdsMockupExport-ControlLabel">{{ labels.mockupBezelWidth }}</span>
            <input
              v-model.number="options.bezelWidth"
              type="range"
              :min="TDS_MOCKUP_MIN_BEZEL"
              :max="TDS_MOCKUP_MAX_BEZEL"
              step="1"
              class="TdsMockupExport-Range"
              data-testid="tds-mockup-bezel-range"
            />
            <span class="TdsMockupExport-RangeValue">{{ options.bezelWidth }}px</span>
          </label>

          <label class="TdsMockupExport-SliderRow">
            <span class="TdsMockupExport-ControlLabel">{{ labels.mockupCornerRadius }}</span>
            <input
              v-model.number="options.radius"
              type="range"
              :min="TDS_MOCKUP_MIN_RADIUS"
              :max="TDS_MOCKUP_MAX_RADIUS"
              step="2"
              class="TdsMockupExport-Range"
              data-testid="tds-mockup-radius-range"
            />
            <span class="TdsMockupExport-RangeValue">{{ options.radius }}px</span>
          </label>

          <div class="TdsMockupExport-ToggleGrid">
            <label class="TdsMockupExport-Toggle">
              <input
                v-model="options.shadow"
                type="checkbox"
                class="TdsMockupExport-Checkbox"
                data-testid="tds-mockup-toggle-shadow"
              />
              <span>{{ labels.mockupShadow }}</span>
            </label>

            <label class="TdsMockupExport-Toggle">
              <input
                v-model="options.brand"
                type="checkbox"
                class="TdsMockupExport-Checkbox"
                data-testid="tds-mockup-toggle-brand"
              />
              <span>{{ labels.mockupBrand }}</span>
            </label>

            <label class="TdsMockupExport-Toggle">
              <input
                v-model="options.showTitles"
                type="checkbox"
                class="TdsMockupExport-Checkbox"
                data-testid="tds-mockup-toggle-titles"
              />
              <span>{{ labels.mockupShowTitles }}</span>
            </label>
          </div>
        </section>
      </div>
    </div>

    <template #footer>
      <div class="TdsMockupExport-Actions">
        <button
          type="button"
          class="TdsMockupExport-ActionBtn"
          :disabled="!canExport"
          data-testid="tds-mockup-export-print"
          @click="handleExportPrintHtml"
        >
          <span class="TdsMockupExport-Icon" aria-hidden="true">
            <span class="i-ri-printer-line" />
          </span>
          <span>{{ labels.mockupExportPrintHtml }}</span>
        </button>

        <button
          type="button"
          class="TdsMockupExport-ActionBtn"
          :disabled="!canExport"
          data-testid="tds-mockup-export-svg"
          @click="handleExportSvg"
        >
          <span class="TdsMockupExport-Icon" aria-hidden="true">
            <span class="i-ri-file-code-line" />
          </span>
          <span>{{ labels.mockupExportSvg }}</span>
        </button>

        <button
          type="button"
          class="TdsMockupExport-ActionBtn is-primary"
          :disabled="!canExport"
          data-testid="tds-mockup-export-png"
          @click="handleExportPng"
        >
          <span class="TdsMockupExport-Icon" aria-hidden="true">
            <span class="i-ri-image-line" />
          </span>
          <span>{{ isExporting ? labels.mockupExporting : labels.mockupExportPng }}</span>
        </button>
      </div>
    </template>
  </TxModal>
</template>

<style lang="scss" scoped>
.TdsMockupExport {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.95fr);
  gap: var(--shell-space-4);
  align-items: start;
  color: var(--shell-text-primary);
  font-family: var(--shell-font-sans);
  font-size: var(--shell-fs-body);

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.TdsMockupExport-SrOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.TdsMockupExport-Icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

.TdsMockupExport-PreviewPane {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  min-width: 0;
}

.TdsMockupExport-PreviewStage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
  max-height: 460px;
  padding: var(--shell-space-3);
  border-radius: var(--shell-radius-md);
  background-color: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  overflow: hidden;
  box-sizing: border-box;

  &.is-transparent {
    background-image:
      linear-gradient(45deg, var(--shell-surface-2) 25%, transparent 25%),
      linear-gradient(-45deg, var(--shell-surface-2) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--shell-surface-2) 75%),
      linear-gradient(-45deg, transparent 75%, var(--shell-surface-2) 75%);
    background-size: 16px 16px;
    background-position:
      0 0,
      0 8px,
      8px -8px,
      -8px 0;
  }
}

.TdsMockupExport-PreviewImg {
  display: block;
  max-width: 100%;
  max-height: 428px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--shell-radius-sm);
}

.TdsMockupExport-PreviewEmpty {
  display: inline-flex;
  gap: var(--shell-space-2);
  align-items: center;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  text-wrap: pretty;
}

.TdsMockupExport-PreviewFooter {
  display: flex;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: space-between;
}

.TdsMockupExport-PageNav {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.TdsMockupExport-IconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.TdsMockupExport-PageReadout,
.TdsMockupExport-BoardDim {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-variant-numeric: tabular-nums;
}

.TdsMockupExport-Sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3);
  min-width: 0;
}

.TdsMockupExport-Section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  padding-top: var(--shell-space-2);
  border-top: 1px solid var(--shell-border);

  &:first-child {
    padding-top: 0;
    border-top: 0;
  }
}

.TdsMockupExport-SectionHead {
  display: flex;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: space-between;
}

.TdsMockupExport-SectionTitle {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-semibold);
}

.TdsMockupExport-LinkGroup {
  display: inline-flex;
  gap: var(--shell-space-2);
  align-items: center;
}

.TdsMockupExport-TextBtn {
  padding: 2px 4px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }
}

.TdsMockupExport-FrameList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 124px;
  overflow-y: auto;
  padding: 4px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsMockupExport-FrameRow {
  display: flex;
  gap: var(--shell-space-2);
  align-items: center;
  padding: 4px 6px;
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-checked {
    color: var(--shell-text-primary);
  }
}

.TdsMockupExport-Checkbox {
  flex: none;
  margin: 0;
  accent-color: var(--shell-primary);
  cursor: pointer;
}

.TdsMockupExport-FrameTitle {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TdsMockupExport-FrameDims {
  flex: none;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

.TdsMockupExport-Swatches {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.TdsMockupExport-SwatchBtn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }
}

.TdsMockupExport-SwatchDot {
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: var(--shell-radius-full);
  box-shadow: inset 0 0 0 1px var(--shell-border-strong);

  &.is-checker {
    background-color: var(--shell-bg);
    background-image:
      linear-gradient(45deg, var(--shell-border-strong) 25%, transparent 25%),
      linear-gradient(-45deg, var(--shell-border-strong) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--shell-border-strong) 75%),
      linear-gradient(-45deg, transparent 75%, var(--shell-border-strong) 75%);
    background-size: 8px 8px;
    background-position:
      0 0,
      0 4px,
      4px -4px,
      -4px 0;
  }
}

.TdsMockupExport-SwatchLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.TdsMockupExport-ControlRow {
  display: flex;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: space-between;
}

.TdsMockupExport-ControlLabel {
  flex: none;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
}

.TdsMockupExport-Segmented {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsMockupExport-SegBtn {
  min-width: 30px;
  height: 22px;
  padding: 0 7px;
  border: 0;
  border-radius: calc(var(--shell-radius-sm) - 2px);
  background: transparent;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    box-shadow: inset 0 0 0 1px var(--shell-primary-border);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }
}

.TdsMockupExport-SliderRow {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 36px;
  gap: var(--shell-space-2);
  align-items: center;
}

.TdsMockupExport-Range {
  width: 100%;
  margin: 0;
  accent-color: var(--shell-primary);
  cursor: pointer;
}

.TdsMockupExport-RangeValue {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.TdsMockupExport-ToggleGrid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-top: 2px;
}

.TdsMockupExport-Toggle {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-sm);
  cursor: pointer;

  &:hover {
    color: var(--shell-text-primary);
  }
}

.TdsMockupExport-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  align-items: center;
  justify-content: flex-end;
  width: 100%;
}

.TdsMockupExport-ActionBtn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  font-weight: var(--shell-font-weight-medium);
  line-height: 1;
  box-shadow: inset 0 0 0 1px var(--shell-border);
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &.is-primary {
    background: var(--shell-primary);
    color: var(--shell-on-primary);
    box-shadow: none;

    &:hover:not(:disabled) {
      background: color-mix(in srgb, var(--shell-primary) 90%, var(--shell-text-primary));
      color: var(--shell-on-primary);
    }
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--shell-focus-ring);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@media (prefers-reduced-motion: reduce) {
  .TdsMockupExport,
  .TdsMockupExport-PreviewImg {
    transition: none;
  }
}
</style>
