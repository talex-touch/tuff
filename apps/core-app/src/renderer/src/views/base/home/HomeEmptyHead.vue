<script lang="ts" name="HomeEmptyHead" setup>
import { TxMotionText } from '@talex-touch/tuffex/motion-text'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxTuffLogoStroke } from '@talex-touch/tuffex/tuff-logo-stroke'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { HomeOpeningPhase, HomeOpeningSource } from '~/modules/home-push/opening'

/**
 * What an untouched Home says: the mark, the greeting, and the assistant's opening line under it.
 * The opening is three lines tall whatever it holds — skeleton, a stream, or nothing — so the
 * composer and the card below never move for it.
 *
 * The root is exposed: the page measures it before the stage flips to a conversation and pins it
 * where it stood (`useLeavingHead`), which adds `is-leaving` to it.
 */
defineProps<{
  browserLanding: boolean
  /** Home recommendations are on: the opening line is shown at all. */
  openingEnabled: boolean
  phase: HomeOpeningPhase
  text: string
  source: HomeOpeningSource | null
  busy: boolean
  /** Screen-reader text while the opening loads. */
  loadingLabel: string
}>()

const { t } = useI18n()

const el = ref<HTMLElement | null>(null)

defineExpose({ el })
</script>

<template>
  <div ref="el" class="HomeEmptyHead">
    <div class="HomeEmptyHead-MarkHost">
      <TxTuffLogoStroke class="HomeEmptyHead-Mark" :size="67" mode="breathe" />
    </div>
    <TxMotionText
      tag="h1"
      class="HomeEmptyHead-Greeting"
      variant="txt-dia"
      :text="t(browserLanding ? 'browser.greeting' : 'home.greeting')"
    />
    <!-- The assistant speaks first. Three lines tall whatever it holds — skeleton, a
         stream, or nothing — so the composer and the card below never move for it. -->
    <div
      v-if="openingEnabled"
      class="HomeEmptyHead-Opening"
      role="status"
      :aria-busy="busy || undefined"
    >
      <template v-if="phase === 'pending'">
        <span class="sr-only">{{ loadingLabel }}</span>
        <div class="HomeEmptyHead-OpeningSkeleton" aria-hidden="true">
          <TxSkeleton class="HomeEmptyHead-OpeningBar" :height="10" :radius="5" />
          <TxSkeleton class="HomeEmptyHead-OpeningBar is-short" :height="10" :radius="5" />
        </div>
      </template>
      <!-- The template stands in while a slow route writes; the model's opening
           replaces it whole, the old words fading out first. -->
      <Transition v-else name="home-opening-swap" mode="out-in">
        <p v-if="text" :key="source ?? ''" class="HomeEmptyHead-OpeningText">
          {{ text }}
        </p>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeEmptyHead {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  // The chat lane, like the composer under it: the opening wraps at this width. A centred flex item
  // would otherwise shrink to its content, and the opening's content is one long line.
  width: var(--home-chat-lane-width);
  min-width: 0;

  /* Pinned out of flow by `submit`, which measures the offsets; the layer is
     the scale's, so the greeting dissolves under the returning composer. */
  &.is-leaving {
    z-index: var(--home-z-leaving);
  }
}

.HomeEmptyHead-MarkHost {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 67px;
  height: 67px;
  transform: none;
}

.HomeEmptyHead-Mark {
  width: 67px;
  height: 67px;
}

.HomeEmptyHead-Greeting {
  display: block;
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-display);
  font-weight: 600;
  // One display line, set tight for the same room.
  line-height: 1.2;
  text-align: center;
}

/**
 * The assistant's opening, under the greeting. Three lines tall whatever it holds — the skeleton, a
 * stream, the finished text or nothing — so text arriving never moves the composer or the card.
 *
 * 13px on a 20px line fits the longest opening the model may write (160 characters,
 * `sanitizeOpeningText`) in three lines of a full-width lane. A narrower lane clamps it with an
 * ellipsis rather than push the stage down; the whole text still joins the thread when sent.
 */
.HomeEmptyHead-Opening {
  --home-opening-line: 20px;

  width: 100%;
  height: calc(3 * var(--home-opening-line));
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  line-height: var(--home-opening-line);
  text-align: center;
}

.HomeEmptyHead-OpeningText {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

/* Bars where the opening's first two lines will be — most openings run to two. */
.HomeEmptyHead-OpeningSkeleton {
  // On the page background the skeleton's own default, the lightest fill, disappears.
  --tx-skeleton-base-color: var(--shell-surface-2);

  display: flex;
  flex-direction: column;
  align-items: center;
}

/* A line box each, its bar centred in it (TxSkeleton's root is a flex column). */
.HomeEmptyHead-OpeningBar {
  justify-content: center;
  width: 78%;
  height: var(--home-opening-line);

  &.is-short {
    width: 52%;
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* The words surface where the skeleton stood — streamed, replayed or the template alike. */
  .HomeEmptyHead-OpeningText {
    animation: home-opening-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}

@keyframes home-opening-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

@media (prefers-reduced-motion: no-preference) {
  /* The template leaves before the model's opening surfaces where it stood. */
  .HomeEmptyHead-OpeningText.home-opening-swap-leave-active {
    animation: home-opening-out 0.16s ease-in both;
  }
}

@keyframes home-opening-out {
  to {
    opacity: 0;
  }
}
</style>
