<template>
  <div
    :class="{ success: options.success }"
    class="TouchCaptcha-Container fake-background"
  >
    <ProgressBar
      :message="options.message"
      :success="options.success"
      :error="options.error"
      :loading="options.loading"
    />

    <h2 class="TouchCaptcha-Title">
      {{ $t("base.touchCaptcha") }}
    </h2>
    <span>旋转滑块以匹配图像</span>
    <div
      ref="content"
      :class="{
        loading: options.loading,
        error: options.error,
        success: options.success,
      }"
      class="TouchCaptcha-Content"
    >
      <div class="TouchCaptcha-Image">
        <img alt="" :src="options.img.image" />
      </div>
    </div>

    <div
      :class="{ loading: options.loading || options.error || options.success }"
      class="TouchCaptcha-Slider"
    >
      <el-slider
        @change="validateCaptcha"
        :min="90"
        :max="270"
        :show-tooltip="false"
        v-model="options.img.style.transform.rotate"
      >
      </el-slider>
    </div>
  </div>
</template>

<script lang="ts" name="TouchCaptcha" setup>
import { get, post } from "~/base/axios";
// import { $t } from "@modules/lang";
import ProgressBar from "@comp/base/ProgressBar.vue";
import { nextTick, reactive, ref, watch } from "vue";
import { sleep } from "@talex-touch/utils/common/utils";

const props = defineProps(["func"]);

const options = reactive({
  loading: false,
  img: {
    image: "",
    style: {
      transform: {
        rotate: 90,
        scale: 0,
        x: "0",
        y: "0",
      },
    },
  },
  captcha: {},
  error: false,
  success: false,
  message: "",
});
const content = ref();

watch(options, () => {
  const el = content.value;
  if (!el) return;

  const img = el.children[0].children[0];

  Object.assign(img.style, options.img.style);

  const { x, y } = options.img.style.transform;

  img.style.transform = `scale(${options.img.style.transform.scale}) translate(${x}, ${y}) rotate(${options.img.style.transform.rotate}deg)`;
});

async function validateCaptcha() {
  options.loading = true;

  const id = options.captcha.id;
  const angle = options.img.style.transform.rotate;

  const res = await post(
    "/file/captcha/valid",
    {
      captcha: 360 - angle,
    },
    {
      headers: {
        captcha: id,
      },
    }
  );

  await sleep(800);

  options.loading = false;

  if (res.code !== 200) {
    options.error = true;
    options.message = res.error;

    await sleep(1800);

    while (options.img.style.transform.rotate > 90) {
      options.img.style.transform.rotate -= 1;
      // await sleep(1)
    }

    options.img.style.transform.rotate = 90;
    options.message = "";
    // await forDialogMention('验证失败', res.error, 'error-warning')

    await gen();
  } else {
    options.success = true;

    await sleep(2800);

    props.func(res.data);
  }
}

async function gen() {
  const el = content.value;
  if (!el) return;
  options.error = false;
  options.loading = true;

  await sleep(200);

  options.img.style.transform.scale = 0.8;

  await sleep(300);
  options.img.style.opacity = "0";
  options.img.style.transform.x = "-150%";

  const res = await get("/file/captcha/gen");

  if (res.code !== 200) {
    options.loading = false;
    options.error = true;
    options.message = res.error;

    setTimeout(gen, 5000);
    return;
  }

  options.captcha = res.data;

  const img = buffer2Img(res.data.image.data);

  await sleep(200);

  options.img.style.transform.x = "150%";
  options.img.image = img;

  await sleep(300);
  options.img.style.opacity = "1";
  options.img.style.transform.x = "0";

  await sleep(200);

  options.img.style.transform.scale = 1;
  options.loading = false;

  return res;
}

function buffer2Img(buffer) {
  // to base64
  const base64 = btoa(
    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
  );

  return `data:image/png;base64,${base64}`;
}

!(() => {
  nextTick(gen);
})();
</script>

<style lang="scss" scoped>
.TouchCaptcha-Slider {
  &.loading {
    pointer-events: none;
    opacity: 0.75;
  }

  :deep(.el-slider) {
    --el-slider-height: 20px;
    --el-slider-border-radius: 5px;

    --el-slider-main-bg-color: var(--el-color-primary);
    --el-slider-runway-bg-color: var(--el-border-color-light);
    --el-slider-stop-bg-color: var(--el-color-white);
    --el-slider-disabled-color: var(--el-text-color-placeholder);

    --el-slider-button-wrapper-offset: -8px;
  }

  position: relative;

  left: 0;
  bottom: 0;

  width: 70%;
  height: 100px;

  display: flex;
  justify-content: center;
  align-items: center;
}

@keyframes breathing {
  0% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }

  100% {
    transform: scale(1);
  }
}

.TouchCaptcha-Content {
  &.success {
    box-shadow: 0 0 8px 4px var(--el-color-success);
  }

  &.error {
    box-shadow: 0 0 8px 4px var(--el-color-danger);
  }

  &.loading {
    pointer-events: none;

    box-shadow: 0 0 4px 2px var(--el-color-primary);

    animation: breathing 0.75s infinite;
  }

  img {
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 50%;

    transition: all 0.25s;
  }

  position: relative;
  margin-top: 50px;

  //width: 160px;
  height: 180px;

  aspect-ratio: 1 / 1;

  display: flex;
  justify-content: center;
  align-items: center;

  border-radius: 50%;
  overflow: hidden;
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.2));
  border: 2px solid var(--el-border-color);
}

.TouchCaptcha-Container {
  &.success {
    transition: 1.25s;

    opacity: 0;
    transform: translate(-50%, 50%) perspective(100px) rotate3d(0.2, 0, 0, 10deg);
  }

  :deep(.ProgressBar-Wrapper) {
    position: absolute;

    left: 0;
    top: 0;
  }

  z-index: 1000;
  position: absolute;
  display: flex;
  padding: 20px 10px;

  flex-direction: column;
  //justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  width: 320px;
  height: 450px;

  opacity: 1;
  transform: translate(-50%, -50%) perspective(100px) rotate3d(0, 0, 0, 10deg);

  transition: 0.25s;
  border-radius: 8px;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
  backdrop-filter: blur(18px) saturate(1.8) brightness(1.8);
  animation: pageLoad 0.5s ease-in;
  //background-color: var(--el-fill-color);
}

@keyframes pageLoad {
  from {
    opacity: 0;
    transform: translate(-50%, 50%) perspective(100px) rotate3d(0.2, 0, 0, 10deg);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) perspective(100px) rotate3d(0, 0, 0, 10deg);
  }
}
</style>
