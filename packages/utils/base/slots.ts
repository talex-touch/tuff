import { VNode } from 'vue';

// 扁平化 slot 内容：VNode、VNode[]、slot 函数、嵌套 slot 等
export function normalizeSlot(input: any): VNode[] {
  if (!input) return [];

  if (typeof input === 'function') {
    return normalizeSlot(input());
  }

  if (Array.isArray(input)) {
    return input.flatMap(normalizeSlot);
  }

  return [input]; // 单个 vnode
}

// 根据条件递归扁平化所有子 slot
export function flatSlotContent(
  vnodes: VNode[],
  filterFn?: (vnode: VNode) => boolean
): VNode[] {
  const result: VNode[] = [];

  for (const vnode of vnodes) {
    if (!vnode) continue;

    if (filterFn?.(vnode)) {
      result.push(vnode);
    } else if (vnode.children) {
      const children = normalizeSlot(vnode.children);
      result.push(...flatSlotContent(children, filterFn));
    }
  }

  return result;
}

// 主入口，传入 this.$slots 和筛选函数
export function extractFromSlots(
  slots: Record<string, any>,
  slotName = 'default',
  filterFn?: (vnode: VNode) => boolean
): VNode[] {
  const root = normalizeSlot(slots?.[slotName]);
  return flatSlotContent(root, filterFn);
}
