<script setup lang="ts">
import { computed } from 'vue'
import AppleCard from '../carousel/apple/AppleCard.vue'
import AppleCardCarousel from '../carousel/apple/AppleCardCarousel.vue'
import AppleCarouselItem from '../carousel/apple/AppleCarouselItem.vue'
import PluginCardCalendar from './plugins/cards/PluginCardCalendar.vue'
import PluginCardFigma from './plugins/cards/PluginCardFigma.vue'
import PluginCardGithub from './plugins/cards/PluginCardGithub.vue'
import PluginCardNotion from './plugins/cards/PluginCardNotion.vue'
import PluginCardSpotify from './plugins/cards/PluginCardSpotify.vue'
import PluginCardTranslate from './plugins/cards/PluginCardTranslate.vue'
import PluginCardVSCode from './plugins/cards/PluginCardVSCode.vue'

const { t } = useI18n()
const router = useRouter()

const capabilityKeys = ['notion', 'figma', 'github', 'vscode', 'calendar', 'spotify'] as const
const capabilityIcons = {
  notion: 'i-carbon-logo-notion',
  figma: 'i-carbon-logo-figma',
  github: 'i-carbon-logo-github',
  vscode: 'i-carbon-logo-vscode',
  calendar: 'i-carbon-calendar',
  spotify: 'i-carbon-logo-spotify',
} as const

const plugins = computed(() => ({
  eyebrow: t('landing.os.plugins.eyebrow'),
  headline: t('landing.os.plugins.headline'),
  subheadline: t('landing.os.plugins.subheadline'),
  extensions: capabilityKeys.map(key => ({
    id: key,
    icon: capabilityIcons[key],
    name: t(`landing.os.plugins.extensions.${key}.name`),
    description: t(`landing.os.plugins.extensions.${key}.description`),
  })),
}))

const components = [
  PluginCardNotion,
  PluginCardFigma,
  PluginCardGithub,
  PluginCardVSCode,
  PluginCardCalendar,
  PluginCardSpotify,
  PluginCardTranslate,
]

const cards = computed(() => (plugins.value.extensions ?? []).map((item, index) => ({
  id: item.id,
  src: '',
  icon: item.icon,
  category: item.name,
  title: item.description,
  component: index < 5 ? components[index] : components[5],
})))

function handleCardClick(card: { id?: string }) {
  if (!card?.id)
    return
  router.push({
    path: '/market',
    query: {
      query: card.id,
    },
  })
}
</script>

<template>
  <TuffLandingSection
    id="market"
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
      <AppleCardCarousel>
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
          >
            <div
              :key="`dummy-content${index}`"
              class="mb-4 rounded-3xl bg-[#F5F5F7] p-8 dark:bg-neutral-800 md:p-14"
            >
              <p
                class="mx-auto max-w-3xl text-base text-neutral-600 font-sans md:text-2xl dark:text-neutral-400"
              >
                <span class="text-neutral-700 font-bold dark:text-neutral-200">
                  The first rule of Apple club is that you boast about Apple club.
                </span>
                Keep a journal, quickly jot down a grocery list, and take amazing class notes. Want to
                convert those notes to text? No problem. Langotiya jeetu ka mara hua yaar is ready to
                capture every thought.
              </p>
              <img
                src="https://assets.aceternity.com/macbook.png"
                alt="Macbook mockup from Aceternity UI"
                height="500"
                width="500"
                class="mx-auto size-full object-contain md:size-1/2"
              >
            </div>
          </AppleCard>
        </AppleCarouselItem>
      </AppleCardCarousel>
    </div>
  </TuffLandingSection>
</template>

<style scoped>
.TuffLandingPlugins-Main {
  position: relative;
}

:deep(.AppleCardCarousel-Track) {
  --edge-mask-size: clamp(24px, 6vw, 120px);
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
</style>
