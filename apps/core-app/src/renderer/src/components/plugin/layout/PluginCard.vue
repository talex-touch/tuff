<template>
  <div class="PluginCard-Container">
    <p class="PluginCard-Header">
      <span class="PluginCard-Name">
        {{ plugin.pluginInfo.name }}
      </span>
      <span class="PluginCard-Version">{{ plugin.pluginInfo.version }}</span>
    </p>

    <p class="PluginCard-Desc">
      {{ plugin.pluginInfo.description }}
    </p>

    <div v-wave class="PluginCard-Button">
      {{ $t('base.details') }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'PluginCard'
}
</script>

<script setup>
const props = defineProps({
  plugin: {
    type: Object,
    required: true
  }
})
</script>

<style lang="scss" scoped>
.PluginCard-Button {
  padding: 8px 12px;
  margin-bottom: 20px;

  cursor: pointer;
  user-select: none;
  text-align: center;

  border-radius: 5px;
  background: linear-gradient(
    to right,
    var(--el-color-primary-light-3),
    var(--el-color-primary-light-5),
    var(--el-color-primary-light-3)
  );
}

.PluginCard-Desc {
  position: relative;

  height: max-content;
}

.PluginCard-Header {
  .PluginCard-Name {
    &:after {
      z-index: -1;
      content: '';
      position: absolute;

      left: -2%;
      bottom: 10%;

      width: 104%;
      height: 5px;

      opacity: 0.5;
      border-radius: 5px;
      background-color: var(--el-color-primary);
    }
    position: relative;
    margin-right: 48px;
    display: inline-block;

    width: max-content;

    font-size: 18px;
    font-weight: 600;
  }
  .PluginCard-Version {
    &:after {
      z-index: -1;
      content: '';
      position: absolute;

      left: -5%;
      bottom: -10%;

      width: 110%;
      height: 120%;

      opacity: 0.25;
      border-radius: 5px;
      background-color: var(--el-color-primary);
    }
    position: relative;
    display: inline-block;

    width: max-content;

    font-size: 16px;
    font-weight: 600;
  }
  position: relative;
  display: flex;

  justify-content: space-between;
}

.PluginCard-Container {
  position: relative;
  padding: 10px 20px;

  display: flex;
  flex-direction: column;

  height: 100%;

  box-sizing: border-box;
  // linear background image
  //background: linear-gradient(to bottom right, var(--el-color-primary-light-7), var(--el-color-primary-light-9));
  //background-size: 200% 200%;
  //animation: waving 2.5s infinite;
  transition: 0.25s;
}

@keyframes waving {
  0% {
    filter: hue-rotate(0);
    background-position-x: 0;
    background-position-y: 0;
  }
  25% {
    filter: hue-rotate(15deg);
    background-position-x: 100%;
    background-position-y: 100%;
  }
  50% {
    filter: hue-rotate(5deg);
    background-position-x: 200%;
    background-position-y: 200%;
  }
  75% {
    filter: hue-rotate(15deg);
    background-position-x: 100%;
    background-position-y: 100%;
  }
  100% {
    filter: hue-rotate(0);
    background-position-x: 200%;
    background-position-y: 200%;
  }
}
</style>
