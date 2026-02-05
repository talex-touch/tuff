<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import TuffAiDemo from "./ai/TuffAiDemo.vue";
import TuffAiFeatureCard from "./ai/TuffAiFeatureCard.vue";
import TuffLandingIntelligenceTitle from "./TuffLandingIntelligenceTitle.vue";
import TuffLandingIntelligenceHeader from "./TuffLandingIntelligenceHeader.vue";
import TuffLandingIntelligenceBackground from "./TuffLandingIntelligenceBackground.vue";

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

type ScrollTriggerClass = typeof import("gsap/ScrollTrigger")["ScrollTrigger"];
type ScrollTriggerInstance = InstanceType<ScrollTriggerClass>;
type GsapContext = gsap.Context;
type GsapTimeline = gsap.core.Timeline;

const cardRef = ref<HTMLElement | null>(null);
const borderRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const controlsRef = ref<HTMLElement | null>(null);
const featureCardsRef = ref<HTMLElement | null>(null);
const backgroundRef = ref<HTMLElement | null>(null);

let scrollTriggerRegistered = false;
let gsapContext: GsapContext | null = null;
let scrollTrigger: ScrollTriggerInstance | null = null;
let enterTimeline: GsapTimeline | null = null;
let exitTimeline: GsapTimeline | null = null;

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
      activeScenario.value = scenarios[nextIndex] ?? activeScenario.value;
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

async function setupGsapAnimations() {
  const triggerEl = cardRef.value;
  const borderEl = borderRef.value;
  const contentEl = contentRef.value;
  const controlsEl = controlsRef.value;
  const featureCardsEl = featureCardsRef.value;
  const backgroundEl = backgroundRef.value;
  const sectionEl = triggerEl?.closest("section") ?? null;
  const triggerTarget = sectionEl ?? triggerEl;
  const textTargets = [
    sectionEl?.querySelector<HTMLElement>(".ai-overview-sticky") ?? null,
    sectionEl?.querySelector<HTMLElement>(".ai-overview-header") ?? null,
  ].filter((target): target is HTMLElement => Boolean(target));

  if (!triggerEl || !borderEl || !contentEl || !controlsEl || !featureCardsEl || !backgroundEl)
    return;

  const [{ default: gsap }, scrollTriggerModule] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  const { ScrollTrigger } = scrollTriggerModule;

  if (!scrollTriggerRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    scrollTriggerRegistered = true;
  }

  gsapContext = gsap.context(() => {
    gsap.set(textTargets, { opacity: 0, y: 18 });
    gsap.set(contentEl, { opacity: 0, y: 20, scale: 0.98, transformOrigin: "center" });
    gsap.set(controlsEl, { opacity: 0, y: 12 });
    gsap.set(featureCardsEl, { opacity: 0, y: 16 });
    gsap.set(backgroundEl, { opacity: 0, scale: 1.02, transformOrigin: "center" });
    gsap.set(borderEl, { opacity: 0, scale: 0.96, transformOrigin: "center" });

    enterTimeline = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } })
      .to(textTargets, { opacity: 1, y: 0, duration: 0.45, stagger: 0.08 })
      .to([contentEl, backgroundEl], { opacity: 1, y: 0, scale: 1, duration: 0.6 }, ">-0.05")
      .to(controlsEl, { opacity: 1, y: 0, duration: 0.4 }, ">-0.05")
      .to(featureCardsEl, { opacity: 1, y: 0, duration: 0.45 }, ">-0.05")
      .to(borderEl, { opacity: 1, scale: 1, duration: 0.4 }, ">-0.05");

    exitTimeline = gsap.timeline({ paused: true, defaults: { ease: "power2.in" } })
      .to(borderEl, { opacity: 0, scale: 0.98, duration: 0.25 })
      .to(
        [...textTargets, contentEl, controlsEl, featureCardsEl, backgroundEl],
        { opacity: 0, y: 16, scale: 0.99, duration: 0.45 },
        ">-0.05",
      );

    scrollTrigger = ScrollTrigger.create({
      trigger: triggerTarget,
      start: "top 80%",
      end: "bottom 15%",
      onEnter: () => {
        exitTimeline?.pause();
        enterTimeline?.restart();
      },
      onEnterBack: () => {
        exitTimeline?.pause();
        enterTimeline?.restart();
      },
      onLeave: () => {
        enterTimeline?.pause();
        exitTimeline?.restart();
      },
      onLeaveBack: () => {
        enterTimeline?.pause();
        exitTimeline?.restart();
      },
    });
  }, triggerEl);
}

onMounted(() => {
  rafId = requestAnimationFrame(animate);
  void setupGsapAnimations();
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  scrollTrigger?.kill();
  gsapContext?.revert();
  gsapContext = null;
  scrollTrigger = null;
  enterTimeline = null;
  exitTimeline = null;
});
</script>

<template>
  <TuffLandingSection
    :sticky="aiOverview.eyebrow"
    :title="aiOverview.headline"
    :subtitle="aiOverview.subheadline"
    sticky-class="ai-overview-sticky"
    header-class="ai-overview-header"
    :reveal-options="{
      targetSelector: '[data-ai-reveal]',
    }"
  >
    <template #decoration>
      <div ref="backgroundRef" class="absolute inset-0">
        <TuffLandingIntelligenceHeader full-screen :display-title="false" />
        <TuffLandingIntelligenceBackground />
      </div>
    </template>

    <!-- 演示卡片 -->
    <div
      ref="cardRef"
      class="relative group"
      @mouseenter="pauseRotation"
      @mouseleave="resumeRotation"
    >
      <div
        ref="borderRef"
        class="absolute -inset-1 bg-gradient-to-b from-white/10 to-transparent rounded-[24px] blur-sm opacity-50 group-hover:opacity-75 transition-opacity duration-500"
      />

      <div
        ref="contentRef"
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
          ref="controlsRef"
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
    <div ref="featureCardsRef" class="grid gap-3 md:grid-cols-3">
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
