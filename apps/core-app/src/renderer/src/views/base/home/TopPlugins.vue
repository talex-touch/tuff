<!--
  TopPlugins Component

  Displays a grid of top plugins with interactive hover effects.
  Shows plugin information including name, description, downloads, and rating.
-->
<script setup lang="ts" name="TopPlugins">
// Define the structure for plugin data
interface Plugin {
  name: string
  url: string
  description: string
  icon: string
  downloads: string
  rating: number
}

// Reactive array of top plugins data
const topPlugins = reactive<Plugin[]>([
  {
    name: 'Smart Clipboard',
    url: '#',
    description: 'Advanced clipboard manager with history and sync',
    icon: 'ri-clipboard-line',
    downloads: '2.3M',
    rating: 4.8
  },
  {
    name: 'Universal Translator',
    url: '#',
    description: 'Real-time translation for 100+ languages',
    icon: 'ri-translate-2',
    downloads: '1.8M',
    rating: 4.7
  },
  {
    name: 'Quick Search',
    url: '#',
    description: 'Lightning-fast search across all your files and web',
    icon: 'ri-search-line',
    downloads: '3.1M',
    rating: 4.9
  },
  {
    name: 'AI Assistant',
    url: '#',
    description: 'Your intelligent coding companion powered by AI',
    icon: 'ri-robot-line',
    downloads: '1.5M',
    rating: 4.6
  },
  {
    name: 'Password Manager',
    url: '#',
    description: 'Secure password generation and management',
    icon: 'ri-shield-keyhole-line',
    downloads: '2.7M',
    rating: 4.8
  },
  {
    name: 'Color Picker Pro',
    url: '#',
    description: 'Advanced color picker with palette management',
    icon: 'ri-palette-line',
    downloads: '890K',
    rating: 4.5
  },
  {
    name: 'Screenshot Tool',
    url: '#',
    description: 'Capture, annotate and share screenshots instantly',
    icon: 'ri-screenshot-line',
    downloads: '2.1M',
    rating: 4.7
  },
  {
    name: 'File Organizer',
    url: '#',
    description: 'Smart file organization and duplicate finder',
    icon: 'ri-folder-line',
    downloads: '1.2M',
    rating: 4.4
  }
])

/**
 * Handle mouse move event to create interactive hover effect
 * Updates CSS variables for each plugin element based on mouse position
 * @param event - Mouse move event
 * @returns void
 */
function handleMove(event: MouseEvent): void {
  // Get mouse position
  const mouseX = event.pageX
  const mouseY = event.pageY

  const elements = document.querySelectorAll('.BoxContent .element')
  // Iterate through elements and calculate distance from mouse
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i] as HTMLElement
    const rect = element.getBoundingClientRect()
    const elementX = rect.left + window.pageXOffset
    const elementY = rect.top + window.pageYOffset

    const distanceX = mouseX - elementX
    const distanceY = mouseY - elementY

    element.style.setProperty('--op', '1')
    element.style.setProperty('--x', distanceX + 'px')
    element.style.setProperty('--y', distanceY + 'px')
  }
}

/**
 * Reset hover effect when mouse leaves the container
 * Sets opacity to 0 for all plugin elements
 * @returns void
 */
function cancelColor(): void {
  document.querySelectorAll('.BoxContent .element').forEach((element) => {
    const htmlElement = element as HTMLElement
    htmlElement.style.setProperty('--op', '0')
  })
}
</script>

<!--
  TopPlugins Component Template

  Displays a responsive grid of top plugins with interactive hover effects.
-->
<template>
  <!-- Main wrapper for top plugins section -->
  <div class="BoxContentWrapper">
    <!-- Header section with title and subtitle -->
    <div class="BoxContent-Header">
      <p text-xl font-bold>TOP PLUGINS</p>
      <span text-lg>Popular worldwide choices</span>
    </div>

    <!-- Plugins grid container with mouse event handlers -->
    <div class="BoxContent" @mouseleave="cancelColor" @mousemove="handleMove">
      <!-- Individual plugin item -->
      <div v-for="item in topPlugins" :key="item.name" class="BoxContent-Item col">
        <!-- Plugin element with interactive hover effect -->
        <div class="element">
          <!-- Plugin content area -->
          <div class="BoxContent-ItemContent">
            <!-- Plugin icon -->
            <div class="plugin-icon">
              <i :class="`i-${item.icon}`"></i>
            </div>
            <!-- Plugin information -->
            <div class="plugin-info">
              <!-- Plugin name -->
              <h3>{{ item.name }}</h3>
              <!-- Plugin description -->
              <p class="plugin-description">{{ item.description }}</p>
              <!-- Plugin statistics -->
              <div class="plugin-stats">
                <!-- Download count -->
                <span class="downloads">
                  <i class="ri-download-line"></i>
                  {{ item.downloads }}
                </span>
                <!-- Rating -->
                <span class="rating">
                  <i class="ri-star-fill"></i>
                  {{ item.rating }}
                </span>
              </div>
            </div>
          </div>
          <!-- Mask element for visual effect -->
          <div class="mask" />
        </div>
      </div>
    </div>
  </div>
</template>

<!--
  TopPlugins Component Styles

  SCSS styles for the top plugins section including responsive grid layout and interactive effects.
-->
<style lang="scss">
/** Header styles for top plugins section */
.BoxContent-Header {
  display: flex;
  align-items: baseline;
  margin-bottom: 1.5rem;

  /** Title styles */
  p {
    opacity: 0.85;
    font-weight: 700;
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: 0.5px;
  }

  /** Subtitle styles */
  span {
    margin-left: 1rem;
    opacity: 0.6;
    font-size: 14px;
    font-weight: 400;
  }
}

/** Main wrapper styles */
.BoxContentWrapper {
  position: relative;
  padding: 2rem;
  width: 100%;
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
}

/** Plugins grid container styles */
.BoxContent {
  margin: 1rem 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  align-items: stretch;

  /** Mobile responsive styles */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  /** Large screen styles */
  @media (min-width: 1400px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

/** Column styles for grid items */
.col {
  height: 140px;
  padding: 0;
  margin: 0;
}

/** Plugin element styles with interactive effects */
.element {
  background: var(--el-fill-color-light);
  height: 100%;
  position: relative;
  border-radius: 16px;
  transition: all 0.3s ease;
  cursor: pointer;

  /** Hover state styles */
  &:hover {
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }
}

/** Plugin item styles */
.BoxContent-Item {
  height: 140px;
  width: 100%;
}

/** Interactive hover effect styles */
.element::before {
  content: '';
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

/** Plugin content area styles */
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

  /** Plugin icon styles */
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

    /** Icon styles */
    i {
      font-size: 26px;
      color: var(--el-color-primary);
      transition: all 0.3s ease;
    }
  }

  /** Hover effect for plugin icon */
  .element:hover .plugin-icon {
    background: var(--el-color-primary-light-8);
    transform: scale(1.05);

    i {
      color: var(--el-color-primary-dark-2);
    }
  }

  /** Plugin information styles */
  .plugin-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;

    /** Plugin name styles */
    h3 {
      margin: 0 0 0.5rem 0;
      font-size: 17px;
      font-weight: 600;
      opacity: 0.9;
      line-height: 1.2;
      color: var(--el-text-color-primary);
    }

    /** Plugin description styles */
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

    /** Plugin statistics styles */
    .plugin-stats {
      display: flex;
      gap: 1.5rem;
      font-size: 12px;
      opacity: 0.75;
      margin-top: 0.5rem;

      /** Statistics item styles */
      span {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-weight: 500;

        /** Icon styles */
        i {
          font-size: 12px;
        }
      }

      /** Download count styles */
      .downloads {
        color: var(--el-color-info);
      }

      /** Rating styles */
      .rating {
        color: var(--el-color-warning);

        i {
          color: #f7ba2a;
        }
      }
    }
  }
}

/** Mask element styles */
.element .mask {
  position: absolute;
  inset: 0;
  background: var(--el-fill-color);
  border-radius: 16px;
}
</style>
