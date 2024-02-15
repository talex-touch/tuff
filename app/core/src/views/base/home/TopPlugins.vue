<script setup lang="ts" name="TopPlugins">
const props = defineProps<{
  modelValue?: boolean;
}>();

const topPlugins = reactive([
  {
    name: "Vue",
    url: "https://vuejs.org/",
    description: "Vue is a progressive framework for building user interfaces.",
    icon: "https://vuejs.org/images/logo.png",
  },
  {
    name: "Vite",
    url: "https://vitejs.dev/",
    description: "Blazing fast development & production build tool for Vue.js",
    icon: "https://vitejs.dev/logo.svg",
  },
  {
    name: "VitePress",
    url: "https://vitepress.vuejs.org/",
    description: "VitePress is a simple static site generator for Vue",
    icon: "https://vitepress.dev/vitepress-logo-mini.svg",
  },
  {
    name: "Vue",
    url: "https://vuejs.org/",
    description: "Vue is a progressive framework for building user interfaces.",
    icon: "https://vuejs.org/images/logo.png",
  },
  {
    name: "Vite",
    url: "https://vitejs.dev/",
    description: "Blazing fast development & production build tool for Vue.js",
    icon: "https://vitejs.dev/logo.svg",
  },
  {
    name: "VitePress",
    url: "https://vitepress.vuejs.org/",
    description: "VitePress is a simple static site generator for Vue",
    icon: "https://vitepress.dev/vitepress-logo-mini.svg",
  },
]);

function handleMove(event: MouseEvent) {
  // 获取鼠标位置
  var mouseX = event.pageX;
  var mouseY = event.pageY;

  var elements = document.querySelectorAll(".BoxContent .element");
  // 遍历元素并输出距离鼠标的坐标
  for (var i = 0; i < elements.length; i++) {
    var element: any = elements[i];
    var rect = element.getBoundingClientRect();
    var elementX = rect.left + window.pageXOffset;
    var elementY = rect.top + window.pageYOffset;

    var distanceX = mouseX - elementX;
    var distanceY = mouseY - elementY;

    element.style.setProperty("--x", distanceX + "px");
    element.style.setProperty("--y", distanceY + "px");
  }
}

function cancelColor() {
  document.querySelectorAll(".BoxContent .element").forEach((element) => {
    element.style.setProperty("--x", "-1000px");
    element.style.setProperty("--y", "-1000px");
  });
}
</script>

<template>
  <div class="BoxContentWrapper">
    <div class="BoxContent-Header">
      <p>TOP PLUGINS</p>
      <span>Popular worldwide choices</span>
    </div>

    <div @mouseleave="cancelColor" @mousemove="handleMove" class="BoxContent">
      <div class="BoxContent-Item col" v-for="item in topPlugins">
        <div class="element">
          <div class="BoxContent-ItemContent">
            <img :src="item.icon" :alt="item.name" />
            <p>{{ item.name }}</p>
          </div>
          <div class="mask" />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.BoxContent-Header {
  display: flex;

  align-items: center;

  p {
    opacity: 0.75;
    font-weight: 600;
  }

  span {
    margin-left: 0.5rem;

    opacity: 0.5;
    font-size: 12px;
  }
}

.BoxContentWrapper {
  position: relative;
  padding: 1rem 2rem;

  width: 100%;

  box-sizing: border-box;
}

.BoxContent {
  margin: 0;
  padding: 0;
  display: flex;

  align-items: center;
  justify-content: center;

  flex-wrap: wrap;
}

.col {
  width: calc((100% - 5px) / 4);
  height: 80px;
  padding: 1rem;
  margin: 0 1.5rem;
}

.element {
  background: var(--el-fill-color-light);
  height: 100%;
  position: relative;
  border-radius: 12px;
}

.element::before {
  content: "";
  position: absolute;
  width: calc(100% + 3px);
  height: calc(100% + 3px);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 12px;
  background: radial-gradient(
    250px circle at var(--x) var(--y),
    #00dc8250 0,
    transparent 100%
  );
}

.BoxContent-ItemContent {
  img {
    width: 48px;
    height: 48px;
  }

  p {
    margin-left: 2rem;
    font-size: 22px;
    opacity: 0.75;
    font-weight: 600;
  }

  z-index: 1;
  position: absolute;
  display: flex;
  padding: 0.25rem 2rem;

  align-items: center;

  width: 100%;
  height: calc(80px - 0.5rem);

  left: 0;
  top: 0.25rem;

  box-sizing: border-box;
  overflow: hidden;
}

.element .mask {
  position: absolute;
  inset: 0;
  background: var(--el-fill-color);
  border-radius: 10px;
}
</style>
