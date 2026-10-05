<script setup lang="ts">
/**
 * An insights page's whole header, in one row, owned by the content rather than the shell.
 *
 * The shell's title row could hold a heading and one thing beside it; an insights header is a
 * heading, a status and a few actions. Splitting it across two owners is what kept leaving a band
 * of blank between the title and the buttons, so the page draws all of it here.
 */
defineOptions({ name: 'InsightsHeader' })

defineProps<{
  /** The heading. Without one no `<h1>` is drawn: the nav label is the page's to supply. */
  title?: string
  /** An extra class on the actions row, for the page's own handles. It carries no style. */
  actionsClass?: string
}>()

defineSlots<{
  /** A statement about the page (a broken dependency, say), placed before the actions. */
  status?: () => unknown
  /** The page's buttons, at the end of the row. */
  actions?: () => unknown
}>()
</script>

<template>
  <header class="InsightsHeader">
    <div class="InsightsHeader-Copy">
      <h1 v-if="title">{{ title }}</h1>
    </div>
    <div class="InsightsHeader-Actions shell-chrome-safe-inline-end" :class="actionsClass">
      <slot name="status" />
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped lang="scss">
/*
 * The header row. It used to hold nothing but the buttons, right-aligned against an empty half —
 * which is what put a band of blank page between the title and the first number.
 */
.InsightsHeader {
  display: flex;
  gap: var(--shell-space-5);
  align-items: flex-end;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto var(--shell-space-5);
}

/* The heading never gives way; the row beside it wraps or truncates first. */
.InsightsHeader-Copy {
  display: flex;
  min-width: 0;
  flex: none;
  flex-direction: column;
  gap: var(--shell-space-1);

  h1 {
    margin: 0;
    font-size: var(--shell-fs-h1);
    font-weight: 600;
    line-height: 1.2;
    /* Chrome, and it sits in the window's drag strip where a stray selection is the usual result
       of trying to move the window. */
    user-select: none;
  }
}

.InsightsHeader-Actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--shell-space-2);
}

@media (max-width: 680px) {
  .InsightsHeader {
    flex-direction: column;
  }

  .InsightsHeader-Actions {
    width: 100%;
    margin-right: 0;

    /*
     * Every child of the row, the status included. Vue scopes a trailing `*` on the parent —
     * this compiles to `.InsightsHeader-Actions[data-v-…] > *` — so it reaches slot content and
     * component roots alike, exactly as it did when the voice page owned the rule.
     */
    > * {
      flex: 1 1 0;
    }
  }
}

@media (max-width: 480px) {
  .InsightsHeader-Actions {
    flex-direction: column;
  }
}
</style>
