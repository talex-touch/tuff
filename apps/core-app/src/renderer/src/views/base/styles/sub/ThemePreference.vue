<script setup lang="ts" name="ThemePreference">
import { TxButton, TxStatusBadge } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import FormTemplate from '~/components/base/template/FormTemplate.vue'
import { themeStyle, type ThemeWindowPreference } from '~/modules/storage/theme-style'
import { createThemeDetailRoute } from '../section-route'
import {
  applyThemeMaterialPreference,
  getThemeMaterialOption,
  isThemeMaterialSelected,
  RECOMMENDED_THEME_MATERIAL,
  THEME_MATERIAL_OPTIONS,
  type ThemeMaterialOption
} from './theme-preference-state'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const selectedMaterial = computed(() => getThemeMaterialOption(route.query.theme))
const selectedPreviewKey = computed(() => `theme-preference-${selectedMaterial.value.value}-img`)
const selectedTitleKey = computed(() => `theme-preference-${selectedMaterial.value.value}`)
const currentMaterial = computed(() => themeStyle.value.theme.window)
const selectedIsCurrent = computed(() =>
  isThemeMaterialSelected(currentMaterial.value, selectedMaterial.value.value)
)

function resolveMaterialLabel(option: ThemeMaterialOption): string {
  return t(option.labelKey)
}

function resolveMaterialDescription(option: ThemeMaterialOption): string {
  return t(option.descriptionKey)
}

function applyMaterial(material: ThemeWindowPreference): void {
  applyThemeMaterialPreference(themeStyle.value, material)
}

function selectMaterial(material: ThemeWindowPreference): void {
  applyMaterial(material)
  void router.replace(createThemeDetailRoute(material))
}

function applySelectedMaterial(): void {
  if (selectedIsCurrent.value) {
    return
  }
  applyMaterial(selectedMaterial.value.value)
}

function openStylesPage(): void {
  void router.push('/styles')
}
</script>

<template>
  <FormTemplate
    content-style="width: calc(100% - 5rem);height: calc(100% - 10rem)"
    class="ThemePreference-Container"
  >
    <template #header>
      <div class="ThemePreference-Header">
        <button
          type="button"
          class="ThemePreference-BackButton i-ri-arrow-left-s-line hover-button fake-background transition-cubic"
          :aria-label="t('common.back', 'Back')"
          @click="() => $router.back()"
        />
        <div class="ThemePreference-HeaderText">
          <p v-shared-element:[selectedTitleKey] class="ThemePreference-Title">
            {{ resolveMaterialLabel(selectedMaterial) }}
          </p>
          <span class="ThemePreference-Subtitle">
            {{ t('themeStyle.materialDetailDesc') }}
          </span>
        </div>
        <TxStatusBadge
          v-if="selectedIsCurrent"
          :text="t('themeStyle.selectedMaterial')"
          status="success"
          size="sm"
        />
      </div>
    </template>

    <div class="ThemePreference-Content">
      <section class="ThemePreference-PreviewPanel">
        <div
          v-shared-element:[selectedPreviewKey]
          class="ThemePreference-Display"
          :class="selectedMaterial.previewClass"
        >
          <div class="ThemePreference-PreviewChrome">
            <span />
            <span />
            <span />
          </div>
          <div class="ThemePreference-PreviewBody">
            <div class="ThemePreference-PreviewSidebar" />
            <div class="ThemePreference-PreviewMain">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </section>

      <section class="ThemePreference-ControlPanel">
        <div class="ThemePreference-SectionHeader">
          <p>{{ t('themeStyle.materialOptions') }}</p>
          <span>{{ resolveMaterialDescription(selectedMaterial) }}</span>
        </div>

        <div class="ThemePreference-OptionList">
          <button
            v-for="option in THEME_MATERIAL_OPTIONS"
            :key="option.value"
            type="button"
            class="ThemePreference-Option"
            :class="{ active: isThemeMaterialSelected(currentMaterial, option.value) }"
            @click="selectMaterial(option.value)"
          >
            <span class="ThemePreference-OptionPreview" :class="option.previewClass" />
            <span class="ThemePreference-OptionText">
              <strong>{{ resolveMaterialLabel(option) }}</strong>
              <small>{{ resolveMaterialDescription(option) }}</small>
            </span>
            <TxStatusBadge
              v-if="isThemeMaterialSelected(currentMaterial, option.value)"
              :text="t('themeStyle.selectedMaterial')"
              status="success"
              size="sm"
            />
            <TxStatusBadge
              v-else-if="option.value === RECOMMENDED_THEME_MATERIAL"
              :text="t('themeStyle.recommendedMaterial')"
              status="info"
              size="sm"
            />
          </button>
        </div>

        <div class="ThemePreference-Actions">
          <TxButton
            type="primary"
            :disabled="selectedIsCurrent"
            native-type="button"
            @click="applySelectedMaterial"
          >
            <span class="i-ri-check-line mr-1" />
            {{
              selectedIsCurrent ? t('themeStyle.materialApplied') : t('themeStyle.applyMaterial')
            }}
          </TxButton>
          <TxButton
            native-type="button"
            variant="secondary"
            @click="selectMaterial(RECOMMENDED_THEME_MATERIAL)"
          >
            <span class="i-ri-sparkling-line mr-1" />
            {{ t('themeStyle.useRecommendedMaterial') }}
          </TxButton>
          <TxButton native-type="button" variant="ghost" @click="openStylesPage">
            <span class="i-ri-settings-3-line mr-1" />
            {{ t('themeStyle.openStylesPage') }}
          </TxButton>
        </div>
      </section>
    </div>
  </FormTemplate>
</template>

<style lang="scss">
.ThemePreference-Container {
  .fake-background {
    text-align: center;
  }
}
</style>

<style lang="scss" scoped>
.ThemePreference-Header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ThemePreference-BackButton {
  width: 36px;
  height: 36px;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  color: var(--tx-color-primary);
  font-size: 1.6rem;
  background: transparent;
}

.ThemePreference-HeaderText {
  flex: 1;
  min-width: 0;
}

.ThemePreference-Title {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 1.5rem;
  font-weight: 800;
}

.ThemePreference-Subtitle {
  display: block;
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 0.9rem;
}

.ThemePreference-Content {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
  gap: 18px;
  min-height: 420px;
}

.ThemePreference-PreviewPanel,
.ThemePreference-ControlPanel {
  min-width: 0;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color) 84%, transparent);
}

.ThemePreference-PreviewPanel {
  padding: 16px;
}

.ThemePreference-Display {
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 360px;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background-position: 0% 0%;
  background-size: 120% 120%;
  background-repeat: no-repeat;
  background-image: url('~/assets/bg/apparent.jpg');
  animation: dynamicDisplays 30s infinite alternate;
  animation-fill-mode: both;

  &::before {
    position: absolute;
    inset: 0;
    content: '';
    background: rgba(255, 255, 255, 0.04);
  }

  &.pure {
    filter: saturate(150%);

    &::before {
      background: color-mix(in srgb, var(--tx-fill-color) 88%, transparent);
      backdrop-filter: none;
    }
  }

  &.refraction {
    filter: blur(0) saturate(180%) brightness(1.08);

    &::before {
      background: color-mix(in srgb, var(--tx-fill-color) 44%, transparent);
      backdrop-filter: blur(14px) saturate(170%);
    }
  }

  &.filter {
    filter: saturate(180%);

    &::before {
      background: color-mix(in srgb, var(--tx-fill-color) 36%, transparent);
      backdrop-filter: blur(5px) saturate(170%);
    }
  }
}

.ThemePreference-PreviewChrome,
.ThemePreference-PreviewBody {
  position: relative;
  z-index: 1;
}

.ThemePreference-PreviewChrome {
  display: flex;
  gap: 6px;
  padding: 14px;

  span {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
  }
}

.ThemePreference-PreviewBody {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 14px;
  height: 286px;
  padding: 0 14px 14px;
}

.ThemePreference-PreviewSidebar,
.ThemePreference-PreviewMain {
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.22);
}

.ThemePreference-PreviewMain {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;

  span {
    height: 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.62);

    &:nth-child(2) {
      width: 72%;
    }

    &:nth-child(3) {
      width: 54%;
    }
  }
}

.ThemePreference-ControlPanel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.ThemePreference-SectionHeader {
  p {
    margin: 0;
    color: var(--tx-text-color-primary);
    font-size: 1rem;
    font-weight: 700;
  }

  span {
    display: block;
    margin-top: 4px;
    color: var(--tx-text-color-secondary);
    font-size: 0.86rem;
    line-height: 1.5;
  }
}

.ThemePreference-OptionList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ThemePreference-Option {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;

  &:hover,
  &.active {
    border-color: var(--tx-color-primary);
    background: color-mix(in srgb, var(--tx-color-primary) 9%, transparent);
  }
}

.ThemePreference-OptionPreview {
  width: 48px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color);
  background-image: url('~/assets/bg/apparent.jpg');
  background-size: cover;

  &.pure {
    box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--tx-fill-color) 76%, transparent);
  }

  &.refraction {
    backdrop-filter: blur(8px) saturate(180%);
    box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.18);
  }

  &.filter {
    filter: blur(0.6px) saturate(180%);
    box-shadow: inset 0 0 0 999px rgba(255, 255, 255, 0.1);
  }
}

.ThemePreference-OptionText {
  min-width: 0;

  strong,
  small {
    display: block;
  }

  strong {
    color: var(--tx-text-color-primary);
    font-size: 0.92rem;
  }

  small {
    margin-top: 2px;
    overflow: hidden;
    color: var(--tx-text-color-secondary);
    font-size: 0.78rem;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ThemePreference-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}

@media (max-width: 900px) {
  .ThemePreference-Content {
    grid-template-columns: 1fr;
  }

  .ThemePreference-Display {
    min-height: 260px;
  }
}

@keyframes dynamicDisplays {
  0% {
    background-position: 0% 0%;
  }

  30% {
    background-size: 150% 150%;
    background-position: 150% 0%;
  }

  50% {
    background-size: 120% 120%;
    background-position: 120% 120%;
  }

  70% {
    background-size: 150% 150%;
    background-position: 0% 150%;
  }

  100% {
    background-size: 120% 120%;
    background-position: 120% 120%;
  }
}
</style>
