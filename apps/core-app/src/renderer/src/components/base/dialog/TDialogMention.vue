<script lang="ts" setup>
import Loading from "@comp/icon/LoadingIcon.vue";
import { onMounted, ref, watchEffect } from "vue";
import { sleep } from "@talex-touch/utils/common/utils";
import PluginIcon from "@comp/plugin/PluginIcon.vue";
import RemixIcon from "@comp/icon/RemixIcon.vue";

const props = defineProps({
  title: String,
  message: String,
  stay: Number,
  close: Function,
  btns: Array,
  icon: String,
  loading: Boolean,
});

const btnArray = ref([]);

const wholeDom = ref(null);

watchEffect(() => {
  const array = [];

  [...props.btns].forEach((btn) => {
    const obj = ref({
      loading: false,
      ...btn,
    });

    if (btn.loading) {
      obj.value.loading = true;

      btn.loading(() => {
        obj.value.loading = false;
      });
    }

    array.push(obj);
  });

  btnArray.value = array;
});

// couldn't move
function listener() {
  window.scrollTo({
    top: 0,
  });
}

onMounted(() => {
  window.addEventListener("scroll", listener);
});

const forClose = ref(async () => {
  const style = wholeDom.value?.style;

  // style.animation = 'enter .2s ease-adopters-out reverse'

  style.transform = "translate(-50%, -50%) scale(1.15)";

  await sleep(100);

  style.transform = "translate(-50%, -50%) scale(.35)";
  style.opacity = "0";

  await sleep(200);

  props.close();

  window.removeEventListener("scroll", listener);
});

const clickBtn = ref(async (btn) => {
  btn.value.loading = true;

  await sleep(200);

  if (await btn.value.onClick()) forClose.value();

  btn.value.loading = false;
});
</script>

<template>
  <div class="TDialogTip-Wrapper">
    <div ref="wholeDom" class="TDialogTip-Container" :class="{ 'loading-tip': loading }">
      <div class="TDialogTip-Main-Wrapper">
        <h1 v-text="title" />
        <span class="TDialogTip-Content" v-html="message.replace('\n', '<br /><br />')" />

        <div class="TDialogTip-Loading-Wrapper">
          <Loading v-if="loading" />
        </div>
        <div class="TDialogTip-Btn">
          <div
            v-for="(btn, index) in btnArray"
            :key="index"
            v-wave
            :class="{
              'info-tip': btn.value?.type === 'info',
              'warn-tip': btn.value?.type === 'warning',
              'error-tip': btn.value?.type === 'error',
              'success-tip': btn.value?.type === 'success',
              'loading-tip': btn.value.loading,
            }"
            class="TDialogTip-Btn-Item"
            @click="clickBtn(btn)"
          >
            <span class="TDialogTip-Btn-Item-Loading">
              <Loading />
            </span>
            <span class="TDialogTip-Container-Btn-Item-Text">{{
              btn.value.content
            }}</span>
          </div>
        </div>
      </div>

      <div class="TDialogTip-Icon">
        <PluginIcon v-if="icon instanceof Object" :icon="icon" />
        <RemixIcon v-else-if="icon && icon.at(0) === '#'" :name="icon.substring(1)" />
        <img v-else-if="icon" :src="icon" :alt="title" />
        <span v-else class="tip-icon" v-text="`Tip`" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TDialogTip-Icon {
  .tip-icon {
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    top: 50%;
    left: 50%;

    width: 72px;
    height: 72px;
    //line-height: 72px;

    opacity: 0.45;

    color: #fff;
    text-align: center;
    font-size: 35px;

    background-color: var(--el-color-primary);
    border-radius: 4px;
    transform: translate(-50%, -50%) rotate(45deg);
  }

  img {
    position: absolute;

    top: 50%;
    left: 50%;

    width: 72px;
    height: 72px;

    transform: translate(-50%, -50%);
  }

  :deep(.PluginIcon-Container) {
    position: absolute;

    top: 50%;
    left: 50%;

    width: 48px;
    height: 48px;
    line-height: 48px;

    opacity: 0.45;

    color: #fff;
    text-align: center;
    font-size: 35px;

    background-color: var(--el-color-primary);
    border-radius: 8px;
    transform: translate(-50%, -50%);
  }

  animation: out 1s forwards;
}

@keyframes out {
  0%,
  50% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

.TDialogTip-Content {
  position: relative;
  display: flex;

  align-items: center;
  justify-content: center;

  width: 80%;
  height: calc(100% - 30px);

  opacity: 0;
  animation: slideIn 0.25s 1s forwards linear;
}

.TDialogTip-Container {
  .TDialogTip-Btn-Item-Loading {
    position: relative;
    display: inline-block;
    margin: -8px;

    top: -10px;
    left: 50%;

    width: 16px;
    height: 16px;

    transform: scale(0) translateX(-50%);
    opacity: 0;
    --bg-color: var(--theme-color);
    transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  h1 {
    position: relative;

    width: max-content;
    height: 32px;
    line-height: 32px;

    color: var(--theme-color, var(--el-text-color-primary));
    font-size: 18px;
    font-weight: bold;
    opacity: 0;
    animation: slideIn 0.25s 1s forwards linear;
  }

  .TDialogTip-Btn {
    position: relative;
    display: flex;
    justify-content: space-around;
    padding: 8px 0;

    bottom: 5%;

    width: 80%;
    height: 28px;

    text-align: center;
    user-select: none;
    opacity: 0;
    animation: slideIn 0.25s 1.1s forwards linear;
  }

  position: absolute;

  left: 50%;
  top: 50%;

  min-width: 380px;
  min-height: 240px;
  line-height: 30px;

  color: var(--theme-color, var(--el-text-color-primary));
  box-shadow: var(--el-box-shadow-light);
  border-radius: 4px;

  transform: translate(-50%, -50%);
  transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  opacity: 0;
  clip-path: circle(50px at 50% 50%);
  animation: enter 1s ease-in-out forwards;
  overflow: hidden;

  -webkit-app-region: no-drag;
  backdrop-filter: blur(50px) saturate(180%) brightness(1.8);
}

@keyframes slideIn {
  0% {
    opacity: 0;
    transform: translateY(-10px);
  }

  //50% {
  //  opacity: .75;
  //  transform: translateY(4px);
  //}

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes expand {
  0% {
    opacity: 0;
  }

  50% {
    opacity: 0;
  }

  100% {
    opacity: 1;
    background: none;
  }
}

@keyframes enter {
  0% {
    opacity: 1;
    clip-path: circle(0px at 50% 50%);
  }

  30% {
    opacity: 1;
    clip-path: circle(50px at 50% 50%);
  }

  50% {
    opacity: 1;
    clip-path: circle(50px at 50% 50%);
  }

  100% {
    opacity: 1;
    clip-path: circle(100% at 50% 50%);
  }
}

.loading-tip {
  .TDialogTip-Btn-Item-Loading {
    opacity: 1;

    transform: scale(0.5) translateX(-50%);
  }

  .TDialogTip-Container-Btn-Item-Text {
    opacity: 0.25;

    transform: scale(0.65);
  }

  pointer-events: none;
}

.TDialogTip-Container-Btn-Item-Text {
  position: relative;
  padding: 8px 24px;

  left: 0;
  top: 0;

  width: 320px;
  height: 180px;

  text-align: center;
  border-radius: 4px;
  background-color: var(--el-color-primary-light-5);

  cursor: pointer;

  color: var(--theme-color, var(--el-text-color-regular));
  transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.success-tip {
  --theme-color: var(--el-color-success);
}

.info-tip {
  --theme-color: var(--el-color-primary);
}

.warn-tip {
  --theme-color: var(--el-color-warning);
}

.error-tip {
  --theme-color: var(--el-color-danger);
}

.TDialogTip-Main-Wrapper {
  position: absolute;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;

  top: 50%;
  left: 50%;

  border-radius: 2px;
  background-image: radial-gradient(transparent 1px, var(--el-bg-color) 1px);
  transform: translate(-50%, -50%);
  animation: expand 1s ease-in-out forwards;
  overflow: hidden;
}

.TDialogTip-Wrapper {
  z-index: 1000;
  position: absolute;

  width: 100%;
  height: 100%;

  top: 0;
  left: 0;

  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    background-color: var(--el-overlay-color);
    opacity: 0.45;
    animation: fadeIn 0.5s;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.45;
  }
}
</style>
