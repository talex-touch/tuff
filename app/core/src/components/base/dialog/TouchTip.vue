<script lang="ts" name="TouchTip" setup>
import Loading from "@comp/icon/LoadingIcon.vue";
import { onMounted, ref, watchEffect } from "vue";
import { sleep } from "@talex-touch/utils/common/utils";

const props = defineProps({
  title: String,
  message: String,
  buttons: Array,
  close: Function,
});

const btnArray = ref([]);

const wholeDom = ref(null);

watchEffect(() => {
  const array = [];

  [...props.buttons].forEach((btn) => {
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

const clickBtn = ref(async (btn) => {
  btn.value.loading = true;

  await sleep(200);

  if (await btn.value.onClick()) forClose.value();

  btn.value.loading = false;
});

// couldn't move
function listener() {
  window.scrollTo({
    top: 0,
  });
}

const forClose = ref(async () => {
  const el = wholeDom.value;
  if (!el) return;

  const style = el.style;

  await sleep(100);

  style.transform = "translate(-50%, -50%) scale(1.125)";
  style.opacity = "0";

  el.parentNode.style.opacity = "0";

  await sleep(400);

  props.close();

  window.removeEventListener("scroll", listener);
});

onMounted(() => {
  window.addEventListener("scroll", listener);
});
</script>

<template>
  <div class="TouchTip-Wrapper transition-cubic">
    <div
      ref="wholeDom"
      class="TouchTip-Container fake-background"
      :class="{ 'loading-tip': loading }"
    >
      <h1 v-text="title" />

      <span class="TDialogTip-Content" v-html="message.replace('\n', '<br /><br />')" />

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
          <span class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TDialogTip-Content {
  position: relative;

  align-self: center;
  justify-self: center;
  text-align: center;

  width: 80%;
  height: calc(100% - 30px);
}

.loading-tip {
  .TDialogTip-Btn-Item-Loading {
    opacity: 0.75 !important;

    transform: scale(0.5) translateX(-50%) !important;
  }

  .TDialogTip-Container-Btn-Item-Text {
    opacity: 0.25;

    transform: scale(0.65);
  }

  pointer-events: none;
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

.TDialogTip-Container-Btn-Item-Text {
  position: relative;

  left: 0;
  top: 0;

  width: 320px;
  height: 180px;

  text-align: center;
  border-radius: 4px;

  cursor: pointer;

  color: var(--theme-color, var(--el-text-color-regular));
  transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.TouchTip-Container {
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

  .TDialogTip-Btn {
    position: absolute;
    display: flex;

    justify-content: space-around;
    align-items: center;

    bottom: 1rem;

    width: 80%;
    height: 28px;

    text-align: center;
    user-select: none;
  }

  h1 {
    position: absolute;

    top: 1rem;

    width: max-content;
    height: 32px;
    line-height: 32px;

    color: var(--theme-color, var(--el-text-color-primary));
    font-size: 18px;
    font-weight: bold;
  }

  position: absolute;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  min-width: 420px;
  min-height: 260px;

  color: var(--theme-color, var(--el-text-color-primary));
  box-shadow: var(--el-box-shadow-lighter);
  border-radius: 8px;

  --fake-opacity: 0.75;
  --fake-inner-opacity: 0.75;

  -webkit-app-region: no-drag;
  transform: translate(-50%, -50%);
  transition: 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
  animation: enter 0.35s ease-in-out;
  backdrop-filter: blur(16px) saturate(150%) brightness(1.5);
}

@keyframes enter {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.25);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.TouchTip-Wrapper {
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
    opacity: 0.35;
    animation: fadeIn 0.5s;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.35;
  }
}
</style>
