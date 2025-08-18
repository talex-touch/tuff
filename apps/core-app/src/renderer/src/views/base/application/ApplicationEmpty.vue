<script setup lang="ts"></script>

<template>
  <div class="ApplicationEmpty">
    <div class="spinner">
      <div class="spinner1"></div>
    </div>

    <div class="Describer">
      <h4>Choose an application to configure.</h4>
      <p>
        Unleash the power of app customization to tailor your digital space. Fine-tune settings to
        optimize workflow and seamlessly share configurations via a personal cloud. Explore diverse
        setups for inspiration and insights. Ready to create your perfect workspace? Select an app
        to begin.
      </p>
    </div>
  </div>
</template>

<style lang="scss">
.ApplicationEmpty {
  &:after {
    z-index: -1;
    content: '';
    position: absolute;

    right: 0;
    top: 0;

    width: 100%;
    height: 500%;

    background-image:
      radial-gradient(circle at top right, rgba(94, 74, 176, 0.2) 50%, transparent 60%),
      radial-gradient(circle at top right, var(--el-color-primary-light-5) 10%, transparent 80%),
      radial-gradient(circle at top right, rgba(94, 74, 176, 0.8) 20%, rgba(94, 74, 176, 0) 100%);
    background-position:
      top right,
      top right,
      top right;
    background-size:
      60% 25%,
      80% 30%,
      100% 25%;
    background-repeat: no-repeat;

    opacity: 0.25;
    filter: blur(18px) saturate(100%) brightness(120%);
  }

  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  width: 100%;
  height: 100%;

  gap: 3rem;
}

.Describer {
  p {
    margin: 0;

    opacity: 0.95;
    font-size: 0.85rem;
    text-align: center;
  }

  h4 {
    margin: 0;
  }

  padding: 0 8rem;

  gap: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.spinner {
  background-image: linear-gradient(rgb(186, 66, 255) 35%, rgb(0, 225, 255));
  width: 100px;
  height: 100px;
  animation: spinning82341 1.7s linear infinite;
  text-align: center;
  border-radius: 50px;
  filter: blur(1px);
  box-shadow:
    0px -5px 20px 0px rgb(186, 66, 255),
    0px 5px 20px 0px rgb(0, 225, 255);
}

.spinner1 {
  background-color: rgb(36, 36, 36);
  width: 100px;
  height: 100px;
  border-radius: 50px;
  filter: blur(10px);
}

@keyframes spinning82341 {
  to {
    transform: rotate(360deg);
  }
}
</style>
