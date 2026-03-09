<template>

  <div class="TMSelectorPage" @mouseleave="handleLeave" @mouseenter="handleEnter">

    <div ref="PointerRef" :class="vertical ? '' : 'vertical'" class="TMSelectorPointer"></div>

    <slot></slot>

  </div>

</template>

<script>

import TMSelectorItem from "./TMSelectorItem";
export default {
  name: "TMSelector",
  components: {TMSelectorItem},
  props: {

    vertical: {

      type: Boolean,
      default: false

    },

    routerMode: {

      type: Boolean,
      default: false

    }

  },
  mounted() {

    this.$nextTick(() => {

      let ind = 0;

      const tags = [ 'TMSelectorItem', 'TmSelectorItem']

      this.$slots.default.forEach((node) => {

        if( node.componentOptions && tags.indexOf(node.componentOptions.tag) !== -1 ) {

          const obj = { ind, node }

          this.tabs.push( obj )

          if( this.vertical )
            node.componentInstance.setVertical( this.vertical )

          node.componentInstance.$on('tm-selector-item-enter', (ref, e) => {

            this.selectIndex = obj.ind;

          })

          node.componentInstance.$on('click', (ref, e) => {

            if( this.routerMode ) {

              const targetPath = node.componentInstance.getTo()

              if( this.$route.fullPath !== targetPath )
                this.$router.push( targetPath )

            }

            this.selectIndex = obj.ind;

            this.$emit('selectIndex', obj.ind)

          })

          ++ind;

        }

        setTimeout(() => {

          this.selectIndex = 0

          if( this.routerMode ) {

            this.$watch('$route.fullPath', (fullPath) => {

              let matched = false

              this.tabs.forEach((node, ind) => {

                if( matched ) return

                const ref = node.node.componentInstance

                if( ref.getTo() === fullPath ) {

                  this.selectIndex = ind

                  matched = true

                }

              })

              if( !matched ) {

                this.selectIndex = -1

              }

            }, { immediate: true })

          }

        })

      })

    })

  },
  watch: {

    selectIndex: {

      handler(latest) {

        // console.log( latest )

        if( latest < 0 || latest > this.tabs.length - 1 ) {

          this.$refs.PointerRef.style.opacity = '0'
          return

        } else {

          this.$refs.PointerRef.style.opacity = '1'

        }

        let timer;

        if( timer ) {

          clearTimeout( timer );

        }

        timer = setTimeout(() => {

          this.fixPointerPos(this.tabs[latest].node)

        }, 100);

      }

    }

  },
  methods: {

    handleLeave() {

      const el = this.$refs.PointerRef

      el.style.transition = 'opacity .35s'
      el.style.opacity = '0'

    },

    handleEnter() {

      const el = this.$refs.PointerRef

      el.style.transition = 'opacity .25s'
      el.style.opacity = '1'

    },

    fixPointerPos(vnode) {

      const node = vnode.elm
      const el = this.$refs.PointerRef

      if( this.vertical ) {

        const y = el.clientTop || el.offsetTop
        const height = el.clientHeight
        const targetY = node.offsetTop
        const targetHeight = node.clientHeight

        if( y < targetY ) {

          const addHeight = targetY - y + (targetHeight * 1.5) - height

          el.style.height = addHeight + 'px'
          const posY = targetY + (targetHeight / 2) - (height / 2)

          setTimeout(() => {

            el.style.height = (targetHeight) + 'px'
            el.style.top = posY + 'px'

          }, 250)

        } else {

          const addHeight = (y + height) - (targetY + (targetHeight * 0.5))

          el.style.transition = 'height .15s, top .15s'
          el.style.top = (targetY + (targetHeight * 0.5)) + 'px'
          el.style.height = (addHeight) + 'px'

          setTimeout(() => {

            el.style.transition = 'height .15s, top .35s'

            const posY = targetY + (targetHeight / 2) - (height / 2)
            el.style.top = posY + 'px'

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
        const targetWidth = node.clientWidth

        if( x < targetX ) {

          const addWidth = targetX - x + (targetWidth * 1.5) - width

          el.style.width = addWidth + 'px'
          const posX = targetX + (targetWidth / 2) - (width / 2)

          setTimeout(() => {

            el.style.width = (targetWidth) + 'px'
            el.style.left = posX + 'px'

          }, 250)

        } else {

          const addWidth = (x + width) - (targetX + (targetWidth * 0.5))

          el.style.transition = 'width .15s, left .15s'
          el.style.left = (targetX + (targetWidth * 0.5)) + 'px'
          el.style.width = (addWidth) + 'px'

          setTimeout(() => {

            el.style.transition = 'width .15s, left .35s'

            const posX = targetX + (targetWidth / 2) - (width / 2)
            el.style.left = posX + 'px'

            el.style.width = (targetWidth) + 'px'

          }, 250)

        }

        setTimeout(() => {

          el.style.left = targetX + 'px'

        }, 350)

      }

    }

  },
  data() {

   return {

     selectIndex: -1,
     tabs: [],

   }

  }

}
</script>

<style lang="scss" scoped>

.TMSelectorPage {

  position: relative;

  height: auto;

  .TMSelectorPointer {

    position: absolute;

    top: calc(100% - 2px);
    left: 0;

    width: 2px;
    height: 2px;

    border-radius: 5px;
    opacity: 0;

    box-shadow: 1px 0 5px var(--app-color);
    background-color: var(--app-color);
    transition: width .35s, left .15s;

    .vertical {

      top: 0;
      transition: height .35s, top .15s;

    }

  }

  overflow: hidden;

}

</style>
