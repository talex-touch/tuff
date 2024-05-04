<template>
  <div class="AppLayout-Wrapper fake-background" :class="{ mica, coloring, contrast }">
    <FlatLayout>
      <template #view>
        <router-view v-slot="{ Component }">
          <transition>
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>

        <ViewPlugin />
      </template>
      <template #title>
        <slot name="title" />
      </template>
    </FlatLayout>
  </div>
</template>

<script lang="ts" name="AppLayout" setup>
import FlatLayout from "./flat/FlatLayout.vue";
import ViewPlugin from "~/views/base/plugin/ViewPlugin.vue";
import { themeStyle, triggerThemeTransition } from "~/modules/storage/theme-style";

const mica = computed(() => themeStyle.value.theme.window === "Mica");
const coloring = computed(() => themeStyle.value.theme.addon.coloring);
const contrast = computed(() => themeStyle.value.theme.addon.contrast);

onMounted(() => {
  triggerThemeTransition(
    [innerWidth / 2, innerHeight / 2],
    themeStyle.value.theme.style.auto
      ? "auto"
      : themeStyle.value.theme.style.dark
        ? "dark"
        : "light"
  );
});
</script>

<style lang="scss">
.AppLayout-Aside {
  .NavBar-Home {
    max-height: 300px;
  }

  z-index: 1000;
  position: relative;
  padding: 0.1rem 0.5rem;
  display: flex;

  flex-direction: column;

  left: 0;

  width: var(--nav-width, 30px);
  // height: 100%;

  flex: 1;
  // flex-shrink: 0;

  box-sizing: border-box;

  --fake-opacity: 0.25;
  --fake-radius: 0;
  --fake-color: var(--el-fill-color-extra-light);

  transition: margin-right 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
  left 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
  width 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
  opacity 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

@keyframes viewEnter {
  from {
    opacity: 0;
    transform: translateX(100%) scale(0.85);
  }

  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

.AppLayout-Main {
  position: relative;
  display: flex;

  flex: 1;
  height: calc(100% - var(--ctr-height, 40px));

  overflow: hidden;
}

.AppLayout-Header {
  z-index: 1000;
  position: sticky;
  padding: 0 10px;
  display: flex;

  top: 0;

  height: var(--ctr-height, 40px);

  align-items: center;
  justify-content: center;

  box-sizing: border-box;

  --fake-opacity: 0.25;
  --fake-radius: 8px 8px 0 0;
  --fake-color: var(--el-fill-color-extra-light);

  transition: margin-bottom 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    top 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    height 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86),
    opacity 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.AppLayout-Controller {
  position: relative;
  margin: 0;

  display: flex;

  justify-content: flex-start;

  width: 100%;
  height: 5%;

  list-style: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.mica.AppLayout-Wrapper {
  --fake-inner-opacity: 0.75;
}

.AppLayout-Wrapper {
  span.tag.version {
    margin-left: 10px;

    width: 110px;

    opacity: 0.75;
    font-size: 12px;
  }

  .AppLayout-View {
    z-index: 100;
    position: relative;

    //width: calc(100% - 70px);
    // height: calc(100% - 30px);
    flex: 1;

    box-sizing: border-box;

    opacity: 0;
    -webkit-app-region: no-drag;
    animation: viewEnter 0.25s 0.5s forwards;
  }

  .AppLayout-Container {
    position: relative;
    //padding: 10px;

    height: 100%;
    width: 100%;

    box-sizing: border-box;
  }

  --nav-width: 70px;
  --ctr-height: 40px;

  position: relative;
  display: flex;

  height: 100%;
  width: 100%;

  top: 0;

  box-sizing: border-box;
  -webkit-app-region: drag;
}
</style>
