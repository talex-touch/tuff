<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import TuffAiDemo from "./ai/TuffAiDemo.vue";
import TuffAiFeatureCard from "./ai/TuffAiFeatureCard.vue";
import TuffLandingIntelligenceTitle from "./TuffLandingIntelligenceTitle.vue";

const { t } = useI18n();

const aiOverview = computed(() => ({
  eyebrow: t("landing.os.aiOverview.eyebrow"),
  headline: t("landing.os.aiOverview.headline"),
  subheadline: t("landing.os.aiOverview.subheadline"),
}));

const scenarios = ["chat", "assist", "preview"] as const;
type ScenarioType = (typeof scenarios)[number];

const featureCards = computed(() => [
  {
    title: t("landing.os.aiOverview.cards.chat.title"),
    copy: t("landing.os.aiOverview.cards.chat.copy"),
    icon: "i-carbon-chat",
    scenario: "chat" as const,
  },
  {
    title: t("landing.os.aiOverview.cards.assist.title"),
    copy: t("landing.os.aiOverview.cards.assist.copy"),
    icon: "i-carbon-text-annotation-toggle",
    scenario: "assist" as const,
  },
  {
    title: t("landing.os.aiOverview.cards.preview.title"),
    copy: t("landing.os.aiOverview.cards.preview.copy"),
    icon: "i-carbon-view",
    scenario: "preview" as const,
  },
]);

const activeScenario = ref<ScenarioType>("chat");
const progress = ref(0);
const isPaused = ref(false);

const SCENARIO_DURATION = 16000;
let lastTime = 0;
let rafId: number | null = null;

function animate(timestamp: number) {
  if (!lastTime) lastTime = timestamp;

  if (!isPaused.value) {
    const delta = timestamp - lastTime;
    progress.value += delta / SCENARIO_DURATION;

    if (progress.value >= 1) {
      progress.value = 0;
      const currentIndex = scenarios.indexOf(activeScenario.value);
      const nextIndex = (currentIndex + 1) % scenarios.length;
      activeScenario.value = scenarios[nextIndex];
    }
  }

  lastTime = timestamp;
  rafId = requestAnimationFrame(animate);
}

function selectCard(scenario: ScenarioType) {
  activeScenario.value = scenario;
  progress.value = 0;
  // 重置计时器以避免立即切换
  lastTime = performance.now();
}

function pauseRotation() {
  isPaused.value = true;
}

function resumeRotation() {
  isPaused.value = false;
  lastTime = performance.now();
}

onMounted(() => {
  rafId = requestAnimationFrame(animate);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
});
</script>

<template>
  <TuffLandingSection
    :sticky="aiOverview.eyebrow"
    :title="aiOverview.headline"
    :subtitle="aiOverview.subheadline"
    section-class="min-h-screen flex flex-col justify-center py-24"
    :reveal-options="{
      from: {
        opacity: 0,
        y: 40,
        duration: 1.2,
        ease: 'power3.out',
      },
    }"
  >
    <template #decoration>
      <div
        class="absolute left-[-20%] top-0 h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.15),_transparent_70%)] blur-[120px] opacity-60"
      />
      <div
        class="absolute right-[-10%] top-[20%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.12),_transparent_70%)] blur-[100px] opacity-50"
      />
    </template>

    <!-- 演示卡片 -->
    <div
      class="relative group"
      data-reveal
      @mouseenter="pauseRotation"
      @mouseleave="resumeRotation"
    >
      <div
        class="absolute -inset-1 bg-gradient-to-b from-white/10 to-transparent rounded-[24px] blur-sm opacity-50 group-hover:opacity-75 transition-opacity duration-500"
      />

      <div
        class="relative overflow-hidden rounded-[20px] bg-[#0a0a0f] border border-white/10 shadow-2xl"
      >
        <!-- Header Decoration Light -->
        <div
          class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
        />
        <div
          class="absolute op-50 top-0 inset-x-0 h-[120px] bg-gradient-to-b from-white/5 to-transparent pointer-events-none"
        />

        <!-- Window Control Points -->
        <div
          class="relative z-10 flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.02]"
        >
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#FF5F57] shadow-sm" />
            <span class="w-3 h-3 rounded-full bg-[#FEBC2E] shadow-sm" />
            <span class="w-3 h-3 rounded-full bg-[#28C840] shadow-sm" />
          </div>
          <div class="text-[16px] font-medium text-white/30 tracking-wide">
            <TuffLandingIntelligenceTitle title="Tuff Intelligence" />
          </div>
          <div class="w-14" />
          <!-- Spacer for balance -->
        </div>

        <!-- Demo Area -->
        <div class="relative h-auto flex items-center justify-center">
          <div
            class="absolute inset-0"
          />
          <TuffAiDemo :auto-play="true" :active-scenario="activeScenario" />
        </div>
      </div>
    </div>

    <!-- Feature Cards -->
    <div class="grid gap-3 md:grid-cols-3" data-reveal>
      <TuffAiFeatureCard
        v-for="(card, index) in featureCards"
        :key="index"
        :title="card.title"
        :copy="card.copy"
        :icon="card.icon"
        :active="activeScenario === card.scenario"
        :progress="activeScenario === card.scenario ? progress : 0"
        @click="selectCard(card.scenario)"
        @mouseenter="pauseRotation"
        @mouseleave="resumeRotation"
      />
    </div>
  </TuffLandingSection>
</template>
