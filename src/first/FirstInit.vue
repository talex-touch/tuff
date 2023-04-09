<template>
  <div ref="dom" class="FirstInit-Container">
<!--    <Greeting />-->
    <component :is="component" />

    <div v-wave id="FirstButton" class="FirstInit-Button">
      <RemixIcon name="arrow-right" />
    </div>
  </div>
</template>

<script>
export default {
  name: "FirstInit"
}
</script>

<script setup>
import Greeting from "~/first/steps/Greeting.vue";
import {onMounted, provide, ref} from "vue";
import RemixIcon from "@comp/icon/RemixIcon.vue";

const dom = ref()
const component = ref()

async function nextComp(comp) {
  component.value = comp
}

onMounted(() => {
  nextComp(Greeting)
})

function showButton(callback) {
  const button = document.getElementById("FirstButton")

  button.classList.add("show")

  // button.removeAllListeners()
  button.addEventListener("click", () => {

    button.classList.remove("show")

    dom.value.children[0].style.transition = 'all .5s ease-out'
    dom.value.children[0].style.opacity = '0'

    window._firstInit = false

    // TODO NEXT
    // setTimeout(callback, 500)

  })
}

provide('showButton', showButton)
provide('nextComp', nextComp)

</script>

<style lang="scss" scoped>
@keyframes arrowing {
  0% {
    opacity: 1;
    transform: translate(0%, 0);
  }
  10% {
    opacity: .25;
    transform: translate(20%, 0);
  }
  30% {
    opacity: 0;
    transform: translate(100%, 0);
  }
  35% {
    opacity: 0;
    transform: translate(-100%, 0);
  }
  40% {
    opacity: .25;
    transform: translate(-80%, 0);
  }
  70% {
    opacity: 1;
    transform: translate(-20%, 0);
  }
  40%, 100% {
    opacity: 1;
    transform: translate(0%, 0);
  }
}

.FirstInit-Button {
  .remix {
    animation: arrowing 1s infinite ease-in;
  }
  &:before, &:after {
    z-index: -1;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    border-radius: 50%;
    background-color: rgba(255, 255, 255, .5);

    --size: 1.2;
    animation: breathing .75s infinite ease-out;
  }
  &:after {

    --size: 1.5;
    animation: breathing 1.5s infinite ease-out;
  }
  &:hover {
    transform: translate(-50%, -50%) scale(.9)
  }
  z-index: 2;
  position: absolute;
  display: flex;

  justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  width: 128px;
  height: 128px;

  cursor: pointer;
  font-size: 50px;

  border-radius: 50%;
  background-color: rgba(255, 255, 255, .5);

  opacity: 0;
  -webkit-app-region: no-drag;
  transform: translate(-50%, -50%) scale(1.2);
  transition: transform .15s ease-in;
  &.show {
    opacity: 1;

    transform: translate(-50%, -50%) scale(1);
  }
}

.FirstInit-Container {
  z-index: 1000;
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  user-select: none;
  -webkit-app-region: drag;
  backdrop-filter: blur(100px) saturate(180%) brightness(.8);
}
</style>