<script setup lang="ts">
import type { MotionFormLabels, MotionFormStatus, MotionFormValue, MotionFormVariant } from '@talex-touch/tuffex/motion-form'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxInput } from '@talex-touch/tuffex/input'
import { MOTION_FORM_VARIANTS, TxMotionForm } from '@talex-touch/tuffex/motion-form'
import { TxSelect } from '@talex-touch/tuffex/select'
import { computed, onBeforeUnmount, reactive, ref, useId } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const filter = ref('all')
const disabled = ref(false)
const motion = ref(true)
const id = useId()
const values = reactive<Record<MotionFormVariant, MotionFormValue>>({
  'floating-label-input': '',
  'input-focus-glow': '',
  'password-toggle': 'correct-horse-battery',
  'search-expand': '',
  'checkbox-draw': false,
  'radio-scale': 'vue',
  'error-shake': '',
  'success-check': '',
  'select-dropdown': 'vue',
  'multi-select-chips': ['vue', 'typescript'],
  'textarea-auto-grow': '',
  'otp-input': '',
  'file-upload-dropzone': [],
  'range-slider': 65,
  'form-submit-button': '',
})
const statuses = reactive<Partial<Record<MotionFormVariant, MotionFormStatus>>>({})
const errors = reactive<Partial<Record<MotionFormVariant, string>>>({})
const validationKeys = reactive<Partial<Record<MotionFormVariant, number>>>({})
const completedCode = ref('')
const selectedFiles = ref<string[]>([])
const digest = ref('')
let disposed = false
onBeforeUnmount(() => { disposed = true })

const copy = computed(() => zh.value
  ? {
      all: '全部 15 个效果', filter: '按效果筛选', disabled: '禁用所有控件', motion: '启用动效',
      hint: '每个控件都有自己的真实模型。聚焦、输入、使用键盘选择、粘贴验证码，或从设备拖入文件。文件仅被选中，不会上传。',
      model: '当前模型', characters: '个字符（不显示密码）', text: '待计算文本',
      submitted: '本地 SHA-256 结果（不是服务端提交）', emptySubmit: '请输入文本后再计算。',
      cryptoError: '当前环境不能使用 Web Crypto，无法完成计算。',
      validationError: '请输入有效邮箱；错误不会被定时清除。',
      validationSuccessError: '请输入至少 3 个字符后再校验。',
      otpComplete: '四位输入完成', filesSelected: '本次选择的文件',
      placeholder: '输入内容…', textarea: '输入多行内容，观察自动增长；达到 8 行后可以滚动。',
      radio: [{ value: 'vue', label: 'Vue' }, { value: 'react', label: 'React' }, { value: 'svelte', label: 'Svelte' }],
      options: [{ value: 'vue', label: 'Vue' }, { value: 'typescript', label: 'TypeScript' }, { value: 'motion', label: '动效' }, { value: 'a11y', label: '无障碍' }],
    }
  : {
      all: 'All 15 effects', filter: 'Filter effects', disabled: 'Disable all controls', motion: 'Enable motion',
      hint: 'Each control has a real model. Focus, type, select with the keyboard, paste a code, or drop files from your device. Files are selected, never uploaded.',
      model: 'Current model', characters: 'characters (password not displayed)', text: 'Text to calculate',
      submitted: 'Local SHA-256 result (not a server submission)', emptySubmit: 'Enter text before calculating.',
      cryptoError: 'Web Crypto is unavailable in this environment; the calculation cannot complete.',
      validationError: 'Enter a valid email. Errors are never cleared by a timer.',
      validationSuccessError: 'Enter at least 3 characters before validating.',
      otpComplete: 'Four digits completed', filesSelected: 'Files selected in this action',
      placeholder: 'Enter a value…', textarea: 'Enter multiple lines to grow the field; after 8 rows the field scrolls.',
      radio: [{ value: 'vue', label: 'Vue' }, { value: 'react', label: 'React' }, { value: 'svelte', label: 'Svelte' }],
      options: [{ value: 'vue', label: 'Vue' }, { value: 'typescript', label: 'TypeScript' }, { value: 'motion', label: 'Motion' }, { value: 'a11y', label: 'Accessibility' }],
    })
const labels = computed<Partial<MotionFormLabels>>(() => zh.value
  ? {
      field: '字段', showPassword: '显示密码', hidePassword: '隐藏密码', capsLock: '大写锁定已开启',
      validate: '校验', validating: '校验中…', verified: '已通过校验', validationError: '校验失败',
      submit: '计算 SHA-256', submitting: '计算中…', submitted: '计算完成', submitError: '计算失败',
      chooseFiles: '选择文件', dropFiles: '拖入文件', fileHint: '或点击浏览；接受图片或 .txt 文件，最多 3 个',
      searchOptions: '添加一个选项', noOptions: '没有可用选项',
      otpDigit: index => `第 ${index} 位，共 4 位`, removeOption: label => `移除 ${label}`, removeFile: name => `移除 ${name}`,
    }
  : {
      submit: 'Calculate SHA-256', submitting: 'Calculating…', submitted: 'Calculated', submitError: 'Calculation failed',
      fileHint: 'or browse; images or .txt files, up to 3 files', searchOptions: 'Add an option',
    })
const scenarios = computed(() => {
  const titles = zh.value
    ? ['浮动标签', '聚焦光晕', '密码显示切换', '搜索展开', '复选路径绘制', '单选弹簧缩放', '校验错误震动', '成功勾选绘制', '下拉展开', '多选标签', '文本域自动增长', '四位验证码', '文件拖放选择', '弹簧范围滑块', '提交状态变形']
    : ['Floating label', 'Focus glow', 'Password reveal', 'Expanding search', 'Checkbox path draw', 'Radio spring scale', 'Validation error shake', 'Success check draw', 'Select dropdown', 'Multi-select chips', 'Auto-growing textarea', 'Four-digit OTP', 'File drop selection', 'Spring range slider', 'Submit state morph']
  const hints = zh.value
    ? ['聚焦或输入后，标签向上移动并缩小。', '聚焦后光晕扩大，失焦后收回。', '用眼睛按钮切换，不会修改密码模型。', '聚焦后从 160px 扩展到 240px。', '按空格或点击，勾选路径绘出。', '使用方向键选择，中心圆点弹簧缩放。', '输入邮箱再点校验；重复失败会重播震动。', '输入至少 3 个字符再点校验，真实校验通过才绘出勾选。', '用方向键、Enter 与 Escape 操作现有 Select。', '用 Select 添加选项；按标签上的移除按钮删除。', '内容决定高度，不按定时器或固定行数伪增长。', '输入或粘贴四位数字；方向键、Home、End、Backspace、Delete 可用。', '从本机选择或拖入文件；接收类型与数量由 FileUploader 处理。', '拖动滑块或用方向键修改；悬停展示实际值提示。', '状态由真实 Web Crypto 计算结果驱动，不访问服务器、不延时造成功。']
    : ['Focus or type to lift and shrink the label.', 'Focus expands the halo; blur retracts it.', 'Use the eye button without changing the password model.', 'Focus grows the search field from 160px to 240px.', 'Click or press Space to draw the checked path.', 'Arrow keys select; the inner dot scales on a spring.', 'Enter an email, then validate; another failure replays the shake.', 'Enter at least 3 characters and validate; only a valid result draws the check.', 'Use Arrow keys, Enter and Escape on the existing Select.', 'Add through Select; remove with each chip’s button.', 'Content determines height, not a timer or a simulated row count.', 'Type or paste four digits; Arrow keys, Home, End, Backspace and Delete work.', 'Choose or drop local files; FileUploader enforces accepted types and count.', 'Drag or use Arrow keys; hover shows the actual value tooltip.', 'A real Web Crypto calculation controls state. No server request or delayed fake success.']
  return MOTION_FORM_VARIANTS.map((variant, index) => ({ variant, title: titles[index] ?? variant, hint: hints[index] ?? '', source: `frm${index + 1}` }))
})
const visibleScenarios = computed(() => scenarios.value.filter(item => filter.value === 'all' || item.variant === filter.value))
const filterOptions = computed(() => [{ value: 'all', label: copy.value.all }, ...scenarios.value.map(item => ({ value: item.variant, label: item.title }))])

function change(variant: MotionFormVariant, value: MotionFormValue): void {
  values[variant] = value
  statuses[variant] = 'default'
  errors[variant] = ''
  if (variant === 'form-submit-button')
    digest.value = ''
}
function validate(variant: MotionFormVariant, value: MotionFormValue): void {
  const text = String(value)
  const valid = variant === 'error-shake' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) : text.trim().length >= 3
  statuses[variant] = valid ? 'success' : 'error'
  errors[variant] = valid ? '' : variant === 'error-shake' ? copy.value.validationError : copy.value.validationSuccessError
  validationKeys[variant] = (validationKeys[variant] ?? 0) + 1
}
async function calculate(value: MotionFormValue | undefined): Promise<void> {
  const variant = 'form-submit-button'
  if (disabled.value || statuses[variant] === 'loading')
    return
  const text = String(value ?? '')
  if (!text.trim()) {
    statuses[variant] = 'error'
    errors[variant] = copy.value.emptySubmit
    return
  }
  statuses[variant] = 'loading'
  errors[variant] = ''
  digest.value = ''
  try {
    if (!globalThis.crypto?.subtle)
      throw new Error(copy.value.cryptoError)
    const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    if (disposed)
      return
    digest.value = Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('')
    statuses[variant] = 'success'
  }
  catch (error) {
    if (disposed)
      return
    statuses[variant] = 'error'
    errors[variant] = error instanceof Error ? error.message : copy.value.cryptoError
  }
}
function state(variant: MotionFormVariant): string {
  const value = values[variant]
  if (variant === 'password-toggle')
    return `${String(value).length} ${copy.value.characters}`
  if (variant === 'file-upload-dropzone' && Array.isArray(value))
    return JSON.stringify(value.map(item => typeof item === 'object' ? item.name : item))
  return JSON.stringify(value)
}
</script>

<template>
  <div class="motion-form-demo not-prose">
    <div class="motion-form-demo__toolbar">
      <div class="motion-form-demo__filter">
        <label :id="`${id}-filter`">{{ copy.filter }}</label>
        <TxSelect :model-value="filter" :options="filterOptions" :aria-labelledby="`${id}-filter`" panel-background="pure" @update:model-value="value => filter = String(value)" />
      </div>
      <TxCheckbox v-model="disabled" :label="copy.disabled" />
      <TxCheckbox v-model="motion" :label="copy.motion" />
    </div>
    <p class="motion-form-demo__hint">
{{ copy.hint }}
</p>
    <div class="motion-form-demo__scenarios">
      <section v-for="item in visibleScenarios" :key="item.variant" class="motion-form-demo__scenario" :aria-labelledby="`${id}-${item.variant}`">
        <div class="motion-form-demo__intro">
          <h3 :id="`${id}-${item.variant}`">
{{ item.title }}
</h3>
          <code>{{ item.source }} · {{ item.variant }}</code>
          <p>{{ item.hint }}</p>
        </div>
        <div class="motion-form-demo__stage">
          <label v-if="item.variant === 'form-submit-button'" class="motion-form-demo__text">
            <span>{{ copy.text }}</span>
            <TxInput :model-value="String(values['form-submit-button'])" :disabled="disabled || statuses['form-submit-button'] === 'loading'" @update:model-value="value => change('form-submit-button', value)" />
          </label>
          <TxMotionForm
            :variant="item.variant"
            :model-value="values[item.variant]"
            :label="item.title"
            :labels="labels"
            :placeholder="item.variant === 'textarea-auto-grow' ? copy.textarea : copy.placeholder"
            :options="item.variant === 'radio-scale' ? copy.radio : copy.options"
            :status="statuses[item.variant] ?? 'default'"
            :error="errors[item.variant] ?? ''"
            :validation-key="validationKeys[item.variant]"
            :disabled="disabled"
            :motion="motion"
            accept="image/*,.txt"
            :max-files="3"
            :step="5"
            @update:model-value="value => change(item.variant, value)"
            @validate="value => validate(item.variant, value)"
            @submit="calculate"
            @otp-complete="value => completedCode = value"
            @files-selected="files => selectedFiles = files.map(file => file.name)"
          />
          <div class="motion-form-demo__model">
<span>{{ copy.model }}</span><output>{{ state(item.variant) }}</output>
</div>
          <p v-if="item.variant === 'otp-input' && completedCode" role="status">
{{ copy.otpComplete }}: {{ completedCode }}
</p>
          <p v-if="item.variant === 'file-upload-dropzone' && selectedFiles.length" role="status">
{{ copy.filesSelected }}: {{ selectedFiles.join(', ') }}
</p>
          <div v-if="item.variant === 'form-submit-button' && digest" class="motion-form-demo__result" role="status">
<span>{{ copy.submitted }}</span><output>{{ digest }}</output>
</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.motion-form-demo { display: flex; flex-direction: column; gap: 18px; width: 100%; color: var(--tx-text-color-primary, #303133); font-size: 14px; }
.motion-form-demo__toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.motion-form-demo__filter { width: min(100%, 260px); display: flex; flex-direction: column; gap: 6px; }
.motion-form-demo__filter label, .motion-form-demo__text span { font-size: 13px; font-weight: 500; }
.motion-form-demo__hint, .motion-form-demo__intro p { margin: 0; line-height: 1.6; font-size: 13px; color: var(--tx-text-color-regular, #606266); }
.motion-form-demo__scenarios { display: flex; flex-direction: column; gap: 24px; }
.motion-form-demo__scenario { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; padding-top: 18px; border-top: 1px solid var(--tx-border-color-light, #e4e7ed); }
.motion-form-demo__intro { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.motion-form-demo__intro h3 { margin: 0; font-size: 14px; font-weight: 600; }
.motion-form-demo__intro code { font-size: 12px; color: var(--tx-text-color-regular, #606266); overflow-wrap: anywhere; }
.motion-form-demo__stage { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.motion-form-demo__stage p { margin: 0; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.motion-form-demo__text { display: flex; flex-direction: column; gap: 6px; }
.motion-form-demo__model, .motion-form-demo__result { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 1.6; color: var(--tx-text-color-regular, #606266); }
.motion-form-demo output { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 640px) { .motion-form-demo__scenario { grid-template-columns: minmax(0, 1fr); gap: 12px; } }
</style>
