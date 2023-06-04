<script>
import { ref, h, nextTick } from 'vue'
import { sleep } from '@modules/utils.ts'

let index = ref(0)
export default {
  name: "Banners",
  props: {
    banners: {
      type: Array,
      default: []
    }
  },
  render() {
    const that = this

    let nowBanner, lastBanner

    const banners = (() => {
      const _nowBanner = this.banners[index.value]

      const _lastBanner = (() => {
        if( index.value === this.banners.length - 1 ) return this.banners[0]
        return this.banners[index.value + 1]

      })()

      nowBanner = h('div', {
        class: 'Banner-Item-Wrapper now'
      }, h('div', {
        class: 'Banner-Item',
        style: {
          backgroundImage: `url(${_nowBanner.imageUrl})`,
        }
      }))

      lastBanner = h('div', {
        class: 'Banner-Item-Wrapper last'
      }, h('div', {
        class: 'Banner-Item',
        style: {
          backgroundImage: `url(${_lastBanner.imageUrl})`
        }
      }))

      nextTick(async () => {
        const now = nowBanner.el
        const last = lastBanner.el

        await sleep(200)

        Object.assign(last.style, {
          opacity: 0,
          transform: 'scale(0.9) translateX(-100%)'
        })

        Object.assign(now.style, {
          opacity: 1,
          transform: 'scale(1) translateX(0)'
        })

        await sleep(100)

        Object.assign(last.style, {
          opacity: 1,
          transform: 'scale(0.9) translateX(-50%)'
        })

      })

      return [ lastBanner, nowBanner ]
    })()

    function pointer() {
        const pointers = []

        for (let i = 0; i < that.banners.length; i++) {
          const el = h('div', {
            class: {
              'Banner-Pointer': true,
              'Banner-Pointer-Active': i === index.value
            }
          })

          pointers.push(el)

          nextTick(() => {

            el.el.addEventListener('click',async () => {
              const now = nowBanner.el
              const last = lastBanner.el

              Object.assign(now.style, {
                opacity: 0,
                transform: 'scale(0.9) translateX(-100%)'
              })

              Object.assign(last.style, {
                opacity: 1,
                transform: 'scale(1) translateX(100%)'
              })

              await sleep(200)

              Object.assign(now.style, {
                opacity: 0,
                transform: 'scale(0.9) translateX(100%)'
              })

              index.value = i
            })

          })
        }

        return pointers
    }

    return h('div', {
      class: 'Banner-Container'
    }, [ ...banners, h('div', { class: 'Banner-Pointer-Wrapper' }, pointer()) ])

  }
}
</script>

<style lang="scss">
.Banner-Pointer-Wrapper {
  .Banner-Pointer {
    position: relative;
    display: inline-block;

    width: 10px;
    height: 10px;

    border-radius: 50%;
    opacity: .5;
    background: var(--el-color-primary-light-9);
    margin: 0 5px;
    cursor: pointer;

    backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
    filter:  invert(80%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(100%);
    transition: all 0.3s ease-in-out;

    &-Active {
      opacity: .75;

      width: 30px;

      border-radius: 5px;
    }
  }
  position: absolute;
  display: flex;

  bottom: 2%;
  width: 100%;

  height: 5%;

  justify-content: center;
  align-items: center;
  filter: invert(100%);
}

.Banner-Item-Wrapper {
  &.now {
    filter: drop-shadow(-5px 0 4px var(--el-bg-color-overlay));

    transition: .2s;
    opacity: 0;
    transform: scale(0.9) translateX(100%);
  }
  &.last {
    transition: .2s;
    opacity: 1;
    transform: scale(1) translateX(0);
  }
  .Banner-Item {
    position: relative;

    width: 100%;
    height: 100%;

    border-radius: 12px;
    background-size: contain;
    background-position: center;
    background-repeat: no-repeat;
    overflow: hidden;
  }
  position: absolute;
  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  display: flex;
  align-items: center;
  justify-content: center;

  overflow: hidden;
  border-radius: 8px;
}

.Banner-Container {
  position: relative;
  margin: 1%;

  width: 45%;
  height: auto;
  aspect-ratio: 25 / 9;

  box-sizing: border-box;
  overflow: hidden;
}
</style>