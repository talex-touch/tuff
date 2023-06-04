<script name="ActionTemplate" lang="ts">
export default defineComponent({
  props: {
    action: {
      type: Function,
      required: true
    }
  },
  render() {
    const checkForm = inject('checkForm')

    const { $slots: slots, $props: props } = this

    const slot = slots.default?.()

    function addListener(el: Element) {
      if (!el) throw new Error('No element found.')

      el.addEventListener('click', () => {
        props.action?.({
          checkForm,
          ...this
        })
      })
    }

    nextTick(() => {
      slot.forEach(e => addListener(e.el))
    })

    return slot
  }
})
</script>