<script setup lang="ts">
defineProps<{
  theme: 'light' | 'dark' | 'system'
  active: boolean
}>()
</script>

<template>
  <div :class="[theme, active ? 'active' : '']" class="ThemeBlock">
    <div class="ThemeBlock-Inner">
      <div class="TheBlock-Inner-Aside">
        <div v-for="i in 4" :key="i" class="ThemeBlock-Inner-Aside-Item" />
      </div>
      <div class="ThemeBlock-Inner-Main">
        <p>ThisAI!</p>
        <div class="ThemeBlock-Inner-Main-Content" />
      </div>
    </div>

    <div class="ThemeBlock-Check">
      <div i-carbon:checkmark />
    </div>

    <div v-if="theme === 'system'" class="ThemeBlock-Differ">
      <ThemeBlock :active="false" theme="dark" />
    </div>
  </div>
</template>

<style lang="scss">
.ThemeBlock-Check {
  .active & {
    transform: scale(1);
  }
  position: absolute;
  display: flex;

  align-items: center;
  justify-content: center;

  left: 0.5rem;
  bottom: 0.5rem;

  color: #fff;
  width: 28px;
  height: 28px;

  transition: 0.25s;
  transform: scale(0);
  border-radius: 50%;
  background-color: var(--el-color-primary);
}

.ThemeBlock-Differ {
  .ThemeBlock-Check {
    left: 0.5rem;
    bottom: 0.75rem;
  }
  position: absolute;

  top: 2px;
  left: 2px;

  width: 50%;
  height: calc(100% - 4px);

  overflow: hidden;
  border-radius: 12px 0 0 12px;
  background-color: #1f1f1f;
  // mix-blend-mode: difference;
}

.ThemeBlock-Inner-Main {
  .ThemeBlock-Inner-Main-Content {
    .ThemeBlock.dark & {
      background: linear-gradient(to bottom, #0f0f0f, #0000);
    }

    position: relative;

    width: 100%;
    height: 100%;

    border-radius: 12px;
    background: linear-gradient(to bottom, #dfdfdf, #0000);
  }

  p {
    .ThemeBlock.dark & {
      color: #dfdfdf;
    }

    color: #8c8c8c;
    transform: scale(0.75) translate(-15%, 0);
  }

  position: relative;
  padding: 0.25rem;

  display: flex;
  flex-direction: column;

  gap: 0.5rem;

  width: 70%;
}

.TheBlock-Inner-Aside {
  .ThemeBlock-Inner-Aside-Item {
    .ThemeBlock.dark & {
      background-color: #2e2e2e;
    }

    position: relative;

    left: 5%;

    width: 90%;
    height: 12px;

    border-radius: 4px;
    background-color: #dfdfdf;
  }

  .ThemeBlock.dark & {
    border-right: 1px solid #2e2e2e;
  }

  display: flex;
  padding: 0.5rem 0;

  flex-direction: column;

  gap: 0.5rem;
  width: 30%;

  border-right: 1px solid #dcdfe6;
}

.ThemeBlock {
  &-Inner {
    .ThemeBlock.dark & {
      background-color: #1f1f1f;
    }

    position: relative;
    display: flex;

    width: 100%;
    height: 100%;

    border-radius: 12px;
    background-color: #f1f1f1;
  }

  &.active {
    border-color: var(--el-color-primary);
  }

  position: relative;
  padding: 4px;

  width: 220px;
  height: 140px;

  cursor: pointer;
  border-radius: 16px;
  border: 2px solid #0000;
}
</style>
