<script setup lang="ts">
import { computed } from 'vue'

interface ShowcaseSearchScenario {
  media?: {
    src: string
    poster?: string
    alt: string
  }
}

const props = withDefaults(defineProps<{
  scenario?: ShowcaseSearchScenario | null
  active?: boolean
}>(), {
  scenario: null,
  active: false,
})

const media = computed(() => props.scenario?.media ?? null)
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'm4v'])

function getMediaExtension(src: string): string | null {
  const cleanSrc = src.split('?')[0]?.split('#')[0]
  const match = cleanSrc?.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : null
}

const isVideo = computed(() => {
  const src = media.value?.src
  if (!src)
    return false
  const extension = getMediaExtension(src)
  return extension ? VIDEO_EXTENSIONS.has(extension) : false
})

const mediaGlowSrc = computed(() => {
  if (!media.value?.src)
    return null
  return isVideo.value ? (media.value.poster ?? null) : media.value.src
})
</script>

<template>
  <article
    class="showcase-search"
    :class="{ 'is-active': active }"
  >
    <div class="corebox-mock">
      <div class="corebox-mock__media">
        <img
          v-if="mediaGlowSrc"
          class="corebox-mock__media-glow"
          :src="mediaGlowSrc"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        >
        <div class="corebox-mock__media-frame">
          <video
            v-if="media?.src && isVideo"
            class="corebox-mock__media-image"
            :src="media.src"
            :poster="media.poster"
            autoplay
            muted
            loop
            playsinline
            preload="metadata"
          />
          <img
            v-else-if="media?.src"
            class="corebox-mock__media-image"
            :src="media.src"
            :alt="media.alt"
            loading="lazy"
            decoding="async"
          >
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.showcase-search {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: #0f172a;
}

.corebox-mock {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  background: linear-gradient(180deg, #e6e8eb, #d7dbe0);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 32px 80px rgba(15, 23, 42, 0.25);
  transition: transform 420ms ease, box-shadow 420ms ease, border-color 420ms ease, opacity 420ms ease;
  transform: translate3d(0, 10px, 0) scale(1.02);
  opacity: 0.92;
}

.corebox-mock__media {
  flex: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;
  overflow: visible;
}

.corebox-mock__media-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #e5e7eb;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
  isolation: isolate;
}

.corebox-mock__media-glow,
.corebox-mock__media-image {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}

.corebox-mock__media-glow {
  z-index: 0;
  opacity: 0.8;
  filter: blur(18px) saturate(140%) brightness(106%);
  transform: scale(1.01, 1.02);
  transform-origin: center;
  border-radius: 18px;
  mix-blend-mode: screen;
  pointer-events: none;
}

.corebox-mock__media-image {
  z-index: 1;
}

.showcase-search.is-active .corebox-mock {
  transform: translate3d(0, 0, 0) scale(1);
  opacity: 1;
  border-color: rgba(15, 23, 42, 0.12);
}

@media (prefers-reduced-motion: reduce) {
  .corebox-mock {
    transition: none;
    transform: none;
  }
}
</style>
