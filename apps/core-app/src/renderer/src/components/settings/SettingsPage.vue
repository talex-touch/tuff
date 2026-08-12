<script lang="ts" name="SettingsPage" setup>
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'

defineProps<{ title: string }>()
</script>

<template>
  <div class="SettingsPage">
    <!--
      The scroll-edge fade every other view inherits from `ViewTemplate`. The v2 settings shell
      owns its own column and bypasses that wrapper, which silently dropped the pair — so it is
      restated here with the same parameters, and both surfaces keep fading identically.
    -->
    <TxGradualBlur
      exponential
      :div-count="10"
      position="top"
      height="40px"
      :strength="1.4"
      :opacity="0.9"
      :z-index="20"
    />
    <TxGradualBlur
      exponential
      :div-count="10"
      position="bottom"
      height="40px"
      :strength="1.4"
      :opacity="0.9"
      :z-index="20"
    />

    <div class="SettingsPage-Scroll">
      <div class="SettingsPage-Column">
        <h1 class="SettingsPage-Title">
          {{ title }}
        </h1>
        <slot />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SettingsPage {
  // Anchors the two blur bands, which position themselves against the nearest positioned
  // ancestor. The scroll moved into a child so they stay pinned instead of scrolling away.
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.SettingsPage-Scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.SettingsPage-Column {
  display: flex;
  flex-direction: column;
  // Artboard `iqbKR` body: gap 20, padding [4,40,36,40]; 940 content inside a 1020 main
  // column, expressed as a max-width so wider windows do not stretch the rows.
  gap: 20px;
  max-width: 940px;
  margin: 0 auto;
  /**
   * 56 = the artboard's 52px TopBar plus its 4px body inset.
   *
   * The implemented shell has no top bar — the chrome moved into the sidebar — so that height
   * had nowhere to go and the title ended up against the window edge. Restating it here also
   * keeps the title clear of the macOS hidden-title-bar strip, which stays window-draggable no
   * matter what the renderer marks `no-drag`.
   */
  padding: 56px 40px 36px;
  box-sizing: border-box;
}

.SettingsPage-Title {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-h1);
  font-weight: 600;
  // Chrome, like the nav item that led here — and it sits in the window's drag strip, where a
  // stray selection is the usual outcome of trying to move the window.
  user-select: none;
}
</style>
