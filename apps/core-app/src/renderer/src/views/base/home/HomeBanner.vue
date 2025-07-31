<!--
  HomeBanner Component

  Displays the home page banner with wallpaper and daily quote.
  Fetches and displays a daily quote from Shanbay API.
-->
<script setup lang="ts" name="HomerBanner">
// Import the wallpaper image
import Wallpaper from '~/assets/bg/wallpaper.png'

// Reactive reference for the daily quote
const oneWord = ref('')

/**
 * Fetch and display a daily quote from Shanbay API
 * Caches the quote in localStorage for 1 hour to avoid excessive API calls
 * @returns Promise<void>
 */
async function getOneWord(): Promise<void> {
  // Get the last fetch time from localStorage
  const lastTime = +(localStorage.getItem('oneword_last') || -1)
  const diff = Date.now() - lastTime

  // If less than 1 hour has passed, use cached quote
  if (diff < 1000 * 3600) {
    oneWord.value = localStorage.getItem('oneword_content') || ''
    return
  }

  // Update the last fetch time
  localStorage.setItem('oneword_last', Date.now().toString())

  // API endpoint for daily quote
  const url = 'https://apiv3.shanbay.com/weapps/dailyquote/quote/'

  // Fetch the daily quote
  try {
    const response = await fetch(url)
    const res = await response.json()

    // Log the response for debugging
    console.log(res)

    // Update the quote and cache it
    oneWord.value = res.content
    localStorage.setItem('oneword_content', res.content)
  } catch (error) {
    console.error('Failed to fetch daily quote:', error)
  }
}

// Fetch the daily quote when component is mounted
getOneWord()
</script>

<!--
  HomeBanner Component Template

  Displays the wallpaper image and daily quote content.
-->
<template>
  <!-- Main container for home banner -->
  <div class="HomeBanner">
    <!--
      Wallpaper image
      Currently using local wallpaper instead of external API
    -->
    <img :src="Wallpaper" alt="Wallpaper" />

    <!-- Content area with title and daily quote -->
    <div class="HomeBanner__Content">
      <h1 text-3xl font-bold>Home Page</h1>
      <span text-xl>{{ oneWord }}</span>
    </div>
  </div>
</template>

<!--
  HomeBanner Component Styles

  SCSS styles for the home banner including layout and responsive design.
-->
<style lang="scss" scoped>
/** Main banner and image styles */
.HomeBanner,
img {
  position: absolute;
  height: 60%;
  width: 100%;
  user-select: none;
  pointer-events: none;

  /** Content area styles */
  &__Content {
    z-index: 100;
    position: absolute;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: end;
    bottom: 5%;
    width: 100%;
    height: 15%;
    box-sizing: border-box;

    /** Title styles */
    h1 {
      margin: 0;
      flex-shrink: 0;
    }

    /** Quote styles */
    span {
      margin-left: 1rem;
      opacity: 0.5;
    }
  }

  /** Image styles */
  img {
    height: 100%;
    object-fit: fill;
  }
}

/** Gradient overlay styles */
.HomeBanner::before {
  z-index: 100;
  content: '';
  position: absolute;

  bottom: 0;
  width: 100%;

  height: 50%;
  left: 0;

  /** Light theme gradient */
  background: linear-gradient(
    to top,
    rgba(255, 255, 255, 0.75),
    rgba(255, 255, 255, 0.5) 50%,
    rgba(255, 255, 255, 0)
  );

  /** Dark theme gradient */
  .dark & {
    background: linear-gradient(
      to top,
      rgba(0, 0, 0, 0.75),
      rgba(0, 0, 0, 0.5) 50%,
      rgba(0, 0, 0, 0)
    );
  }
}
</style>
