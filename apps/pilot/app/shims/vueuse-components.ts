import { defineComponent, h } from 'vue'

export const UseImage = defineComponent({
  name: 'UseImage',
  props: {
    src: {
      type: String,
      default: '',
    },
    alt: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    return () => h('img', {
      src: props.src,
      alt: props.alt,
    })
  },
})
