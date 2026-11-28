<script setup lang="ts">
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveLocaleFromPath, toLocalizedWebPath } from '~/utils/web-route'

const props = withDefaults(defineProps<{
  modelValue?: boolean
}>(), {
  modelValue: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { t, locale } = useI18n()
const route = useRoute()
const updatesHref = computed(() => toLocalizedWebPath('/updates', resolveLocaleFromPath(route.path)))

type VideoLang = 'zh' | 'en'
const currentLang = ref<VideoLang>('zh')
const videoRef = ref<HTMLVideoElement | null>(null)
const currentTime = ref(0)
const isPlaying = ref(false)

const copy = computed(() => ({
  title: t('landing.nexus.promoVideo.modalTitle'),
  subtitle: t('landing.nexus.promoVideo.modalSubtitle'),
  close: t('landing.nexus.promoVideo.close'),
  switchZh: t('landing.nexus.promoVideo.switchZh'),
  switchEn: t('landing.nexus.promoVideo.switchEn'),
  duration: t('landing.nexus.promoVideo.duration'),
  tagline: t('landing.nexus.promoVideo.tagline'),
  openReleases: t('landing.nexus.promoVideo.openReleases'),
  chaptersTitle: t('landing.nexus.promoVideo.chaptersTitle'),
  chapters: [
    { time: 0, label: t('landing.nexus.promoVideo.chapters.summon') },
    { time: 2, label: t('landing.nexus.promoVideo.chapters.picks') },
    { time: 6, label: t('landing.nexus.promoVideo.chapters.context') },
    { time: 10, label: t('landing.nexus.promoVideo.chapters.yesterday') },
    { time: 15.5, label: t('landing.nexus.promoVideo.chapters.fuzzy') },
    { time: 19.75, label: t('landing.nexus.promoVideo.chapters.insideFiles') },
    { time: 24.75, label: t('landing.nexus.promoVideo.chapters.clipboard') },
    { time: 28.5, label: t('landing.nexus.promoVideo.chapters.instant') },
    { time: 32, label: t('landing.nexus.promoVideo.chapters.ai') },
    { time: 36, label: t('landing.nexus.promoVideo.chapters.ecosystem') },
  ],
}))

const videoSrc = computed(() => {
  return currentLang.value === 'zh'
    ? '/videos/tuff-v2.4.14-promo-zh.mp4'
    : '/videos/tuff-v2.4.14-promo-en.mp4'
})

const videoPoster = computed(() => {
  return currentLang.value === 'zh'
    ? '/videos/tuff-v2.4.14-promo-poster-zh.jpg'
    : '/videos/tuff-v2.4.14-promo-poster-en.jpg'
})

const activeChapterIndex = computed(() => {
  const current = currentTime.value
  const list = copy.value.chapters
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (item && current >= item.time - 0.3)
      return i
  }
  return 0
})

function closeModal() {
  emit('update:modelValue', false)
}

function handleTimeUpdate() {
  if (videoRef.value)
    currentTime.value = videoRef.value.currentTime
}

function handlePlay() {
  isPlaying.value = true
}

function handlePause() {
  isPlaying.value = false
}

function seekToChapter(time: number) {
  if (!videoRef.value)
    return
  videoRef.value.currentTime = time
  void videoRef.value.play().catch(() => {})
}

function switchLanguage(lang: VideoLang) {
  if (currentLang.value === lang)
    return
  const wasPlaying = isPlaying.value
  const preservedTime = videoRef.value?.currentTime ?? 0
  currentLang.value = lang

  nextTick(() => {
    if (!videoRef.value)
      return
    videoRef.value.currentTime = preservedTime
    if (wasPlaying)
      void videoRef.value.play().catch(() => {})
  })
}

function onKeydown(e: KeyboardEvent) {
  if (!props.modelValue)
    return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal()
  }
  else if (e.key === ' ' && e.target === document.body) {
    e.preventDefault()
    if (!videoRef.value)
      return
    if (videoRef.value.paused)
      void videoRef.value.play().catch(() => {})
    else
      videoRef.value.pause()
  }
}

function activateOpenState() {
  currentLang.value = locale.value.startsWith('zh') ? 'zh' : 'en'
  if (hasDocument())
    document.body.style.overflow = 'hidden'
  if (hasWindow())
    window.addEventListener('keydown', onKeydown)
  nextTick(() => {
    if (videoRef.value) {
      videoRef.value.currentTime = 0
      void videoRef.value.play().catch(() => {
        // Autoplay may be restricted without user interaction; user can press play
      })
    }
  })
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    activateOpenState()
  }
  else {
    if (hasDocument())
      document.body.style.overflow = ''
    if (hasWindow())
      window.removeEventListener('keydown', onKeydown)
    if (videoRef.value) {
      videoRef.value.pause()
      videoRef.value.currentTime = 0
    }
  }
})

onMounted(() => {
  if (props.modelValue)
    activateOpenState()
})

onBeforeUnmount(() => {
  if (hasDocument())
    document.body.style.overflow = ''
  if (hasWindow())
    window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <Transition name="video-ovl">
        <div
          v-if="modelValue"
          class="TuffVideoModal"
          role="dialog"
          aria-modal="true"
          :aria-label="copy.title"
          @click.self="closeModal"
        >
          <div class="TuffVideoModal-Dialog">
            <header class="TuffVideoModal-Header">
              <div class="TuffVideoModal-TitleGroup">
                <span class="TuffVideoModal-Badge">
                  <span class="i-carbon-play-filled-alt TuffVideoModal-PlayIcon" aria-hidden="true" />
                  <span>{{ copy.duration }}</span>
                </span>
                <div>
                  <h2 id="promo-video-title" class="TuffVideoModal-Title">
                    {{ copy.title }}
                  </h2>
                  <p class="TuffVideoModal-Subtitle">
                    {{ copy.subtitle }}
                  </p>
                </div>
              </div>

              <div class="TuffVideoModal-Actions">
                <!-- Language Switcher Pill -->
                <div class="TuffVideoModal-LangPill" role="radiogroup" aria-label="Video Language">
                  <button
                    type="button"
                    class="TuffVideoModal-LangBtn"
                    :class="{ 'is-active': currentLang === 'zh' }"
                    :aria-checked="currentLang === 'zh'"
                    role="radio"
                    @click="switchLanguage('zh')"
                  >
                    {{ copy.switchZh }}
                  </button>
                  <button
                    type="button"
                    class="TuffVideoModal-LangBtn"
                    :class="{ 'is-active': currentLang === 'en' }"
                    :aria-checked="currentLang === 'en'"
                    role="radio"
                    @click="switchLanguage('en')"
                  >
                    {{ copy.switchEn }}
                  </button>
                </div>

                <!-- Close Button -->
                <button
                  type="button"
                  class="TuffVideoModal-CloseBtn"
                  :aria-label="copy.close"
                  @click="closeModal"
                >
                  <span class="i-carbon-close" aria-hidden="true" />
                  <kbd class="TuffVideoModal-KeyHint">Esc</kbd>
                </button>
              </div>
            </header>

            <!-- Video Frame -->
            <div class="TuffVideoModal-VideoFrame">
              <video
                ref="videoRef"
                class="TuffVideoModal-Video"
                :src="videoSrc"
                :poster="videoPoster"
                controls
                playsinline
                preload="auto"
                @timeupdate="handleTimeUpdate"
                @play="handlePlay"
                @pause="handlePause"
              />
            </div>

            <!-- Chapter Timeline Navigation -->
            <div class="TuffVideoModal-ChaptersWrap">
              <span class="TuffVideoModal-ChaptersLabel">
                <span class="i-carbon-list-bulleted" aria-hidden="true" />
                <span>{{ copy.chaptersTitle }}</span>
              </span>
              <div class="TuffVideoModal-ChaptersList" role="tablist">
                <button
                  v-for="(chapter, idx) in copy.chapters"
                  :key="chapter.time"
                  type="button"
                  class="TuffVideoModal-ChapterChip"
                  :class="{ 'is-active': activeChapterIndex === idx }"
                  :aria-selected="activeChapterIndex === idx"
                  role="tab"
                  @click="seekToChapter(chapter.time)"
                >
                  {{ chapter.label }}
                </button>
              </div>
            </div>

            <!-- Footer Details -->
            <footer class="TuffVideoModal-Footer">
              <span class="TuffVideoModal-Tagline">
                <span class="TuffVideoModal-Dot" aria-hidden="true" />
                <span>{{ copy.tagline }}</span>
              </span>

              <div class="TuffVideoModal-FooterLinks">
                <NuxtLink
                  :to="updatesHref"
                  class="TuffVideoModal-ReleaseLink"
                  @click="closeModal"
                >
                  <span>{{ copy.openReleases }}</span>
                  <span class="i-carbon-arrow-right" aria-hidden="true" />
                </NuxtLink>
              </div>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.TuffVideoModal {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(4, 7, 13, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow-y: auto;
}

.TuffVideoModal-Dialog {
  position: relative;
  width: min(94vw, 1020px);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 1.4rem;
  border-radius: 20px;
  background: #0d1117;
  border: 1px solid rgba(246, 247, 244, 0.12);
  box-shadow: 0 32px 80px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05);
  color: #fff;
}

.TuffVideoModal-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.TuffVideoModal-TitleGroup {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.TuffVideoModal-Badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: rgba(56, 212, 153, 0.12);
  border: 1px solid rgba(56, 212, 153, 0.28);
  color: #38d499;
  font-size: 0.75rem;
  font-weight: 680;
  letter-spacing: 0.02em;
}

.TuffVideoModal-PlayIcon {
  font-size: 0.85rem;
}

.TuffVideoModal-Title {
  margin: 0;
  font-size: 1.12rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.01em;
}

.TuffVideoModal-Subtitle {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: rgba(246, 247, 244, 0.58);
}

.TuffVideoModal-Actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.TuffVideoModal-LangPill {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.06);
  border: 1px solid rgba(246, 247, 244, 0.1);
}

.TuffVideoModal-LangBtn {
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: rgba(246, 247, 244, 0.6);
  font-size: 0.78rem;
  font-weight: 560;
  cursor: pointer;
  transition: all 140ms ease;
}

.TuffVideoModal-LangBtn:hover {
  color: #fff;
}

.TuffVideoModal-LangBtn.is-active {
  background: rgba(246, 247, 244, 0.16);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.TuffVideoModal-CloseBtn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  border: 1px solid rgba(246, 247, 244, 0.1);
  background: rgba(246, 247, 244, 0.05);
  color: rgba(246, 247, 244, 0.8);
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 140ms ease;
}

.TuffVideoModal-CloseBtn:hover {
  border-color: rgba(246, 247, 244, 0.25);
  background: rgba(246, 247, 244, 0.12);
  color: #fff;
}

.TuffVideoModal-KeyHint {
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: rgba(246, 247, 244, 0.12);
  color: rgba(246, 247, 244, 0.6);
  font-size: 0.68rem;
  font-family: inherit;
}

.TuffVideoModal-VideoFrame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: #000;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.TuffVideoModal-Video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.TuffVideoModal-ChaptersWrap {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  overflow-x: auto;
  padding: 0.2rem 0;
  scrollbar-width: thin;
}

.TuffVideoModal-ChaptersLabel {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  color: rgba(246, 247, 244, 0.5);
  font-size: 0.76rem;
  font-weight: 560;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.TuffVideoModal-ChaptersList {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: nowrap;
}

.TuffVideoModal-ChapterChip {
  flex-shrink: 0;
  padding: 0.28rem 0.65rem;
  border-radius: 8px;
  border: 1px solid rgba(246, 247, 244, 0.08);
  background: rgba(246, 247, 244, 0.03);
  color: rgba(246, 247, 244, 0.65);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 140ms ease;
  white-space: nowrap;
}

.TuffVideoModal-ChapterChip:hover {
  border-color: rgba(246, 247, 244, 0.2);
  background: rgba(246, 247, 244, 0.08);
  color: #fff;
}

.TuffVideoModal-ChapterChip.is-active {
  border-color: rgba(56, 212, 153, 0.4);
  background: rgba(56, 212, 153, 0.12);
  color: #38d499;
  font-weight: 600;
}

.TuffVideoModal-Footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(246, 247, 244, 0.08);
  padding-top: 0.85rem;
  font-size: 0.8rem;
}

.TuffVideoModal-Tagline {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(246, 247, 244, 0.5);
}

.TuffVideoModal-Dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: #38d499;
  box-shadow: 0 0 8px rgba(56, 212, 153, 0.7);
}

.TuffVideoModal-ReleaseLink {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #38d499;
  text-decoration: none;
  font-weight: 560;
  transition: transform 140ms ease, opacity 140ms ease;
}

.TuffVideoModal-ReleaseLink:hover {
  opacity: 0.85;
  transform: translateX(2px);
}

/* Transitions */
.video-ovl-enter-active,
.video-ovl-leave-active {
  transition: opacity 220ms ease;
}

.video-ovl-enter-active .TuffVideoModal-Dialog {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease;
}

.video-ovl-leave-active .TuffVideoModal-Dialog {
  transition: transform 180ms ease, opacity 160ms ease;
}

.video-ovl-enter-from {
  opacity: 0;
}

.video-ovl-enter-from .TuffVideoModal-Dialog {
  opacity: 0;
  transform: scale(0.96) translateY(12px);
}

.video-ovl-leave-to {
  opacity: 0;
}

.video-ovl-leave-to .TuffVideoModal-Dialog {
  opacity: 0;
  transform: scale(0.97) translateY(8px);
}

@media (max-width: 640px) {
  .TuffVideoModal {
    padding: 0.75rem;
  }
  .TuffVideoModal-Dialog {
    padding: 1rem;
    border-radius: 16px;
  }
  .TuffVideoModal-Header {
    flex-direction: column;
    align-items: flex-start;
  }
  .TuffVideoModal-Actions {
    width: 100%;
    justify-content: space-between;
  }
  .TuffVideoModal-Footer {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .video-ovl-enter-active .TuffVideoModal-Dialog,
  .video-ovl-leave-active .TuffVideoModal-Dialog {
    transition: opacity 160ms ease;
    transform: none;
  }
}
</style>
