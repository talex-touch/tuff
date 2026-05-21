import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  cdpBaseUrl,
  clickElement,
  closeTarget,
  collectPageEvents,
  createClient,
  createTarget,
  delay,
  docsBaseUrl,
  evaluate,
  pressKey,
  reportDir,
  screenshot,
  setViewport,
  typeIntoElement,
  visibleText,
  waitForPage,
} from './audit-cdp-client.mjs'

const screenshotDir = path.join(reportDir, 'interaction-screenshots')
const reportPath = path.join(reportDir, 'interaction-smoke-report.json')

const tests = [
  {
    name: 'select-basic',
    page: 'select',
    async run(client) {
      await clickElement(client, '.tuff-select__trigger', { scope: '.vp-doc .demo-block' })
      await clickElement(client, '.tuff-select-item', { text: '选项 2', scope: 'document', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const input = document.querySelector('.vp-doc .demo-block .tuff-select input')
        const root = document.querySelector('.vp-doc .demo-block .tuff-select')
        return { value: input?.value || '', open: root?.classList.contains('is-open') ?? false }
      })()`)
      return { ok: details.value === '选项 2' && !details.open, ...details }
    },
  },
  {
    name: 'flat-select-basic',
    page: 'flat-select',
    async run(client) {
      await clickElement(client, '.tx-flat-select__trigger', { scope: '.vp-doc .demo-block' })
      await clickElement(client, '.tx-flat-select-item', { text: 'CSV', scope: '.vp-doc .demo-block', afterMs: 450 })
      const details = await evaluate(client, `(() => {
        const root = document.querySelector('.vp-doc .demo-block .tx-flat-select')
        const text = root?.querySelector('.tx-flat-select__text')?.innerText.trim() || ''
        const preview = root?.closest('.demo-block')?.querySelector('.demo-block__preview')?.innerText || ''
        return { text, preview }
      })()`)
      return { ok: details.text === 'CSV' && details.preview.includes('当前：csv'), ...details }
    },
  },
  {
    name: 'checkbox-toggle',
    page: 'checkbox',
    async run(client) {
      const before = await evaluate(client, visibleText('.tx-checkbox', '.vp-doc .demo-block'))
      const checkedBefore = await evaluate(client, `document.querySelector('.vp-doc .demo-block .tx-checkbox')?.getAttribute('aria-checked')`)
      await clickElement(client, '.tx-checkbox', { scope: '.vp-doc .demo-block' })
      const checkedAfter = await evaluate(client, `document.querySelector('.vp-doc .demo-block .tx-checkbox')?.getAttribute('aria-checked')`)
      return { ok: checkedBefore !== checkedAfter && checkedAfter === 'true', before, checkedBefore, checkedAfter }
    },
  },
  {
    name: 'radio-standard',
    page: 'radio',
    async run(client) {
      await clickElement(client, '.tx-radio', { text: 'Option B', scope: '.vp-doc .demo-block' })
      const details = await evaluate(client, `(() => {
        const items = Array.from(document.querySelectorAll('.vp-doc .demo-block .tx-radio')).map((el) => ({
          text: (el.innerText || '').trim().replace(/\\s+/g, ' '),
          checked: el.getAttribute('aria-checked'),
        }))
        return { checked: items }
      })()`)
      return {
        ok: details.checked.some(item => item.text === 'Option B' && item.checked === 'true'),
        ...details,
      }
    },
  },
  {
    name: 'flat-radio-basic',
    page: 'flat-radio',
    async run(client) {
      await clickElement(client, '.tx-flat-radio-item', { text: '任务', exact: true, scope: '.vp-doc .demo-block' })
      const details = await evaluate(client, `(() => {
        const root = document.querySelector('.vp-doc .demo-block .tx-flat-radio')
        const checked = Array.from(root?.querySelectorAll('.tx-flat-radio-item') || []).map((el) => ({
          text: (el.innerText || '').trim(),
          checked: el.getAttribute('aria-checked'),
        }))
        const preview = root?.closest('.demo-block')?.querySelector('.demo-block__preview')?.innerText || ''
        return { checked, preview }
      })()`)
      return {
        ok: details.checked.some(item => item.text === '任务' && item.checked === 'true') && details.preview.includes('当前：tasks'),
        ...details,
      }
    },
  },
  {
    name: 'switch-toggle',
    page: 'switch',
    async run(client) {
      const checkedBefore = await evaluate(client, `document.querySelector('.vp-doc .demo-block .tuff-switch')?.getAttribute('aria-checked')`)
      await clickElement(client, '.tuff-switch', { scope: '.vp-doc .demo-block', afterMs: 250 })
      const details = await evaluate(client, `(() => {
        const root = document.querySelector('.vp-doc .demo-block .tuff-switch')
        const preview = root?.closest('.demo-block')?.querySelector('.demo-block__preview')?.innerText || ''
        return {
          checked: root?.getAttribute('aria-checked') || '',
          preview,
        }
      })()`)
      return {
        ok: checkedBefore !== details.checked && details.checked === 'true' && details.preview.includes('On'),
        checkedBefore,
        ...details,
      }
    },
  },
  {
    name: 'textarea-input-count',
    page: 'textarea',
    async run(client) {
      await evaluate(client, `(() => {
        const field = document.querySelector('.vp-doc .demo-block .tx-textarea__field')
        field?.focus()
        field?.select()
      })()`)
      await delay(80)
      await client.send('Input.insertText', { text: 'Short smoke note' })
      await delay(150)
      const details = await evaluate(client, `(() => {
        const field = document.querySelector('.vp-doc .demo-block .tx-textarea__field')
        const count = document.querySelector('.vp-doc .demo-block .tx-textarea__count')?.innerText || ''
        return { value: field?.value || '', count }
      })()`)
      return { ok: details.value === 'Short smoke note', ...details }
    },
  },
  {
    name: 'number-input-step',
    page: 'number-input',
    async run(client) {
      await clickElement(client, '.tx-number-input__control', { text: '+', exact: true, scope: '.vp-doc .demo-block', afterMs: 250 })
      const details = await evaluate(client, `(() => {
        const input = document.querySelector('.vp-doc .demo-block .tx-number-input__field')
        return { value: input?.value || '' }
      })()`)
      return { ok: details.value === '4', ...details }
    },
  },
  {
    name: 'data-table-sort-select',
    page: 'data-table',
    async run(client) {
      await clickElement(client, '.tx-data-table__th.is-sortable', { text: 'Score', scope: '.vp-doc .demo-block', afterMs: 250 })
      const sortDetails = await evaluate(client, `(() => {
        const table = document.querySelector('.vp-doc .demo-block .tx-data-table')
        const header = table?.querySelector('.tx-data-table__th.is-sortable')
        const rows = Array.from(table?.querySelectorAll('tbody .tx-data-table__row') || [])
          .map(row => (row.innerText || '').trim().replace(/\\s+/g, ' '))
        return {
          ariaSort: header?.getAttribute('aria-sort') || '',
          firstRow: rows[0] || '',
        }
      })()`)
      await evaluate(client, `(() => {
        const blocks = Array.from(document.querySelectorAll('.vp-doc .demo-block'))
        const selectableBlock = blocks.find(block => block.innerText.includes('Selected:'))
        selectableBlock?.querySelector('.tx-checkbox')?.click()
      })()`)
      await delay(350)
      const selectDetails = await evaluate(client, `(() => {
        const blocks = Array.from(document.querySelectorAll('.vp-doc .demo-block'))
        const selectableBlock = blocks.find(block => block.innerText.includes('Selected:'))
        return { preview: selectableBlock?.innerText || '' }
      })()`)
      return {
        ok: sortDetails.ariaSort === 'ascending'
          && sortDetails.firstRow.includes('Noah')
          && selectDetails.preview.includes('Selected: [')
          && !selectDetails.preview.includes('Selected: []'),
        sortDetails,
        selectDetails,
      }
    },
  },
  {
    name: 'modal-open-close',
    page: 'modal',
    async run(client) {
      await clickElement(client, 'button', { text: 'Open Modal', exact: true, scope: '.vp-doc', afterMs: 350 })
      const opened = await evaluate(client, `Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))`)
      await pressKey(client, 'Escape')
      await delay(350)
      const closed = await evaluate(client, `!document.querySelector('[role="dialog"][aria-modal="true"]')`)
      return { ok: opened && closed, opened, closed }
    },
  },
  {
    name: 'tooltip-click-toggle',
    page: 'tooltip',
    async run(client) {
      await clickElement(client, 'button', { text: 'Click me', exact: true, scope: '.vp-doc', afterMs: 350 })
      const opened = await evaluate(client, `document.body.innerText.includes('Click to toggle, click outside to close') && Boolean(document.querySelector('.tx-base-anchor.is-open .tx-tooltip[role="tooltip"]'))`)
      await clickElement(client, 'body', { scope: 'document', afterMs: 350 })
      const closed = await evaluate(client, `!document.querySelector('.tx-base-anchor.is-open .tx-tooltip[role="tooltip"]')`)
      return { ok: opened && closed, opened, closed }
    },
  },
  {
    name: 'popover-click-toggle',
    page: 'popover',
    async run(client) {
      await clickElement(client, 'button', { text: 'Click', exact: true, scope: '.vp-doc .demo-block', afterMs: 350 })
      const opened = await evaluate(client, `document.body.innerText.includes('Windows-like floating panel.') && Boolean(document.querySelector('.tx-base-anchor.is-open .tx-popover__content'))`)
      await pressKey(client, 'Escape')
      await delay(350)
      const closed = await evaluate(client, `!document.querySelector('.tx-base-anchor.is-open .tx-popover__content')`)
      return { ok: opened && closed, opened, closed }
    },
  },
  {
    name: 'drawer-open-close',
    page: 'drawer',
    async run(client) {
      await clickElement(client, 'button', { text: '打开抽屉', exact: true, scope: '.vp-doc', afterMs: 350 })
      const opened = await evaluate(client, `document.querySelector('.tx-drawer')?.classList.contains('tx-drawer--visible') ?? false`)
      await pressKey(client, 'Escape')
      await delay(350)
      const closed = await evaluate(client, `(() => {
        const drawer = document.querySelector('.tx-drawer')
        return Boolean(drawer) && !drawer.classList.contains('tx-drawer--visible') && drawer.getAttribute('aria-hidden') === 'true'
      })()`)
      return { ok: opened && closed, opened, closed }
    },
  },
  {
    name: 'command-palette-filter-select',
    page: 'command-palette',
    async run(client) {
      await clickElement(client, 'button', { text: '打开命令面板', exact: true, scope: '.vp-doc', afterMs: 350 })
      const opened = await evaluate(client, `Boolean(document.querySelector('.tx-command-palette__overlay[role="dialog"]'))`)
      await evaluate(client, `document.querySelector('.tx-command-palette__input')?.focus()`)
      await client.send('Input.insertText', { text: 'note' })
      await delay(150)
      await clickElement(client, '.tx-command-palette__item', { text: '保存快速笔记', scope: 'document', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const open = Boolean(document.querySelector('.tx-command-palette__overlay'))
        const text = document.querySelector('.vp-doc .group')?.innerText || ''
        return { open, text }
      })()`)
      return {
        ok: opened && !details.open && details.text.includes('保存快速笔记'),
        opened,
        ...details,
      }
    },
  },
  {
    name: 'toast-show-dismiss',
    page: 'toast',
    async run(client) {
      await clickElement(client, 'button', { text: 'Show toast', exact: true, scope: '.vp-doc', afterMs: 350 })
      const shown = await evaluate(client, `document.body.innerText.includes('Saved') && document.body.innerText.includes('Your changes have been saved.')`)
      await clickElement(client, '.tx-toast__close', { scope: 'document', afterMs: 350 })
      const closed = await evaluate(client, `!document.body.innerText.includes('Your changes have been saved.')`)
      return { ok: shown && closed, shown, closed }
    },
  },
  {
    name: 'date-picker-open-confirm',
    page: 'date-picker',
    async run(client) {
      await clickElement(client, 'button', { text: 'Open date picker', exact: true, scope: '.vp-doc', afterMs: 450 })
      const opened = await evaluate(client, `Boolean(document.querySelector('.tx-picker-popup')) && document.body.innerText.includes('Date')`)
      await clickElement(client, '.tx-picker__btn.is-primary', { text: 'Confirm', exact: true, scope: 'document', afterMs: 450 })
      const details = await evaluate(client, `(() => {
        const open = Boolean(document.querySelector('.tx-picker-popup'))
        const text = document.querySelector('.vp-doc .demo-block')?.innerText || ''
        return { open, text }
      })()`)
      return {
        ok: opened && !details.open && details.text.includes('Value: 2026-01-02'),
        opened,
        ...details,
      }
    },
  },
  {
    name: 'cascader-single-select',
    page: 'cascader',
    async run(client) {
      await clickElement(client, '.tx-cascader', { text: 'Single', scope: '.vp-doc .demo-block', afterMs: 350 })
      const opened = await evaluate(client, `Boolean(document.querySelector('.tx-base-anchor.is-open .tx-cascader__panel'))`)
      await clickElement(client, '.tx-cascader__item', { text: 'Zhejiang', scope: 'document', afterMs: 250 })
      await clickElement(client, '.tx-cascader__item', { text: 'Hangzhou', scope: 'document', afterMs: 250 })
      await clickElement(client, '.tx-cascader__item', { text: 'West Lake', scope: 'document', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const block = document.querySelector('.vp-doc .demo-block')
        const text = block?.innerText || ''
        const triggerText = block?.querySelector('.tx-cascader__text')?.innerText.trim() || ''
        return {
          open: Boolean(document.querySelector('.tx-base-anchor.is-open .tx-cascader__panel')),
          triggerText,
          text,
        }
      })()`)
      return {
        ok: opened
          && !details.open
          && details.triggerText === 'Zhejiang / Hangzhou / West Lake'
          && details.text.includes('"zhejiang"')
          && details.text.includes('"hangzhou"')
          && details.text.includes('"xihu"'),
        opened,
        ...details,
      }
    },
  },
  {
    name: 'tree-select-single-select',
    page: 'tree-select',
    async run(client) {
      await clickElement(client, '.tx-tree-select', { text: 'Select one', scope: '.vp-doc .demo-block', afterMs: 350 })
      const opened = await evaluate(client, `Boolean(document.querySelector('.tx-base-anchor.is-open .tx-tree-select__panel'))`)
      await evaluate(client, `(() => {
        const caret = Array.from(document.querySelectorAll('.tx-tree-select__caret'))
          .find(item => item.closest('.tx-tree-select__item')?.innerText.includes('General'))
        caret?.click()
      })()`)
      await delay(250)
      await clickElement(client, '.tx-tree-select__item', { text: 'Appearance', scope: 'document', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const block = document.querySelector('.vp-doc .demo-block')
        return {
          open: Boolean(document.querySelector('.tx-base-anchor.is-open .tx-tree-select__panel')),
          triggerText: block?.querySelector('.tx-tree-select__text')?.innerText.trim() || '',
          text: block?.innerText || '',
        }
      })()`)
      return {
        ok: opened && !details.open && details.triggerText === 'Appearance' && details.text.includes('value: appearance'),
        opened,
        ...details,
      }
    },
  },
  {
    name: 'transfer-move-item',
    page: 'transfer',
    async run(client) {
      await evaluate(client, `(() => {
        const blocks = Array.from(document.querySelectorAll('.vp-doc .demo-block'))
        const block = blocks.find(item => item.innerText.includes('已启用：'))
        const row = Array.from(block?.querySelectorAll('.tx-transfer__item') || [])
          .find(item => (item.innerText || '').includes('发布管理'))
        row?.querySelector('.tx-checkbox')?.click()
      })()`)
      await delay(200)
      await clickElement(client, 'button', { text: '', scope: '.vp-doc .demo-block .tx-transfer__actions', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const blocks = Array.from(document.querySelectorAll('.vp-doc .demo-block'))
        const block = blocks.find(item => item.innerText.includes('已启用：'))
        const text = block?.innerText || ''
        const rightPanel = Array.from(block?.querySelectorAll('.tx-transfer__panel') || [])[1]
        const rightText = rightPanel?.innerText || ''
        return { text, rightText }
      })()`)
      return {
        ok: details.text.includes('已启用：docs, release') && details.rightText.includes('发布管理'),
        ...details,
      }
    },
  },
  {
    name: 'slider-keyboard-update',
    page: 'slider',
    async run(client) {
      await clickElement(client, '.tx-slider__input', { scope: '.vp-doc .demo-block', afterMs: 100 })
      await pressKey(client, 'ArrowRight')
      await delay(250)
      const details = await evaluate(client, `(() => {
        const block = document.querySelector('.vp-doc .demo-block')
        const input = block?.querySelector('.tx-slider__input')
        const text = block?.innerText || ''
        return { value: input?.value || '', text }
      })()`)
      return { ok: details.value === '51' && details.text.includes('Value: 51'), ...details }
    },
  },
  {
    name: 'virtual-list-scroll',
    page: 'virtual-list',
    async run(client) {
      await evaluate(client, `(() => {
        const list = document.querySelector('.vp-doc .demo-block .tx-virtual-list')
        if (list) {
          list.scrollTop = 1800
          list.dispatchEvent(new Event('scroll', { bubbles: true }))
        }
      })()`)
      await delay(250)
      const details = await evaluate(client, `(() => {
        const list = document.querySelector('.vp-doc .demo-block .tx-virtual-list')
        const text = list?.innerText || ''
        return {
          scrollTop: list?.scrollTop || 0,
          text,
          renderedItems: list?.querySelectorAll('.tx-virtual-list__item').length || 0,
        }
      })()`)
      return {
        ok: details.scrollTop >= 1700 && details.text.includes('Item 50') && details.renderedItems < 40,
        ...details,
      }
    },
  },
  {
    name: 'file-uploader-drop-remove',
    page: 'file-uploader',
    async run(client) {
      const details = await evaluate(client, `(async () => {
        const root = document.querySelector('.vp-doc .demo-block .tx-file-uploader')
        const file = new File(['smoke'], 'audit-smoke.txt', { type: 'text/plain' })
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(file)
        const dropTarget = root?.querySelector('.tx-file-uploader__drop')
        dropTarget?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
        dropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const afterDropText = root?.innerText || ''
        root?.querySelector('.tx-file-uploader__remove')?.click()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const afterRemoveText = root?.innerText || ''
        const blockText = root?.closest('.demo-block')?.innerText || ''
        return { afterDropText, afterRemoveText, blockText }
      })()`)
      return {
        ok: details.afterDropText.includes('audit-smoke.txt')
          && !details.afterRemoveText.includes('audit-smoke.txt')
          && details.blockText.includes('0 file(s) selected'),
        ...details,
      }
    },
  },
  {
    name: 'image-uploader-input-remove',
    page: 'image-uploader',
    async run(client) {
      const details = await evaluate(client, `(async () => {
        const root = document.querySelector('.vp-doc .demo-block .tx-image-uploader')
        const input = root?.querySelector('input[type="file"]')
        const file = new File(['smoke'], 'audit-smoke.png', { type: 'image/png' })
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(file)
        if (input) {
          Object.defineProperty(input, 'files', { configurable: true, value: dataTransfer.files })
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const afterInput = root?.closest('.demo-block')?.innerText || ''
        root?.querySelector('.tx-image-uploader__remove')?.click()
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const afterRemove = root?.closest('.demo-block')?.innerText || ''
        return {
          itemCount: root?.querySelectorAll('.tx-image-uploader__item').length || 0,
          afterInput,
          afterRemove,
        }
      })()`)
      return {
        ok: details.afterInput.includes('Selected: 1 file(s)') && details.afterRemove.includes('Selected: 0 file(s)'),
        ...details,
      }
    },
  },
  {
    name: 'copy-button',
    page: 'copy-button',
    async prepare(client) {
      await client.send('Browser.grantPermissions', {
        origin: docsBaseUrl,
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
      }).catch(() => undefined)
      await evaluate(client, `navigator.clipboard?.writeText?.('')`).catch(() => undefined)
    },
    async run(client) {
      await clickElement(client, '.tx-copy-button:not(:disabled)', { scope: '.vp-doc .demo-block', afterMs: 350 })
      const details = await evaluate(client, `(async () => {
        const button = document.querySelector('.vp-doc .demo-block .tx-copy-button:not(:disabled)')
        let copiedText = ''
        try {
          copiedText = await navigator.clipboard.readText()
        }
        catch (error) {
          copiedText = 'READ_FAILED'
        }
        const text = button?.innerText.trim() || ''
        const label = button?.getAttribute('aria-label') || ''
        return { text, label, copiedText }
      })()`)
      return {
        ok: (details.text.includes('Copied') || details.label === 'Copied')
          && (details.copiedText === 'pnpm add @talex-touch/tuffex' || details.copiedText === 'READ_FAILED'),
        ...details,
      }
    },
  },
  {
    name: 'chat-composer-send',
    page: 'chat-composer',
    async run(client) {
      await typeIntoElement(client, '.tx-chat-composer textarea', 'Hello from smoke', { scope: '.vp-doc' })
      await clickElement(client, '.tx-chat-composer__actions-right button:not(:disabled)', { scope: '.vp-doc', afterMs: 350 })
      const details = await evaluate(client, `(() => {
        const textarea = document.querySelector('.vp-doc .tx-chat-composer textarea')
        const preview = document.querySelector('.vp-doc .demo-block .demo-block__preview')?.innerText || ''
        return { textarea: textarea?.value || '', preview }
      })()`)
      return { ok: details.textarea === '' && details.preview.includes('Hello from smoke'), ...details }
    },
  },
  {
    name: 'tabs-switch',
    page: 'tabs',
    async run(client) {
      const before = await evaluate(client, `(() => {
        const root = document.querySelector('.vp-doc .demo-block .tx-tabs')
        return {
          active: root?.querySelector('.tx-tab-item.is-active')?.innerText.trim() || '',
          content: root?.querySelector('.tx-tabs__main')?.innerText.trim() || '',
        }
      })()`)
      await clickElement(client, '.tx-tab-item', { text: 'Account', exact: true, scope: '.vp-doc .demo-block', afterMs: 450 })
      const after = await evaluate(client, `(() => {
        const root = document.querySelector('.vp-doc .demo-block .tx-tabs')
        return {
          active: root?.querySelector('.tx-tab-item.is-active')?.innerText.trim() || '',
          content: root?.querySelector('.tx-tabs__main')?.innerText.trim() || '',
        }
      })()`)
      return {
        ok: after.active === 'Account' && after.content.includes('Account settings content'),
        before,
        after,
      }
    },
  },
]

async function runTest(test) {
  const url = `${docsBaseUrl}/components/${test.page}.html`
  const target = await createTarget('about:blank')
  const client = createClient(target.webSocketDebuggerUrl)
  const { consoleMessages, pageErrors, badResponses } = collectPageEvents(client)

  try {
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await client.send('Network.enable')
    await client.send('Network.setCacheDisabled', { cacheDisabled: true })
    await setViewport(client, {
      width: 1280,
      height: 900,
      mobile: false,
    })
    await client.send('Page.navigate', { url })
    await waitForPage(client)
    await test.prepare?.(client)

    let details
    let status = 'PASS'
    const failures = []

    try {
      details = await test.run(client)
      if (!details.ok) {
        status = 'FAIL'
        failures.push('interaction assertion failed')
      }
    }
    catch (error) {
      status = 'FAIL'
      details = { ok: false, error: error.message || String(error) }
      failures.push(details.error)
    }

    const screenshotPath = await screenshot(client, test.name, screenshotDir)

    return {
      name: test.name,
      page: test.page,
      url,
      status,
      failures,
      details,
      screenshot: screenshotPath,
      console: consoleMessages,
      pageErrors,
      badResponses,
    }
  }
  finally {
    client.close()
    await closeTarget(target.id)
  }
}

await mkdir(screenshotDir, { recursive: true })

const results = []
for (const test of tests) {
  const result = await runTest(test)
  results.push(result)
  const suffix = result.status === 'PASS' ? '' : ` ${result.failures.join('; ')}`
  console.log(`${result.status} ${result.name}${suffix}`)
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: docsBaseUrl,
  cdpUrl: cdpBaseUrl,
  total: results.length,
  passed: results.filter(result => result.status === 'PASS').length,
  failed: results.filter(result => result.status === 'FAIL').length,
  results,
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Report: ${reportPath}`)

if (report.failed > 0)
  process.exitCode = 1
