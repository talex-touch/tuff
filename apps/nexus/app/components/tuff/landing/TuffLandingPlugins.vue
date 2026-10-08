<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { HairlineFigureName } from './TuffLandingHairline.vue'
import { computed, h } from 'vue'
import AppleCard from '../carousel/apple/AppleCard.vue'
import AppleCardCarousel from '../carousel/apple/AppleCardCarousel.vue'
import AppleCarouselItem from '../carousel/apple/AppleCarouselItem.vue'
import PluginCardCalendar from './plugins/cards/PluginCardCalendar.vue'
import PluginCardFigma from './plugins/cards/PluginCardFigma.vue'
import PluginCardGithub from './plugins/cards/PluginCardGithub.vue'
import PluginCardHairline from './plugins/cards/PluginCardHairline.vue'
import PluginCardNotion from './plugins/cards/PluginCardNotion.vue'
import PluginCardSpotify from './plugins/cards/PluginCardSpotify.vue'
import PluginCardVSCode from './plugins/cards/PluginCardVSCode.vue'
import TuffLandingSection from './TuffLandingSection.vue'

// Two runs of cards. The illustrated integration cards lead, as before; after
// them come plugins that exist today, each with the word its manifest answers
// to. JSON Formatter and Browser Open are listed in the store; the other four
// ship pre-installed and have no store page, so they open the plugins guide.

type ShowcaseKey = 'notion' | 'figma' | 'github' | 'vscode' | 'calendar' | 'spotify'
type PluginKey = 'json' | 'browser' | 'vscodeProjects' | 'image' | 'hosts' | 'aiSessions'

const { t } = useI18n()
const router = useRouter()

const PLUGINS_GUIDE = '/docs/guide/features/plugins'

const SHOWCASE: { key: ShowcaseKey, component: Component }[] = [
  { key: 'notion', component: PluginCardNotion },
  { key: 'figma', component: PluginCardFigma },
  { key: 'github', component: PluginCardGithub },
  { key: 'vscode', component: PluginCardVSCode },
  { key: 'calendar', component: PluginCardCalendar },
  { key: 'spotify', component: PluginCardSpotify },
]

const PLUGINS: { key: PluginKey, figure: HairlineFigureName, to: RouteLocationRaw }[] = [
  { key: 'json', figure: 'sieve', to: { path: '/store', query: { query: 'JSON' } } },
  { key: 'browser', figure: 'router', to: { path: '/store', query: { query: 'browser' } } },
  { key: 'vscodeProjects', figure: 'laptop', to: PLUGINS_GUIDE },
  { key: 'image', figure: 'loupe', to: PLUGINS_GUIDE },
  { key: 'hosts', figure: 'padlock', to: PLUGINS_GUIDE },
  { key: 'aiSessions', figure: 'branches', to: PLUGINS_GUIDE },
]

const plugins = computed(() => ({
  eyebrow: t('landing.os.plugins.eyebrow'),
  headline: t('landing.os.plugins.headline'),
  subheadline: t('landing.os.plugins.subheadline'),
}))

const cards = computed(() => [
  ...SHOWCASE.map(item => ({
    id: item.key,
    src: '',
    category: t(`landing.os.plugins.extensions.${item.key}.name`),
    title: t(`landing.os.plugins.extensions.${item.key}.description`),
    to: { path: '/store', query: { query: item.key } } as RouteLocationRaw,
    component: item.component,
  })),
  ...PLUGINS.map((plugin) => {
    const base = `landing.os.plugins.extensions.${plugin.key}`
    const face = {
      figure: plugin.figure,
      summon: t(`${base}.summon`),
      label: t(`${base}.label`),
    }
    return {
      id: plugin.key,
      src: '',
      category: t(`${base}.name`),
      title: t(`${base}.description`),
      to: plugin.to,
      component: () => h(PluginCardHairline, face),
    }
  }),
])

function handleCardClick(card: Record<string, unknown>, _index: number) {
  if (card.to)
    router.push(card.to as RouteLocationRaw)
}
</script>

<template>
  <TuffLandingSection
    id="store"
    :sticky="plugins.eyebrow"
    :title="plugins.headline"
    :subtitle="plugins.subheadline"
    section-class="TuffLandingPlugins min-h-screen flex flex-col justify-center"
    container-class="max-w-6xl w-full space-y-4"
    title-class="text-[clamp(.7rem,1vw+1.4rem,1.2rem)] font-bold leading-tight"
    subtitle-class="mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 42,
        duration: 1.05,
      },
    }"
  >
    <div class="TuffLandingPlugins-Main">
      <AppleCardCarousel :prev-label="t('landing.os.plugins.prev')" :next-label="t('landing.os.plugins.next')">
        <AppleCarouselItem
          v-for="(card, index) in cards"
          :key="index"
          :index="index"
        >
          <AppleCard
            :card="card"
            :index="index"
            :layout="true"
            :on-card-click="handleCardClick"
          />
        </AppleCarouselItem>
      </AppleCardCarousel>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.TuffLandingPlugins-Main {
  position: relative;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
}

:deep(.AppleCardCarousel-Track) {
  --edge-mask-size: clamp(24px, 6vw, 120px);
  padding-block: clamp(1rem, 3vh, 3rem);
  max-height: 100%;
  mask-image: linear-gradient(
    90deg,
    transparent 0,
    black var(--edge-mask-size),
    black calc(100% - var(--edge-mask-size)),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    90deg,
    transparent 0,
    black var(--edge-mask-size),
    black calc(100% - var(--edge-mask-size)),
    transparent 100%
  );
  mask-size: 100% 100%;
  -webkit-mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}

/* Cards keep their 40rem height where it fits; on a 900px screen that left the
   row running under the eyebrow pill, so they give up what the section needs. */
@media (min-width: 768px) {
  .TuffLandingPlugins-Main :deep(.apple-card) {
    height: min(40rem, calc(100dvh - 22rem));
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

</style>
