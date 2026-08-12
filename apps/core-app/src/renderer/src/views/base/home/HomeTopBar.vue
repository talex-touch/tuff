<script lang="ts" name="HomeTopBar" setup>
import { useI18n } from 'vue-i18n'

/**
 * The conversation top bar, from artboards `JVvAr` / `lbZ9a` (untitled) and `LI40e` / `zdhVu`
 * (titled). Present at 52px on every home state — it is also the only drag handle the main area
 * has, since the shell's window chrome lives inside the sidebar.
 */
const props = defineProps<{
  /** Conversation title. Absent until the conversation has one, which selects the pill form below. */
  title?: string
  modelName: string
  /** Whether the right panel is open, so the toggle can describe what it will do. */
  panelOpen?: boolean
  menuOpen?: boolean
}>()

defineEmits<{
  (event: 'select-model'): void
  (event: 'toggle-panel'): void
  (event: 'open-menu'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="HomeTopBar">
    <div class="HomeTopBar-Left">
      <!--
        The title takes over the prominent 13/500 slot, which is why the pill demotes itself to a
        filled 11px chip beside it: two elements at the same weight would read as two titles.
      -->
      <h1 v-if="props.title" class="HomeTopBar-Title" :title="props.title">
        {{ props.title }}
      </h1>

      <div class="HomeTopBar-ModeSlot">
        <button
          class="HomeTopBar-ModePill"
          :class="{ 'is-secondary': Boolean(props.title) }"
          type="button"
          data-model-pill
          :aria-label="t('home.model')"
          :aria-expanded="Boolean(props.menuOpen)"
          @click="$emit('select-model')"
        >
          <span class="HomeTopBar-ModeLabel">{{ props.modelName }}</span>
          <span class="i-ri-arrow-down-s-line HomeTopBar-ModeChevron" />
        </button>
        <slot name="menu" />
      </div>
    </div>

    <div class="HomeTopBar-Actions">
      <button
        class="HomeTopBar-IconBtn"
        type="button"
        :aria-pressed="Boolean(props.panelOpen)"
        :aria-label="props.panelOpen ? t('home.closePanel') : t('home.openPanel')"
        :title="props.panelOpen ? t('home.closePanel') : t('home.openPanel')"
        @click="$emit('toggle-panel')"
      >
        <!-- Remix has no `panel-right-open`; `layout-right` is its equivalent right-panel glyph. -->
        <span class="i-ri-layout-right-line" />
      </button>
      <button
        class="HomeTopBar-IconBtn"
        type="button"
        :aria-label="t('home.moreActions')"
        :title="t('home.moreActions')"
        @click="$emit('open-menu')"
      >
        <span class="i-ri-more-line" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeTopBar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  box-sizing: border-box;
  /**
   * The main area's only drag handle. `ShellChromeBar` covers the sidebar column, so without this
   * the whole right side of the window — most of its width — cannot be dragged.
   */
  -webkit-app-region: drag;
}

.HomeTopBar-Left {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.HomeTopBar-Title {
  margin: 0;
  overflow: hidden;
  color: var(--shell-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-body);
  font-weight: 500;
}

/** Anchors the model menu to the pill; the bar itself is a drag region and cannot host it. */
.HomeTopBar-ModeSlot {
  position: relative;
  flex: none;
  -webkit-app-region: no-drag;
}

.HomeTopBar-ModePill {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  padding: 6px 10px;
  border: none;
  border-radius: var(--shell-radius-md);
  background: transparent;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--shell-surface-2);
  }

  // Titled form: a filled chip that reads as metadata about the title, not as a heading itself.
  &.is-secondary {
    gap: 4px;
    padding: 3px 8px;
    border-radius: var(--shell-radius-sm);
    background: var(--shell-surface-2);
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-caption);
    font-weight: 400;

    &:hover {
      background: var(--shell-border);
    }
  }
}

.HomeTopBar-ModeChevron {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;

  .HomeTopBar-ModePill.is-secondary & {
    font-size: 12px;
  }
}

.HomeTopBar-Actions {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: center;
}

.HomeTopBar-IconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 16px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}
</style>
