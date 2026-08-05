<script lang="ts" name="SettingIdentityCard" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLogo from '~/components/icon/AppLogo.vue'
import SettingChip from '~/components/settings/SettingChip.vue'
import { useLightfallCanvas } from '~/composables/useLightfallCanvas'
import { useEnv } from '~/modules/hooks/env-hooks'

/**
 * Identity band for the settings overview, per artboard `iqbKR`: 64px mark, wordmark, version
 * chip, tagline and one secondary action on the `$bg` surface.
 *
 * The Lightfall backdrop runs in `auto` mode, so it draws pigment on the light theme and
 * additive light on the dark one. That is what lets the band keep the artboard's quiet surface
 * instead of the dark slab an additive-only effect would have required.
 */
const { t } = useI18n()
const { packageJson } = useEnv()

const canvasRef = ref<HTMLCanvasElement | null>(null)

/**
 * Retuned for the band's aspect ratio: the shader normalises by width and its streaks fall
 * vertically, so the hero's 2 streaks at density 0.6 — tuned for a ~4.5:1 banner — leave this
 * ~10:1 band sparse and lopsided.
 */
useLightfallCanvas(canvasRef, {
  mode: 'auto',
  streakCount: 7,
  density: 1.5,
  speed: 0.4,
  opacity: 0.95
})

const versionLabel = computed(() =>
  packageJson.value?.version ? `v${packageJson.value.version}` : ''
)
</script>

<template>
  <div class="SettingIdentityCard">
    <canvas ref="canvasRef" class="SettingIdentityCard-Canvas" aria-hidden="true" />

    <div class="SettingIdentityCard-Content">
      <AppLogo class="SettingIdentityCard-Mark" />

      <div class="SettingIdentityCard-Text">
        <div class="SettingIdentityCard-NameRow">
          <span class="SettingIdentityCard-Name">TUFF</span>
          <SettingChip v-if="versionLabel" mono>{{ versionLabel }}</SettingChip>
        </div>
        <span class="SettingIdentityCard-Tagline">{{ t('settingsOverview.tagline') }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SettingIdentityCard {
  position: relative;
  overflow: hidden;
  width: 100%;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  box-sizing: border-box;
}

.SettingIdentityCard-Canvas {
  z-index: 0;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.SettingIdentityCard-Content {
  z-index: 1;
  position: relative;
  display: flex;
  gap: 18px;
  align-items: center;
  padding: 16px;
}

.SettingIdentityCard-Mark {
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
}

.SettingIdentityCard-Text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.SettingIdentityCard-NameRow {
  display: flex;
  gap: 8px;
  align-items: center;
}

.SettingIdentityCard-Name {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-lg);
  font-weight: 600;
  letter-spacing: 0.6px;
}

.SettingIdentityCard-Tagline {
  color: var(--shell-text-secondary);
  font-size: 12.5px;
}
</style>
