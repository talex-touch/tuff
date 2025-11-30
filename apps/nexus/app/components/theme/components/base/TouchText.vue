<script setup lang="ts">

</script>

<template>
  <div class="touch-text-container">
    <h1 ref="textRef" class="touch-text" data-text="Tuff">Tuff</h1>
  </div>
</template>

<style scoped lang="scss">
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&display=swap');

.touch-text-container {
  position: relative;
  display: flex;

  width: max-content;
  height: max-content;

  align-items: center;
  justify-content: center;
}

.touch-text {
  font-family: 'Poppins', sans-serif;
  font-size: 8rem;
  font-weight: 700;
  // text-transform: uppercase;
  letter-spacing: 2.5vmin;

  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.5);
  color: rgba(255, 255, 255, 0.9);

  text-shadow:
      0 0 10px rgba(255, 255, 255, 0.3),
      0 0 20px rgba(255, 255, 255, 0.2),
      0 0 30px rgba(255, 255, 255, 0.15);

  transform: translateZ(0);
  transition: all 0.3s ease;

  position: relative;
  display: flex;

  width: 100%;
  height: 100%;

  align-items: center;
  justify-content: center;

  &::before {
    content: attr(data-text);
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: -1;

    transform: translate(-50%, -50%) scale(1, 1.5);

    filter: blur(15px) brightness(200%);

    background: linear-gradient(45deg, #021A73, #330501);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  @media (max-width: 768px) {
    font-size: 4rem;
  }

  @media (max-width: 480px) {
    font-size: 3rem;
  }
}
</style>
