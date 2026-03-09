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
  <div ref="wholeDom" class="CodeInput-Container">
    <div contentEditable :tabindex="i" @focus="focusIndex = i" @click="focusIndex = i" :class="{ 'active': focusIndex === i, 'filled': modelValue[i - 1] }" class="CodeInput-Input transition-cubic" @keydown="handleInput" v-for="i in 6" :key="i" ref="refs">
      <span>{{ modelValue[i - 1] }}</span>
    </div>
    <teleport to="body">
      <div class="CodeInput-KeyBoard">
        <div @click="simulationInput(i)" v-wave class="input-key" v-text="i" v-for="i in 9" :key="9" />
        <div style="opacity: .25;cursor: not-allowed" v-wave class="input-key">
          取消
        </div>
        <div @click="simulationInput(0)" v-wave class="input-key">0</div>
        <div @click="simulationInput('Delete')"  v-wave class="input-key">
          <el-icon>
            <Close />
          </el-icon>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
export default {
  name: "CodeInput"
}
</script>

<script setup>
import { Close } from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'
import { useModelWrapper, sleep } from '@plugins/Common.ts'

const props = defineProps(['modelValue'])
const emits = defineEmits(['update:modelValue', 'done'])
const model = useModelWrapper(props, emits)

const focusIndex = ref(0)
const wholeDom = ref()
const refs = ref([])

async function done() {
  wholeDom.value.style.pointerEvents = 'none'
  focusIndex.value = -1

  await sleep(150)

  const [first, two, three, four, five, last] = refs.value

  first.style.userSelect = 'none'
  two.style.userSelect = 'none'
  three.style.userSelect = 'none'
  four.style.userSelect = 'none'
  five.style.userSelect = 'none'
  last.style.userSelect = 'none'

  first.blur()
  two.blur()
  three.blur()
  four.blur()
  five.blur()
  last.blur()

  // first.attributes.contentEditable = false
  // two.attributes.contentEditable = false
  // three.attributes.contentEditable = false
  // four.attributes.contentEditable = false
  // five.attributes.contentEditable = false
  // last.attributes.contentEditable = false

  await sleep(200)

  first.style.transform = 'translateX(280px)'
  last.style.transform = 'translateX(-280px)'

  await sleep(200)

  two.style.transform = 'translateX(170px)'
  five.style.transform = 'translateX(-170px)'

  await sleep(200)

  three.style.transform = 'translateX(60px)'
  four.style.transform = 'translateX(-60px)'

  await sleep(400)

  first.style.borderRadius = '50%'
  two.style.borderRadius = '50%'
  three.style.borderRadius = '50%'
  four.style.borderRadius = '50%'
  five.style.borderRadius = '50%'
  last.style.borderRadius = '50%'

  await sleep(400)

  three.style.transform = ''
  four.style.transform = ''

  await sleep(200)

  first.style.borderRadius = ''
  last.style.borderRadius = ''

  two.style.transform = ''
  five.style.transform = ''

  await sleep(200)

  two.style.borderRadius = ''
  five.style.borderRadius = ''

  first.style.transform = ''
  last.style.transform = ''

  await sleep(200)

  three.style.borderRadius = ''
  four.style.borderRadius = ''

  await sleep(400)

  first.style.opacity = '0'
  two.style.opacity = '0'
  three.style.opacity = '0'
  four.style.opacity = '0'
  five.style.opacity = '0'
  last.style.opacity = '0'

  await sleep(400)

  emits('done', model.value)
}

function simulationInput(key) {
  handleInput({
    preventDefault() {
      console.log('simulation')
    },
    code: key,
    key
  })
}

function handleInput(e) {

  const i = focusIndex.value

  e.preventDefault()

  const str = String(model.value)

  if( e.code === 'Backspace' || e.code === 'Delete' ) {

    if( i === 0 ) {

      model.value = str.substring(i, i - 1) + str.substring(i)

    } else if( model.value[i] )
      model.value = str.substring(0, i - 1) + str.substring(i)
    else model.value = str.substring(0, i - 2) + str.substring(i)

    focusIndex.value -= 1

    focusIndex.value = Math.max(focusIndex.value, 1)

  } else {

    const num = e.key

    if( isNaN(Number(num)) ) return

    // console.log((i > 0 ? str.substring(0, i - 1) : '') + "|" + num + "|" + str.substring(i, Math.min(str.length, 6)))

    model.value = ((i > 0 ? str.substring(0, i - 1) : '') + num + str.substring(i, Math.min(str.length, 6))).trim()

    focusIndex.value += 1

  }

  if( focusIndex.value > 6 ) return done()

  // for( const letter of str ) {
  //
  //   refs.value[0].innerText = letter
  //
  // }

  // console.log(i, model.value)

}

onMounted(() => {
  refs.value[0].focus()
})
</script>

<style lang="scss" scoped>

.CodeInput-KeyBoard {
  &:after {
    z-index: -1;
    content: "";
    position: absolute;

    width: 100%;
    height: 100%;

    left: 0;
    top: 0;

    opacity: .85;
    border-radius: 15px 15px 0 0;
    background-color: var(--el-fill-color);
  }
  position: absolute;
  padding: 10px 5px;
  display: grid;

  box-sizing: border-box;

  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr 1fr;
  grid-gap: 5px;

  .input-key {
    display: flex;
    justify-content: center;
    align-items: center;

    cursor: pointer;
    font-size: 24px;
    color: var(--el-text-color-primary);
    background-color: var(--el-fill-color-light);
    border-radius: 2px;
  }

  left: 0;
  bottom: 0;

  height: 30%;
  width: 100%;

  //background-color: var(--el-fill-color-light);
  animation: bottomLoadIn .75s ease-out;
  border-radius: 15px 15px 0 0;
  backdrop-filter: saturate(180%) blur(16px);
}

.CodeInput-Container {
  position: relative;
  display: flex;

  width: 100%;

  perspective: 1px;
  .CodeInput-Input {
    //&:active, &:focus, &:focus-visible, &:focus-within {
    //  border: 2px solid var(--el-border-color);
    //}
    span {
      font-weight: 600;
      font-size: 22px;
    }
    &.active {
      border: 2px solid var(--el-color-primary) !important;
      transform: rotate3d(-1, 0, 0, .1deg) scale(1.05);
      &:after {
        transform: scale(1) translateY(5px);
      }
    }
    &.filled {
      color: var(--el-color-primary-light-5);
      background-color: var(--el-fill-color);
      border: 2px solid var(--el-fill-color-darker);

      transform: rotate3d(-1, 0, 0, -.1deg);
    }
    &:after {
      content: "";
      position: absolute;

      width: calc(100% - 4px);
      height: 2px;

      top: 100%;
      left: 2px;

      background-color: var(--el-color-primary);
      border-radius: 5px;
      transform: scale(0) translateY(-5px);
      transition: all .25s;
    }
    position: relative;
    margin: 0 5px;
    display: flex;
    justify-content: center;
    align-items: center;

    width: 42px;
    height: 42px;

    cursor: text;
    border: 2px solid var(--el-border-color);
    border-radius: 8px;
  }
}

@media only screen and (min-width: 600px) {
  .CodeInput-KeyBoard {
    display: none;
  }
}
</style>
