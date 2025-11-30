<script lang="ts" setup>
</script>

<template>
  <div class="PluginCardGithub inset-0 h-full w-full flex items-center justify-center bg-[#10181650]">
    <div class="PluginCardGithub-Main absolute bottom-0 z-5 h-[40%] w-full flex justify-center">
      <div class="loader-wrapper">
        <span class="loader-letter">C</span>
        <span class="loader-letter">o</span>
        <span class="loader-letter">l</span>
        <span class="loader-letter">l</span>
        <span class="loader-letter">a</span>
        <span class="loader-letter">b</span>
        <span class="loader-letter">o</span>
        <span class="loader-letter">r</span>
        <span class="loader-letter">a</span>
        <span class="loader-letter">t</span>
        <span class="loader-letter">e</span>

        <div class="loader" />
      </div>
    </div>

    <div class="PluginCardGithub-Display absolute left-[50%] top-[50%] z-10 h-48 w-48 flex items-center justify-center rounded-full bg-[#02020210] backdrop-blur-md -translate-x-1/2 -translate-y-1/2">
      <svg height="128" aria-hidden="true" viewBox="0 0 24 24" version="1.1" width="128" data-view-component="true" class="">
        <path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
/* From Uiverse.io by dexter-st */
.loader-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  width: auto;
  margin: 2rem;

  font-family: 'Poppins', sans-serif;
  font-size: 1.6em;
  font-weight: 600;
  user-select: none;
  color: #fff;

  scale: 2;
}

.loader {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
  z-index: 1;

  background-color: transparent;
  mask: repeating-linear-gradient(90deg, transparent 0, transparent 6px, black 7px, black 8px);
}

.loader::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  background-image:
    radial-gradient(circle at 50% 50%, #ff0 0%, transparent 50%),
    radial-gradient(circle at 45% 45%, #f00 0%, transparent 45%),
    radial-gradient(circle at 55% 55%, #0ff 0%, transparent 45%),
    radial-gradient(circle at 45% 55%, #0f0 0%, transparent 45%),
    radial-gradient(circle at 55% 45%, #00f 0%, transparent 45%);
  mask: radial-gradient(circle at 50% 50%, transparent 0%, transparent 10%, black 25%);
  animation:
    transform-animation 2s infinite alternate,
    opacity-animation 4s infinite;
  animation-timing-function: cubic-bezier(0.6, 0.8, 0.5, 1);
}

@keyframes transform-animation {
  0% {
    transform: translate(-55%);
  }
  100% {
    transform: translate(55%);
  }
}

@keyframes opacity-animation {
  0%,
  100% {
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  65% {
    opacity: 0;
  }
}

.loader-letter {
  display: inline-block;
  opacity: 0;
  animation: loader-letter-anim 4s infinite linear;
  z-index: 2;
}

.loader-letter:nth-child(1) {
  animation-delay: 0.1s;
}
.loader-letter:nth-child(2) {
  animation-delay: 0.205s;
}
.loader-letter:nth-child(3) {
  animation-delay: 0.31s;
}
.loader-letter:nth-child(4) {
  animation-delay: 0.415s;
}
.loader-letter:nth-child(5) {
  animation-delay: 0.521s;
}
.loader-letter:nth-child(6) {
  animation-delay: 0.626s;
}
.loader-letter:nth-child(7) {
  animation-delay: 0.731s;
}
.loader-letter:nth-child(8) {
  animation-delay: 0.837s;
}
.loader-letter:nth-child(9) {
  animation-delay: 0.942s;
}
.loader-letter:nth-child(10) {
  animation-delay: 1.047s;
}
.loader-letter:nth-child(11) {
  animation-delay: 1.152s;
}

@keyframes loader-letter-anim {
  0% {
    opacity: 0;
  }
  5% {
    opacity: 1;
    text-shadow: 0 0 4px #fff;
    transform: scale(1.1) translateY(-2px);
  }
  20% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
  }
}
</style>
