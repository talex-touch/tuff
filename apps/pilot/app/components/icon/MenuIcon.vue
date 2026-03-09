<!--
  - Copyright (c) 2022. TalexDreamSoul
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  -     http://www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<template>
  <div class="MenuIcon-Container">
    <div class="MenuIcon-Display" @click="toggle = !toggle">
      <div class="box">
        <div id="hamburger-2" class="hamburger" :class="{ 'active': toggle }">
          <span class="line"></span>
          <span class="line"></span>
          <span class="line"></span>
        </div>
      </div>
    </div>
    <div @click="toggle = false" class="MenuIcon-Addon" :class="{ 'active': toggle }">
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: "MenuIcon"
}
</script>

<script setup>
import { ref } from 'vue'

const toggle = ref(false)
</script>

<style lang="scss" scoped>
.MenuIcon-Addon {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: .95;
    border-radius: 4px;
    background-color: var(--el-fill-color-lighter);
    box-shadow: 0 0 1px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.1);
    //backdrop-filter: saturate(180%) contrast(200%) brightness(150%) blur(10px);
    //background-image: radial-gradient(transparent 1px,var(--el-fill-color) 1px);
    //background-size: 4px 4px;
  }
  z-index: 99999;
  position: absolute;
  padding: 6px 4px;

  justify-content: center;
  align-items: center;
  //align-self: center;
  vertical-align: center;

  left: 50%;
  top: 0;

  min-width: 245px;
  width: auto;
  height: auto;
  //min-height: 30px;

  backdrop-filter: saturate(180%) brightness(98%) blur(30px);
  border-radius: 4px;
  transform: translate(-50%, -10%) scale(0);
  //opacity: 0;
  //background-color: rgba(10, 31, 53, 0.03);
  transition: .25s cubic-bezier(.25,.8,.25,1);
}

.MenuIcon-Addon.active {
  transform: translate(-50%, 120%) scale(1);
  //opacity: 1;
}

.MenuIcon-Display {
  .box {
    position: relative;

    width: 24px;
    //height: 100%;

    //background-color: var(--el-text-color-primary);
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
  }
  .box:before {
    content: " ";
    display: block;
    padding-top: 100%;
  }

  .hamburger {
    width: 24px;
    cursor: pointer;
  }

  .hamburger .line {
    display: block;
    width: 100%;
    height: 3px;
    border-radius: 2px;
    opacity: .85;
    background-color: var(--el-text-color-primary);
    margin-bottom: 5px;
    -webkit-transition: all 0.3s ease-in-out;
    transition: all 0.15s ease-in-out;
  }

  #hamburger-2.active .line:nth-child(1) {
    transform: translateY(8px) rotate(-45deg);
  }
  #hamburger-2.active .line:nth-child(2) {
    opacity: 0;
  }
  #hamburger-2.active .line:nth-child(3) {
    transform: translateY(-8px) rotate(45deg);
  }

}

.MenuIcon-Container {
  width: 100%;
  height: 100%;

  justify-content: center;
  align-items: center;

  position: relative;
  display: flex;
}
</style>
