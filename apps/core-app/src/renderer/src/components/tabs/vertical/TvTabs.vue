<script lang="ts">
import {
  h,
  reactive,
  ref,
  defineComponent,
  type VNode,
  type Component,
  useSlots,
  nextTick
} from 'vue'
import TvTabItem from '@comp/tabs/vertical/TvTabItem.vue'
import { ElScrollbar } from 'element-plus'

export default defineComponent({
  name: 'TvTabs',
  props: {
    modelValue: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    // 状态管理
    const activeNodes = reactive<Record<string, any>>({ ...props.modelValue })
    const lastActive = ref<VNode | null>(null)
    const slotWrapper = ref<HTMLElement | null>(null)

    // 合格的组件名称
    const qualifiedName = ['TvTabItem', 'TvTabItemGroup']

    return () => {
      // 获取插槽内容
      const slots = useSlots()
      const defaultSlots = slots.default?.() || []

      const children = defaultSlots.filter((slot) => {
        // 检查slot.type是否为对象且有name属性
        if (typeof slot.type === 'object' && slot.type !== null && 'name' in slot.type) {
          const componentName = (slot.type as Component & { name: string }).name
          return componentName && qualifiedName.includes(componentName)
        }
        // 检查slot.type是否为字符串
        if (typeof slot.type === 'string') {
          return qualifiedName.includes(slot.type)
        }
        return false
      })

      // 获取标签页
      const getTab = (vnode: VNode, index: number): VNode => {
        const tabIndex = index + 1 || 0
        const isActive = (): boolean => activeNodes[tabIndex] === vnode.props?.name

        return h(TvTabItem, {
          active: isActive(),
          ...vnode.props,
          onClick: () => {
            // 如果禁用则不处理点击
            if (vnode.props && Object.hasOwn(vnode.props, 'disabled')) return

            // 处理动画效果
            const el = slotWrapper.value
            if (el) {
              const classList = el.classList
              
              // 清除之前的动画类
              classList.remove('slideInLeft', 'slideInRight', 'slideOutLeft', 'slideOutRight')

              // 获取之前激活的标签索引
              const previousActiveIndex = Object.keys(activeNodes).find(key => activeNodes[key])
              const prevIndex = previousActiveIndex ? parseInt(previousActiveIndex) : 0
              
              // 如果有之前激活的标签，先播放滑出动画
              if (previousActiveIndex && lastActive.value) {
                if (tabIndex > prevIndex) {
                  // 新标签在右侧，旧标签向左滑出
                  classList.add('slideOutLeft')
                } else {
                  // 新标签在左侧，旧标签向右滑出
                  classList.add('slideOutRight')
                }
                
                // 等待滑出动画完成后再播放滑入动画
                setTimeout(() => {
                  classList.remove('slideOutLeft', 'slideOutRight')
                  
                  // 更新激活状态
                  Object.keys(activeNodes).forEach(key => delete activeNodes[key])
                  lastActive.value = vnode
                  activeNodes[tabIndex] = vnode.props?.name
                  emit('update:modelValue', { ...activeNodes })
                  
                  // 播放滑入动画
                  nextTick(() => {
                    if (tabIndex > prevIndex) {
                      classList.add('slideInRight') // 从右侧滑入
                    } else {
                      classList.add('slideInLeft') // 从左侧滑入
                    }
                  })
                }, 200) // 滑出动画时长
              } else {
                // 没有之前的激活标签，直接播放滑入动画
                Object.keys(activeNodes).forEach(key => delete activeNodes[key])
                lastActive.value = vnode
                activeNodes[tabIndex] = vnode.props?.name
                emit('update:modelValue', { ...activeNodes })
                
                nextTick(() => {
                  classList.add('slideInRight') // 默认从右侧滑入
                })
              }
            }
          }
        })
      }

      // 获取所有标签
      const getTabs = (): VNode[] => {
        return children.map((child, index) => {
          // 检查child.type是否为对象且有name属性
          let componentName = ''
          if (typeof child.type === 'object' && child.type !== null && 'name' in child.type) {
            componentName = (child.type as Component & { name: string }).name
          } else if (typeof child.type === 'string') {
            componentName = child.type
          }

          if (componentName === 'TvTabItemGroup') {
            return h(
              'div',
              {
                class: 'TvTabs-TabGroup'
              },
              [
                h(
                  'div',
                  {
                    class: 'TvTabs-TabGroup-Name'
                  },
                  child.props?.name || ''
                ),
                // 处理子节点
                child.children && typeof child.children === 'object' && 'default' in child.children
                  ? (child.children as { default: () => VNode[] })
                      .default?.()
                      .map?.((c) => getTab(c, index)) || []
                  : []
              ]
            )
          } else {
            return getTab(child, index)
          }
        })
      }

      // 获取选中插槽内容
      const getSelectSlotContent = (): VNode => {
        return h(
          'div',
          {
            ref: slotWrapper,
            class: 'TTabs-SelectSlot animated'
          },
          lastActive.value && lastActive.value.children
            ? typeof lastActive.value.children === 'object' &&
              'default' in lastActive.value.children
              ? (lastActive.value.children as { default: () => any }).default?.()
              : lastActive.value.children
            : h(
                'div',
                {
                  class: 'TTabs-SelectSlot-Empty'
                },
                'No item selected.'
              )
        )
      }

      return h(
        'div',
        {
          class: 'TvTabs-Container'
        },
        [
          h(
            'div',
            {
              class: 'TvTabs-Header'
            },
            h('div', { class: 'TvTabs-HeaderWrapper' }, getTabs())
          ),
          h(
            'div',
            {
              class: 'TvTabs-Main'
            },
            h(ElScrollbar, {}, () => getSelectSlotContent())
          )
        ]
      )
    }
  }
})
</script>

<style lang="scss" scoped>
.TvTabs-TabGroup {
  .TvTabs-TabGroup-Name {
    z-index: 1;
    position: absolute;
    padding: 4px 8px;
    top: -16px;
    left: 12px;
    border-radius: 6px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
  }

  & :last-child {
    margin-right: 0;
  }

  position: relative;
  display: flex;
  flex-shrink: 0;
  padding: 12px 8px 6px 8px;
  margin-right: 8px;
  height: 100%;
  border-radius: 12px;
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--el-border-color-rgb), 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s ease;
  box-sizing: border-box;

  &:hover {
    border-color: rgba(var(--el-color-primary-rgb), 0.4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }
}

.TTabs-SelectSlot {
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  padding: 1.5rem;
  box-sizing: border-box;
  overflow-y: auto;
}

.TvTabs-Header {
  .TvTabs-HeaderWrapper {
    position: relative;
    display: flex;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    justify-content: flex-start;
    align-items: center;
    box-sizing: border-box;
  }
  z-index: 1;
  position: absolute;
  padding: 0.25rem 0.5rem;
  display: flex;

  top: 1rem;

  height: 48px;
  width: 100%;
  box-sizing: border-box;
}

.TTabs-SelectSlot-Empty {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 300px;
  font-size: 16px;
  color: var(--el-text-color-regular);
  opacity: 0.6;
}

.TvTabs-Container {
  .TvTabs-Main {
    &.header-mode .TTabs-SelectSlot {
      flex-direction: column;
      justify-content: flex-start;
    }

    position: relative;
    padding-top: 48px;

    height: 100%;
    box-sizing: border-box;
    background: var(--el-bg-color);
    overflow: hidden;
  }

  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: rgba(var(--el-fill-color-extra-light-rgb), 0.3);
  backdrop-filter: blur(20px);
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

/* Animations */
.animated {
  &.slideInLeft {
    animation: slideInLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
  
  &.slideInRight {
    animation: slideInRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }
}

@keyframes slideInLeft {
  0% {
    opacity: 0;
    transform: translateX(-40px);
    filter: blur(4px);
  }
  60% {
    opacity: 0.8;
    filter: blur(1px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    filter: blur(0);
  }
}

@keyframes slideInRight {
  0% {
    opacity: 0;
    transform: translateX(40px);
    filter: blur(4px);
  }
  60% {
    opacity: 0.8;
    filter: blur(1px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
    filter: blur(0);
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .TvTabs-Header {
    min-height: 70px;
    max-height: 80px;

    .TvTabs-HeaderWrapper {
      padding: 0.5rem;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
  }

  .TvTabs-TabGroup {
    margin-right: 4px;
    padding: 8px 6px 4px 6px;

    .TvTabs-TabGroup-Name {
      font-size: 0.6875rem;
      padding: 2px 6px;
    }
  }

  .TTabs-SelectSlot {
    padding: 1rem;
  }
}
</style>
