# Timeline

A vertical or horizontal sequence of events displayed in chronological order. Each item in the timeline marks a distinct point in time — a step completed, an event occurred, or a status changed.

<script setup lang="ts">
</script>

## Basic Usage

Place `TxTimelineItem` components inside a `TxTimeline` container. Each item can have a `title`, `time`, and content in the default slot.

<DemoBlock title="Vertical Timeline">
<template #preview>
<div style="max-width: 480px;">
  <TxTimeline>
    <TxTimelineItem title="Project created" time="Jan 15, 2025" color="primary">
      Initial repository setup and architecture planning.
    </TxTimelineItem>
    <TxTimelineItem title="Alpha release" time="Feb 20, 2025" color="success">
      First internal release with core components.
    </TxTimelineItem>
    <TxTimelineItem title="Beta testing" time="Mar 10, 2025" color="warning" active>
      Open beta with community feedback collection.
    </TxTimelineItem>
    <TxTimelineItem title="Stable release" time="TBD" color="default">
      Production-ready release with full documentation.
    </TxTimelineItem>
  </TxTimeline>
</div>
</template>

<template #code>

```vue
<template>
  <TxTimeline>
    <TxTimelineItem title="Project created" time="Jan 2025" color="primary">
      Initial setup and architecture.
    </TxTimelineItem>
    <TxTimelineItem title="Beta testing" time="Mar 2025" color="warning" active>
      Community feedback phase.
    </TxTimelineItem>
  </TxTimeline>
</template>
```

</template>
</DemoBlock>

## Design Notes

- Use the `active` prop to highlight the current step in a process.
- The `color` prop maps to semantic colors: `primary`, `success`, `warning`, `error`, and `default`.
- For process flows with defined steps, consider using [Steps](/components/steps) instead.

## API

### TxTimeline Props

<ApiSpecTable :rows="[
  { name: 'layout', description: 'The orientation of the timeline.', type: '\"vertical\" | \"horizontal\"', default: '\"vertical\"' },
]" />

### TxTimelineItem Props

<ApiSpecTable :rows="[
  { name: 'title', description: 'The event title.', type: 'string' },
  { name: 'time', description: 'Timestamp or date label.', type: 'string' },
  { name: 'icon', description: 'Custom icon class for the timeline dot.', type: 'string' },
  { name: 'color', description: 'Semantic color for the dot and line.', type: '\"default\" | \"primary\" | \"success\" | \"warning\" | \"error\"', default: '\"default\"' },
  { name: 'active', description: 'Highlights this item as the current step.', type: 'boolean', default: 'false' },
]" />

### TxTimelineItem Slots

<ApiSpecTable title="Slots" :rows="[
  { name: 'default', description: 'The event description content.' },
]" />
