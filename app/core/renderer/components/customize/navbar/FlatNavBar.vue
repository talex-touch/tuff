<template>
  <ul class="FlatNavBar-Home" @click="activePlugin = ''">
    <p class="FlatNavBar-Title">MAIN</p>
    <TMenuTabs>
      <TMenuItem route="/home" name="Dashboard" icon="home-3" />
      <TMenuItem route="/market" name="Market" icon="quill-pen" />
      <TMenuItem route="/plugin" name="Plugin" icon="plug-2" />
      <TMenuItem route="/setting" name="Setting" icon="settings-6" />
    </TMenuTabs>
  </ul>

  <ul class="NavBar-Programs">
    <p class="FlatNavBar-Title">PLUGINS</p>
    <slot name="plugin-nav" />
  </ul>
</template>

<script name="FlatNavBar" setup>
import TMenuTabs from "@comp/tabs/TMenuTabs.vue";
import TMenuItem from "@comp/tabs/TMenuItem.vue";
import { inject } from "vue";

const activePlugin = inject('activePlugin')

</script>

<style lang="scss" scoped>
.NavBar-Programs {
  position: relative;
  padding: 0;
  display: flex;
  flex-direction: column;

  width: 100%;

  box-sizing: border-box;
  border-radius: 8px;
  --fake-radius: 8px;
  --fake-opacity: 0;

  -webkit-app-region: no-drag;

  :deep(.scale-upper.active) {
    .IconButton-Container {
      transform: scale(.75);
    }
  }

  :deep(.IconButton-Container) {

    --fake-opacity: 0;
    --fake-inner-opacity: 0;
    --fake-radius: 8px;
    transform: scale(.85);
  }
}

:deep(.FlatNavBar-Title) {
  margin: 0 0 10px 0;

  opacity: .25;
  font-size: 12px;
  font-weight: 600;
}

.FlatNavBar-Home {
  * {
    -webkit-app-region: no-drag;
  }

  position: relative;
  margin: 0;
  padding: 10px 0;
  display: flex;
  flex-direction: column;

  justify-content: space-between;

  width: 100%;

  box-sizing: border-box;
}
</style>