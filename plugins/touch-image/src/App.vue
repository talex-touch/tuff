<script setup lang="ts">
import { onMounted, ref } from "vue";
import { regService } from "@talex-touch/utils/plugin/sdk/service";
import { ImageProtocolService } from "@talex-touch/utils/service/protocol";
import ImageView from "./components/ImageView.vue";

const historyImgs = ref<string[]>(
  JSON.parse(localStorage.getItem("historyImgs") || "[]")
);
const index = ref(historyImgs.value.length ? historyImgs.value.length : -1);

function addImage(path: string) {
  if (historyImgs.value.includes(path)) {
    const i = historyImgs.value.indexOf(path);

    return (index.value = i);
  }

  historyImgs.value.push(path);

  index.value = historyImgs.value.length - 1;
  localStorage.setItem("historyImgs", JSON.stringify(historyImgs.value));
}

onMounted(() => {
  document.addEventListener("drop", (e) => {
    e.preventDefault();

    const files = e.dataTransfer!.files;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.type.startsWith("image")) {
        // @ts-ignore
        addImage(file.path);
      }
    }
  });

  document.addEventListener("dragover", (e: Event) => {
    e.preventDefault();
  });

  regService(new ImageProtocolService(), (e: any) => {
    addImage(e.path);
  });
});
</script>

<template>
  <div class="App-Container">
    <div class="App-Content">
      <ImageView v-if="index >= 0" :src="`atom:///${historyImgs[index]}`" />
    </div>
    <div class="App-Footer" :class="{ active: historyImgs.length }">
      <div class="App-Footer-Content">
        <div
          class="App-Footer-Content-Item"
          @mouseenter="index = i"
          v-for="(img, i) in historyImgs"
          :key="img"
        >
          <img :src="`atom:///${img}`" />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.App-Footer-Content {
  &-Item {
    img {
      position: relative;

      width: 100%;
      height: 100%;

      object-fit: cover;
    }
    &:active {
      filter: brightness(0.8)
    }
    width: 48px;
    height: 48px;

    cursor: pointer;
  }
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;

  gap: 0.5rem;
}

.App-Footer {
  &.active {
    opacity: 1;
    transform: translateY(0);
    background-color: #ffffff50;
    backdrop-filter: blur(16px) saturate(180%) contrast(80%) brightness(130%);
  }
  position: absolute;

  width: 100%;
  height: 4rem;

  bottom: 0;

  opacity: 0;
  box-sizing: border-box;
  transform: translateY(10%);
  transition: cubic-bezier(0.215, 0.61, 0.355, 1) 0.25s;
}
</style>
