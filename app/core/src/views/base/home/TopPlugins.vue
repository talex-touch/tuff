<script setup lang="ts" name="TopPlugins">
const props = defineProps<{
  modelValue?: boolean;
}>();

const topPlugins = reactive([
  {
    name: "Smart Clipboard",
    url: "#",
    description: "Advanced clipboard manager with history and sync",
    icon: "ri-clipboard-line",
    downloads: "2.3M",
    rating: 4.8,
  },
  {
    name: "Universal Translator",
    url: "#",
    description: "Real-time translation for 100+ languages",
    icon: "ri-translate-2",
    downloads: "1.8M",
    rating: 4.7,
  },
  {
    name: "Quick Search",
    url: "#",
    description: "Lightning-fast search across all your files and web",
    icon: "ri-search-line",
    downloads: "3.1M",
    rating: 4.9,
  },
  {
    name: "AI Assistant",
    url: "#",
    description: "Your intelligent coding companion powered by AI",
    icon: "ri-robot-line",
    downloads: "1.5M",
    rating: 4.6,
  },
  {
    name: "Password Manager",
    url: "#",
    description: "Secure password generation and management",
    icon: "ri-shield-keyhole-line",
    downloads: "2.7M",
    rating: 4.8,
  },
  {
    name: "Color Picker Pro",
    url: "#",
    description: "Advanced color picker with palette management",
    icon: "ri-palette-line",
    downloads: "890K",
    rating: 4.5,
  },
  {
    name: "Screenshot Tool",
    url: "#",
    description: "Capture, annotate and share screenshots instantly",
    icon: "ri-screenshot-line",
    downloads: "2.1M",
    rating: 4.7,
  },
  {
    name: "File Organizer",
    url: "#",
    description: "Smart file organization and duplicate finder",
    icon: "ri-folder-line",
    downloads: "1.2M",
    rating: 4.4,
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

    element.style.setProperty("--op", '1');
    element.style.setProperty("--x", distanceX + "px");
    element.style.setProperty("--y", distanceY + "px");
  }
}

function cancelColor() {
  document.querySelectorAll(".BoxContent .element").forEach((element) => {
    const htmlElement = element as HTMLElement;
    htmlElement.style.setProperty("--op", '0');
    // htmlElement.style.setProperty("--x", "-1000px");
    // htmlElement.style.setProperty("--y", "-1000px");
  });
}
</script>

<template>
  <div class="BoxContentWrapper">
    <div class="BoxContent-Header">
      <p text-xl font-bold>TOP PLUGINS</p>
      <span text-lg>Popular worldwide choices</span>
    </div>

    <div @mouseleave="cancelColor" @mousemove="handleMove" class="BoxContent">
      <div class="BoxContent-Item col" v-for="item in topPlugins" :key="item.name">
        <div class="element">
          <div class="BoxContent-ItemContent">
            <div class="plugin-icon">
              <i :class="`i-${item.icon}`"></i>
            </div>
            <div class="plugin-info">
              <h3>{{ item.name }}</h3>
              <p class="plugin-description">{{ item.description }}</p>
              <div class="plugin-stats">
                <span class="downloads">
                  <i class="ri-download-line"></i>
                  {{ item.downloads }}
                </span>
                <span class="rating">
                  <i class="ri-star-fill"></i>
                  {{ item.rating }}
                </span>
              </div>
            </div>
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
  align-items: baseline;
  margin-bottom: 1.5rem;

  p {
    opacity: 0.85;
    font-weight: 700;
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: 0.5px;
  }

  span {
    margin-left: 1rem;
    opacity: 0.6;
    font-size: 14px;
    font-weight: 400;
  }
}

.BoxContentWrapper {
  position: relative;
  padding: 2rem;
  width: 100%;
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
}

.BoxContent {
  margin: 1rem 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  align-items: stretch;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 1400px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.col {
  height: 140px;
  padding: 0;
  margin: 0;
}

.element {
  background: var(--el-fill-color-light);
  height: 100%;
  position: relative;
  border-radius: 16px;
  transition: all 0.3s ease;
  cursor: pointer;

  &:hover {
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }
}

.BoxContent-Item {
  height: 140px;
  width: 100%;
}

.element::before {
  content: "";
  position: absolute;
  width: calc(100% + 3px);
  height: calc(100% + 3px);
  top: 50%;
  left: 50%;
  opacity: var(--op);
  transition: opacity 0.25s ease-in-out;
  transform: translate(-50%, -50%);
  border-radius: 18px;
  filter: blur(5px);
  background: radial-gradient(
    250px circle at var(--x) var(--y),
    var(--el-color-primary) 0,
    transparent 100%
  );
}

.BoxContent-ItemContent {
  z-index: 1;
  position: absolute;
  display: flex;
  padding: 1.25rem 1.5rem;
  gap: 1.25rem;

  align-items: flex-start;

  width: 100%;
  height: 100%;

  left: 0;
  top: 0;

  box-sizing: border-box;
  overflow: hidden;

  .plugin-icon {
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-color-primary-light-9);
    border-radius: 14px;
    transition: all 0.3s ease;

    i {
      font-size: 26px;
      color: var(--el-color-primary);
      transition: all 0.3s ease;
    }
  }

  .element:hover .plugin-icon {
    background: var(--el-color-primary-light-8);
    transform: scale(1.05);

    i {
      color: var(--el-color-primary-dark-2);
    }
  }

  .plugin-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;

    h3 {
      margin: 0 0 0.5rem 0;
      font-size: 17px;
      font-weight: 600;
      opacity: 0.9;
      line-height: 1.2;
      color: var(--el-text-color-primary);
    }

    .plugin-description {
      margin: 0 0 auto 0;
      font-size: 13px;
      opacity: 0.65;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      color: var(--el-text-color-regular);
      flex-grow: 1;
      min-height: 3.6em; /* 确保有足够空间显示3行 */
    }

    .plugin-stats {
      display: flex;
      gap: 1.5rem;
      font-size: 12px;
      opacity: 0.75;
      margin-top: 0.5rem;

      span {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-weight: 500;

        i {
          font-size: 12px;
        }
      }

      .downloads {
        color: var(--el-color-info);
      }

      .rating {
        color: var(--el-color-warning);

        i {
          color: #f7ba2a;
        }
      }
    }
  }
}

.element .mask {
  position: absolute;
  inset: 0;
  background: var(--el-fill-color);
  border-radius: 16px;
}
</style>
