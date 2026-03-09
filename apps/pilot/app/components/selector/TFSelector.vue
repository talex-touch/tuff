<template>

  <div class="TFSelectorPage">

    <div ref="PointerRef" :class="{ brighter, vertical }" class="TFSelectorPointer"></div>

    <div class="TFSelectorPage-Wrapper">
      <slot></slot>
    </div>

  </div>

</template>

<script setup>

import { nextTick, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const emits = defineEmits(['selectIndex'])

const router = useRouter()
const route = useRoute()

const props = defineProps({

  vertical: {

    type: Boolean,
    default: false

  },

  routerMode: {

    type: Boolean,
    default: false

  },

  lazy: {

    type: Object | Function,
    default: null

  },

  small: {

    type: Boolean,
    default: false

  },

  brighter: {

    type: Boolean,
    default: false

  },

})
const PointerRef = ref(null)

const selectIndex = ref(-1)
const tabs = ref([])
const animating = ref(false)

provide('pushItem', (item, path, setVerticalFunc, setSmallFunc, refreshSelectFunc, disabledFunc) => {

  const obj = { ind: tabs.value.length, item, path, refreshSelectFunc, disabledFunc }

  tabs.value.push( obj )

  if ( props.vertical )
    setVerticalFunc( props.vertical )

  if ( props.small )
    setSmallFunc( props.small )

  item.value.onclick = ( ref, e ) => {

    if( disabledFunc() ) return;

    if ( animating.value ) return;

    if ( props.routerMode ) {

      if ( route.fullPath !== path )
        router.push( path )

    }

    selectIndex.value = obj.ind;

    emits( 'selectIndex', obj.ind )

  }

  if ( props.routerMode ) {

    init.value()

  }

})

// onMounted(() => {
//
//   if( !props.lazy ) {
//
//     init.value()
//
//   } else {
//
//     props.lazy( () => {
//
//       init.value()
//
//     } )
//
//   }
//
// })

const init = ref(() => {

  if ( props.routerMode ) {

    watch( () => route.fullPath, ( fullPath, oldValue ) => {

      if ( fullPath === oldValue ) return

      let matched = false

      tabs.value.forEach( ( node, ind ) => {

        if ( matched ) return

        const ref = node?.item

        if( !ref ) return

        const to = node.path

        if ( to === fullPath || fullPath.startsWith( to ) ) {

          selectIndex.value = ind

          matched = true

        }

      } )

      if ( ! matched ) {

        selectIndex.value = -1
        refreshChildrenSelected.value()

      }

      if ( tabs.value[selectIndex.value] && tabs.value[selectIndex.value].item )
        fixPointerPos.value( tabs.value[selectIndex.value].item )

    }, { immediate: true } )

  }

})

const refreshChildrenSelected = ref(() => {

  tabs.value.forEach((tab, ind) => {

    tab.refreshSelectFunc(selectIndex.value === ind)

  })

})

let timer;

const fixPointerPos = ref((node) => {

  if( !timer ) {

    clearTimeout( timer )

  }

  timer = setTimeout(() => {

    const el = PointerRef.value

    if( props.vertical ) {

      const y = el.clientTop || el.offsetTop
      const height = el.clientHeight
      const targetY = node.offsetTop
      const targetHeight = node.clientHeight

      if( y < targetY ) {

        const addHeight = (targetY - y) + (targetHeight * 1.5) - height

        el.style.transition = 'height .15s, top .15s'
        // el.style.top = (y + (height * 0.5)) + 'px'
        el.style.height = addHeight + 'px'

        setTimeout(() => {

          el.style.transition = 'height .15s, top .35s'

          const posY = targetY + (targetHeight / 2) - (height / 2)
          el.style.top = (posY) + 'px'

          el.style.height = (targetHeight) + 'px'

        }, 250)

      } else {

        const addHeight = (y + height) - (targetY + (targetHeight * 1.25))

        el.style.transition = 'height .15s, top .15s'
        el.style.top = (targetY + (targetHeight * 0.5)) + 'px'
        el.style.height = (addHeight) + 'px'

        setTimeout(() => {

          el.style.transition = 'height .15s, top .35s'

          const posY = targetY + (targetHeight / 2) - (height / 2)
          el.style.top = (posY) + 'px'

          el.style.height = (targetHeight) + 'px'

        }, 250)

      }

      setTimeout(() => {

        el.style.top = targetY + 'px'

      }, 350)

    } else {

      const x = el.clientLeft || el.offsetLeft
      const width = el.clientWidth
      const targetX = node.offsetLeft
      const targetWidth = node.offsetWidth || node.clientWidth

      if( x < targetX ) {

        // const addWidth = targetX - x + (targetWidth * 1.5) - width
        //
        // el.style.width = addWidth + 'px'
        const posX = targetX + (targetWidth / 2) - (width / 2)

        setTimeout(() => {

          el.style.width = (targetWidth) + 'px'
          el.style.left = posX + 'px'

        }, 250)

      } else {

        // const addWidth = (x + width) - (targetX + (targetWidth * 0.5))

        // el.style.transition = 'width .15s, left .15s'
        // el.style.left = (targetX + (targetWidth * 0.5)) + 'px'
        // el.style.width = (addWidth) + 'px'

        setTimeout(() => {

          el.style.transition = 'width .15s, left .35s'

          const posX = targetX + (targetWidth / 2) - (width / 2)
          el.style.left = (posX) + 'px'

          el.style.width = (targetWidth) + 'px'

        }, 250)

      }

      setTimeout(() => {

        el.style.left = targetX + 'px'

      }, 350)

    }

  }, 50)

})

watch(() => selectIndex.value, (latest) => {

  if( latest < 0 || latest > tabs.value.length - 1 ) {

    PointerRef.value.style.opacity = '0'
    return

  } else {

    PointerRef.value.style.opacity = '1'

  }

  refreshChildrenSelected.value()
  fixPointerPos.value( tabs.value[latest].item )

})

</script>

<script>

export default {
  name: "TFSelector",
}
</script>

<style lang="scss" scoped>

.TFSelectorPage {
  position: relative;

  height: auto;

  .TFSelectorPointer {
    z-index: 0;
    position: absolute;

    top: 0;
    left: -3px;

    width: 3px;
    height: 100%;

    opacity: 0;

    //box-shadow: 3px 0 4px var(--el-color-primary);
    border-radius: 5px;
    background-color: var(--el-color-primary);
    //transform: scale(.8);
    transition: width .35s, left .15s;

    //filter: invert(20%);

    .vertical {

      top: 0;

      border-radius: 100px;

      transition: height .35s, top .15s;

    }

  }
  .TFSelectorPage-Wrapper {
    z-index: 10;
  }

  //overflow: hidden;

}

.brighter {

  background-color: var(--app-lighter-color) !important;

  font-weight: bold;

  opacity: .9 !important;

  filter: invert(0) brightness(130%) !important;

}

</style>
