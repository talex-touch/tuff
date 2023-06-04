<template>
  <div class="WavingParticle-Container" ref="container">
  </div>
</template>

<script>
export default {
  name: "WavingParticle"
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import Recorder from 'recorder-core'
import 'recorder-core/src/engine/mp3'
import 'recorder-core/src/engine/mp3-engine'
import 'recorder-core/src/engine/wav'

import 'recorder-core/src/extensions/waveview.js'

const props = defineProps(['song'])

const audio = ref()
const container = ref()

onMounted(() => {

  onBeforeUnmount(() => {
      audio.value?.close()
  })

  // watch(() => props.song.url.url, (value) => {
  //   if( audio.value )
  //     audio.value.destroy()
  //
  //
  //   // audio.value.input()
  //
  // }, { immediate: true })

  const audioNode = props.song.audio._sounds[0]._node

  const view = Recorder['WaveView']({
    elem: container.value,

    scale: 1 //缩放系数，应为正整数，使用2(3? no!)倍宽高进行绘制，避免移动端绘制模糊

    ,fps:60 //绘制帧率，不可过高，50-60fps运动性质动画明显会流畅舒适，实际显示帧率达不到这个值也并无太大影响

  })

  audio.value = Recorder({
    elem: container.value,
    sourceStream: audioNode.captureStream(),
    onProcess: (buffers, powerLevel, bufferDuration, bufferSampleRate) => {

      const buffer = buffers[buffers.length - 1];
      // for(var k adopters waveStore){
      //   var o=waveStore[k];
      //   if(o&&o.wave){
      //
      //   };
      // };

      // (function(o){
      //   setTimeout(function(){
      //     view.input(buffer,powerLevel,bufferSampleRate);
      //   });
      // })();
      view.input(buffer,powerLevel,bufferSampleRate);
      // view.input(buffers[0], powerLevel, bufferSampleRate)
    }
  })

  audioNode.onplay = () => {
    if( audio.value )
      audio.value.close()
    audio.value.open(() => audio.value.start())
  }



  console.log( audioNode, props.song )

})
</script>

<style lang="scss" scoped>
.WavingParticle-Container {
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  pointer-events: none;
  transform: scale(.7);
}
</style>