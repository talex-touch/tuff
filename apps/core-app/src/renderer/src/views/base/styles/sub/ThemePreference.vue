<script setup lang="ts" name="ThemePreference">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import FormTemplate from '~/components/base/template/FormTemplate.vue'

const route = useRoute()
const { t } = useI18n()

const copyWriting = computed(() => {
  const theme: string = route.query.theme as string
  const key = `themePreference.${theme}`
  const fallbackKey = 'themePreference.Default'

  // Check if the key exists, otherwise use the fallback
  const options = { missing: () => t(fallbackKey) } as unknown as Parameters<typeof t>[2]
  return t(key, {}, options)
})
</script>

<template>
  <FormTemplate
    content-style="width: calc(100% - 5rem);height: calc(100% - 10rem)"
    class="ThemePreference-Container"
  >
    <template #header>
      <div items-center flex>
        <div
          p-2
          class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic"
          @click="() => $router.back()"
        />
        <p v-shared-element:[`theme-preference-${route.query.theme}`] my-4 font-extrabold text-2xl>
          {{ route.query.theme }}
        </p>
      </div>
    </template>

    <div class="ThemePreference-Content">
      <p>{{ copyWriting }}</p>
      <div
        v-shared-element:[`theme-preference-${route.query.theme}-img`]
        class="ThemePreference-Display"
        :class="route.query.theme"
      />
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

    opacity: 0.75;
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
    background-image: url('~/assets/bg/apparent.jpg');
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
