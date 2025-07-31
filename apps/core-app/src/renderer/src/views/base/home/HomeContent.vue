<!--
  HomeContent Component

  Displays the main content of the home page including logo and top plugins.
-->
<script setup lang="ts" name="HomeContent">
// Import the TopPlugins component
import TopPlugins from './TopPlugins.vue'
</script>

<!--
  HomeContent Component Template

  Displays the logo with animated background and top plugins section.
-->
<template>
  <!-- Main container for home content -->
  <div class="HomContent">
    <!-- Logo container with animated background -->
    <div class="Home-Logo">
      <!-- Animated background SVG -->
      <div class="Home-Logo-Bg">
        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          xmlns:xlink="http://www.w3.org/1999/xlink"
          width="300px"
          height="300px"
        >
          <!-- Animated circle element -->
          <circle class="g-polygon-move" cx="150" cy="150" r="150" fill="none" />
        </svg>
      </div>

      <!-- Logo image -->
      <img src="@assets/logo.svg" alt="logo" />
    </div>

    <!-- Top plugins section -->
    <TopPlugins />
  </div>
</template>

<!--
  HomeContent Component Styles

  SCSS styles for the home content including logo animation and layout.
-->
<style lang="scss">
/** Main content container styles */
.HomContent {
  z-index: 10000;
  position: relative;

  backdrop-filter: blur(10px);
}

/** Logo container styles */
.Home-Logo {
  position: relative;

  top: 50%;
  left: 50%;

  width: 150px;
  height: 150px;

  transform: translate(-50%, -50%);
  transition: all 0.25s ease-in-out;
  filter: drop-shadow(0 0 4px var(--el-color-primary));

  /** Logo image styles */
  img {
    position: absolute;

    top: 0;
  }

  /** Logo background styles */
  .Home-Logo-Bg {
    transform: scale(0.5) translate(-50%, -50%);

    /** SVG styles */
    svg {
      overflow: visible;
    }

    /** Polygon styles */
    .g-polygon-wrap,
    .g-polygon-move {
      fill: none;
      stroke: var(--el-color-primary);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }

    /** Animated polygon styles */
    .g-polygon-move {
      transform-origin: center center;
      transform: scale(1.05);
      //stroke: linear-gradinet(180deg, red, transprent);
      stroke-width: 1.5;
      stroke-dasharray: 280, 700;
      stroke-dashoffset: 8;
      animation: move 2.4s infinite linear;
    }

    /** Animation keyframes for moving stroke */
    @keyframes move {
      0% {
        stroke-dashoffset: 8;
      }

      100% {
        stroke-dashoffset: -972;
      }
    }
  }
}
</style>
