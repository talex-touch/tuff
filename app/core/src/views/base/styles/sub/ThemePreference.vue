<script setup lang="ts" name="ThemePreference">
import FormTemplate from "@comp/base/template/FormTemplate.vue";
import { useRoute } from "vue-router";

const route = useRoute();

const copyWritings = reactive({
  Default: {
    en: "Embrace the familiar comfort of the default window style.",
    zh: "拥抱默认窗口风格的熟悉舒适。",
  },
  Mica: {
    en:
      "Immerse yourself in a mesmerizing, real-time glass-like background adorned with a delightful noise texture!",
    zh: "沉浸在迷人的实时玻璃般背景中，点缀着愉悦的噪点纹理！",
  },
  Filter: {
    en:
      "Delight in a window background featuring a captivating tracked-blur modal wallpaper that adds a touch of elegance to your screen.",
    zh:
      "享受窗口背景的迷人之处，采用引人入胜的跟踪模糊模态壁纸，为您的屏幕增添一丝优雅。",
  },
});

const copyWriting = computed(() => {
  const theme: string = route.query.theme as string;

  return (
    Object.getOwnPropertyDescriptor(copyWritings, theme)?.value.en ||
    copyWritings["Default"].en
  );
});
</script>

<template>
  <FormTemplate
    contentStyle="width: calc(100% - 5rem);height: calc(100% - 10rem)"
    class="ThemePreference-Container"
  >
    <template #header>
      <div items-center flex>
        <div
          p-2
          @click="() => $router.back()"
          class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic"
        />
        <p
          my-4
          font-extrabold
          text-2xl
          v-shared-element:[`theme-preference-${route.query.theme}`]
        >
          {{ route.query.theme }}
        </p>
      </div>
    </template>

    <div class="ThemePreference-Content">
      <p>{{ copyWriting }}</p>
      <div
        class="ThemePreference-Display"
        :class="route.query.theme"
        v-shared-element:[`theme-preference-${route.query.theme}-img`]
      ></div>
    </div>
  </FormTemplate>
</template>

<style lang="scss">
.ThemePreference-Content,
.ThemePreference-Display {
  position: relative;

  width: 100%;
  height: 100%;

  p {
    z-index: 100;
    position: absolute;

    top: 80%;
    left: 0;

    width: 100%;

    opacity: 07.5;
    color: white;
    font-size: 1.1rem;
    line-height: 1.5;
    text-align: center;
    mix-blend-mode: difference;
    filter: brightness(500%);
    text-shadow: 0 0 10px white;
  }
}

.ThemePreference-Container {
  .i-ri-arrow-left-s-line {
    font-size: 2rem;
    color: var(--color-primary);
  }

  .fake-background {
    // background-color: var(--color-primary);
    text-align: center;
  }

  .ThemePreference-Display {
    animation: dynamicDisplays 30s infinite alternate;
    animation-fill-mode: both;

    background-position: 0% 0%;
    background-size: 120% 120%;
    background-repeat: no-repeat;
    background-image: url("@assets/bg/apparent.jpg");
  }
}

@keyframes dynamicDisplays {
  0% {
    background-position: 0% 0%;
  }

  30% {
    background-size: 150% 150%;
    background-position: 150% 0%;
  }

  50% {
    background-size: 120% 120%;
    background-position: 120% 120%;
  }

  70% {
    background-size: 150% 150%;
    background-position: 0% 150%;
  }

  100% {
    background-size: 120% 120%;
    background-position: 120% 120%;
  }
}
</style>
