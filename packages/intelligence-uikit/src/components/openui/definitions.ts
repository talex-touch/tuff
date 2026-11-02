import { action, createLibrary, defineAction, defineComponent, markReactive } from '@openuidev/lang-core'
import { z } from 'zod/v4'
import { listFunctions } from './functions/lists'
import { numberFunctions } from './functions/numbers'
import { textFunctions } from './functions/text'

const s = () => z.string().optional()
const n = () => z.number().optional()
const b = () => z.boolean().optional()
const children = z.array(z.any())
const length = z.union([z.number(), z.string()]).optional()
const options = z.array(z.union([z.string(), z.object({ value: z.string(), label: z.string() })]))

function binding<T extends z.ZodType>(schema: T): T {
  markReactive(schema)
  return schema
}

/** Framework-neutral component metadata shared by the renderer and main-process prompt. */
export interface OpenUIComponentDefinition {
  name: string
  props: z.ZodObject<z.ZodRawShape>
  description: string
}

function component<T extends z.ZodRawShape>(
  name: string,
  shape: T,
  description: string
): OpenUIComponentDefinition {
  return { name, props: z.object(shape), description }
}

export const openUIComponentDefinitions = [
  component('Col', { children, gap: n(), align: s() }, 'Vertical article layout; gaps count 4px steps.'),
  component('Row', { children, gap: n(), align: s(), justify: s(), wrap: b() }, 'Horizontal layout.'),
  component('Box', { children: children.optional(), direction: s(), gap: n(), padding: n(), background: s(), radius: length, border: b(), width: length, height: length, flex: n(), align: s(), justify: s(), wrap: b() }, 'Flex container, column by default.'),
  component('Grid', { children, columns: n(), minChildWidth: n(), gap: n() }, 'Responsive equal columns.'),
  component('Card', { children, variant: s(), padding: n(), gap: n() }, 'Compact outline or soft panel.'),
  component('Carousel', { children, itemWidth: n() }, 'Horizontally scrollable cards, keyboard accessible.'),
  component('Divider', {}, 'Section separator.'),
  component('Spacer', {}, 'Fills free space in a row.'),
  component('Title', { text: z.string(), size: s(), color: s() }, 'Heading: sm, md, lg, xl, 2xl or 3xl.'),
  component('Text', { text: z.union([z.string(), children]), size: s(), color: s(), weight: s(), italic: b(), lineThrough: b(), tabularNums: b(), maxLines: n() }, 'Paragraph, optionally mixing strings and inline components.'),
  component('Caption', { text: z.string(), color: s() }, 'Secondary text.'),
  component('Label', { text: z.string() }, 'Field or group label.'),
  component('Badge', { text: z.string(), color: s(), icon: s() }, 'Small status pill.'),
  component('Link', { text: z.string(), url: z.string() }, 'HTTP(S) link, emitted to host as open_url.'),
  component('ListItem', { title: z.string(), description: s(), marker: s(), children: children.optional() }, 'List item with optional description and custom marker.'),
  component('List', { items: z.array(z.any()), marker: s(), timeline: b() }, 'Bullet, number or unmarked list.'),
  component('Markdown', { text: z.string() }, 'Sanitized Markdown prose.'),
  component('Quote', { text: z.string(), attribution: s() }, 'Quotation with attribution.'),
  component('Code', { code: z.string(), language: s() }, 'Literal code block.'),
  component('Button', { label: z.string(), action: action().optional(), variant: s(), color: s(), size: s(), icon: s(), disabled: b(), block: b() }, 'Action button; no action sends its label to assistant.'),
  component('IconButton', { icon: z.string(), action: action().optional(), label: s(), variant: s() }, 'Accessible icon action button.'),
  component('Input', { value: binding(z.union([z.string(), z.number()])), label: s(), type: s(), placeholder: s() }, 'Text/number input; first argument is usually a $variable.'),
  component('TextArea', { value: binding(z.string()), label: s(), placeholder: s(), rows: n() }, 'Multiline input.'),
  component('Select', { value: binding(z.string()), options, label: s(), placeholder: s() }, 'Dropdown selection.'),
  component('SegmentedControl', { value: binding(z.string()), options, block: b() }, 'Short choices in a row.'),
  component('Slider', { value: binding(z.number()), min: n(), max: n(), step: n(), label: s(), showValue: b() }, 'Numeric range input.'),
  component('Checkbox', { checked: binding(z.boolean()), label: s() }, 'Boolean input.'),
  component('RadioGroup', { value: binding(z.string()), options, label: s(), variant: s() }, 'Exclusive choices.'),
  component('Form', { children }, 'Fields grouped together; values accompany @ToAssistant.'),
  component('Image', { src: z.string(), alt: z.string(), aspectRatio: n(), radius: length, fit: s() }, 'HTTP(S) image from a supplied URL.'),
  component('SearchImage', { query: z.string(), aspectRatio: n(), radius: length, fit: s() }, 'Image resolved by the host resolveImage callback; omit if no resolver available.'),
  component('Icon', { name: z.string(), size: s(), color: s() }, 'Lucide icon by kebab-case or PascalCase name, e.g. map-pin or MapPin.'),
  component('Table', { columns: z.array(z.string()), rows: z.array(z.array(z.any())) }, 'Accessible table; cells can be components.'),
  component('Chart', { type: z.enum(['bar', 'line', 'area', 'pie']), data: z.array(z.record(z.string(), z.any())), x: z.string(), series: z.array(z.string()), format: s(), currency: s(), stacked: b(), height: n() }, 'ECharts chart of named series by x; format number, currency or percent.'),
]

export const openUIComponentGroups = [
  { name: 'Layout', components: ['Col', 'Row', 'Box', 'Grid', 'Card', 'Carousel', 'Divider', 'Spacer'] },
  { name: 'Text', components: ['Title', 'Text', 'Caption', 'Label', 'Badge', 'Link', 'List', 'ListItem', 'Markdown', 'Quote', 'Code'] },
  { name: 'Inputs', components: ['Button', 'IconButton', 'Input', 'TextArea', 'Select', 'SegmentedControl', 'Slider', 'Checkbox', 'RadioGroup', 'Form'] },
  { name: 'Media and data', components: ['Image', 'SearchImage', 'Icon', 'Table', 'Chart'] },
]

const copy = defineAction({ name: 'CopyToClipboard', description: 'Host copies text to clipboard.', params: z.object({ text: z.string() }) })
export const openUIActionDefinitions = [copy]

/** Build the OpenUI library with an optional framework renderer. */
export function createOpenUILibrary<C>(renderer: C) {
  const components = openUIComponentDefinitions.map(definition => defineComponent({ ...definition, component: renderer }))
  return createLibrary({
    root: 'Col',
    components,
    functions: [...listFunctions, ...numberFunctions, ...textFunctions],
    actions: openUIActionDefinitions,
    componentGroups: openUIComponentGroups,
  })
}
