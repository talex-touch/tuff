import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClipboardInsight from './ClipboardInsight.vue'

function mountWith(content: string, props: Record<string, unknown> = {}) {
  return mount(ClipboardInsight, {
    props: { item: { id: 1, type: 'text', content } as PluginClipboardItem, ...props },
  })
}

function rows(wrapper: ReturnType<typeof mountWith>): Record<string, string> {
  const entries = wrapper.findAll('.kv-row').map(row => [
    row.get('.kv-label').text(),
    row.get('.kv-value').text(),
  ])
  return Object.fromEntries(entries)
}

describe('clipboardInsight ssh panel', () => {
  it('splits an ssh invocation into separately copyable fields', async () => {
    const wrapper = mountWith('ssh deploy@10.0.3.14 -p 2222')

    expect(rows(wrapper)).toMatchObject({ 用户: 'deploy', 端口: '2222' })

    // 每一行复制的是那一个字段，不是整条内容——这是拆行的全部意义。
    const userRow = wrapper.findAll('.kv-row')[0]!
    await userRow.get('.kv-value').trigger('click')
    expect(wrapper.emitted('copyText')?.[0]).toEqual(['deploy'])
  })

  it('masks the host ip and copies the full value anyway', async () => {
    const wrapper = mountWith('ssh deploy@10.0.3.14 -p 2222')

    const host = rows(wrapper)['主机']!
    expect(host).not.toContain('10.0.3')
    expect(host).toContain('•')

    const hostRow = wrapper.findAll('.kv-row')[1]!
    await hostRow.get('.kv-value').trigger('click')
    // 掩码是展示层的事；复制写入的必须是完整值，否则粘出去是一串圆点。
    expect(wrapper.emitted('copyText')?.[0]).toEqual(['10.0.3.14'])
  })

  it('reveals the host on demand', async () => {
    const wrapper = mountWith('ssh deploy@10.0.3.14')

    await wrapper.get('.kv-tag.reveal').trigger('click')
    expect(rows(wrapper)['主机']).toBe('10.0.3.14')
  })

  it('leaves a domain host unmasked and offers no reveal toggle', async () => {
    // 掩掉主机名就看不出连的是哪台了。
    const wrapper = mountWith('ssh deploy@build.example.com')

    expect(rows(wrapper)['主机']).toBe('build.example.com')
    expect(wrapper.find('.kv-tag.reveal').exists()).toBe(false)
  })

  it('shows a public key without masking it', () => {
    const wrapper = mountWith(`ssh-ed25519 ${'A'.repeat(68)} deploy@laptop`)

    expect(rows(wrapper)).toMatchObject({ 算法: 'ssh-ed25519', 注释: 'deploy@laptop' })
    expect(wrapper.find('.kv-tag.reveal').exists()).toBe(false)
    expect(wrapper.text()).toContain('公钥是公开信息')
  })

  it('omits the port row when no delimiter placed one', () => {
    // 裸数字不产生端口，所以这一行干脆不出现，而不是显示一个猜出来的值。
    const wrapper = mountWith('ssh deploy@10.0.3.14')

    expect(rows(wrapper)).not.toHaveProperty('端口')
  })

  it('masks by default when no flag is passed', () => {
    // Vue 把缺省的 Boolean prop 铸成 `false`，所以"默认为真"必须靠 withDefaults 显式声明。
    // 少了它，不传 prop 就等于关掉掩码——而不传 prop 正是真实调用方最容易写出的形态。
    const wrapper = mountWith('ssh deploy@10.0.3.14')

    expect(rows(wrapper)['主机']).toContain('•')
  })

  it('shows the ip in the clear when masking is turned off, and still splits the fields', () => {
    const wrapper = mountWith('ssh deploy@10.0.3.14 -p 2222', { maskHostIp: false })

    // 关掉的是掩码，不是识别：拆行必须照常。
    expect(rows(wrapper)).toMatchObject({
      用户: 'deploy',
      主机: '10.0.3.14',
      端口: '2222',
    })
    expect(wrapper.find('.kv-tag.reveal').exists()).toBe(false)
  })

  it('does not claim an email address is a host', () => {
    const wrapper = mountWith('联系 ops@example.com 处理')

    expect(wrapper.text()).not.toContain('SSH')
  })
})
