export type ReactComponentTier = 'A' | 'B' | 'C'
export type ReactComponentStatus = 'ready'

export interface ReactComponentManifestEntry {
  id: string
  exports: readonly string[]
  status: ReactComponentStatus
  tier: ReactComponentTier
  sampleTsx: string
}

/**
 * Locked 32-component Phase-1 manifest for `@talex-touch/tuffex-react`.
 * Matches `tuffex-core/compat`, `tuffex-wc`, and `apps/nexus`.
 */
export const REACT_COMPONENTS_MANIFEST: Readonly<Record<string, ReactComponentManifestEntry>> = {
  // Tier A (18)
  'button': {
    id: 'button',
    exports: ['TxButton'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxButton variant="primary">Save changes</TxButton>`,
  },
  'badge': {
    id: 'badge',
    exports: ['TxBadge'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxBadge variant="primary" value={12} />`,
  },
  'tag': {
    id: 'tag',
    exports: ['TxTag'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxTag label="Release" variant="soft" closable />`,
  },
  'avatar': {
    id: 'avatar',
    exports: ['TxAvatar'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxAvatar name="Talex Dream" status="online" size="medium" />`,
  },
  'spinner': {
    id: 'spinner',
    exports: ['TxSpinner'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxSpinner size={20} label="Loading data" />`,
  },
  'divider': {
    id: 'divider',
    exports: ['TxDivider'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxDivider>Section</TxDivider>`,
  },
  'alert': {
    id: 'alert',
    exports: ['TxAlert'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxAlert type="success" title="Saved" message="Configuration updated." />`,
  },
  'card': {
    id: 'card',
    exports: ['TxCard'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxCard header="Overview" shadow="soft">Card content</TxCard>`,
  },
  'kbd': {
    id: 'kbd',
    exports: ['TxKbd'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxKbd tone="primary">⌘K</TxKbd>`,
  },
  'progress': {
    id: 'progress',
    exports: ['TxProgress'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxProgress percentage={68} showText />`,
  },
  'progress-bar': {
    id: 'progress-bar',
    exports: ['TxProgressBar'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxProgressBar percentage={75} showText textPlacement="top" detail="1.5 MB / 2 MB" />`,
  },
  'skeleton': {
    id: 'skeleton',
    exports: ['TxSkeleton'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxSkeleton lines={3} height={14} />`,
  },
  'switch': {
    id: 'switch',
    exports: ['TxSwitch'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxSwitch defaultChecked label="Auto sync" />`,
  },
  'status-badge': {
    id: 'status-badge',
    exports: ['TxStatusBadge'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxStatusBadge text="Connected" status="success" />`,
  },
  'status-hint': {
    id: 'status-hint',
    exports: ['TxStatusHint'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxStatusHint text="Copied to clipboard" tone="success" />`,
  },
  'dot-indicator': {
    id: 'dot-indicator',
    exports: ['TxDotIndicator'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxDotIndicator color="var(--tx-color-success)" label="Healthy" />`,
  },
  'empty': {
    id: 'empty',
    exports: ['TxEmpty'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxEmpty title="No items yet" description="Create your first entry to begin." />`,
  },
  'stat-card': {
    id: 'stat-card',
    exports: ['TxStatCard'],
    status: 'ready',
    tier: 'A',
    sampleTsx: `<TxStatCard value={12840} label="Active users" insight={{ from: 10200, to: 12840 }} />`,
  },

  // Tier B (12)
  'input': {
    id: 'input',
    exports: ['TxInput'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxInput placeholder="Search workspace..." clearable />`,
  },
  'textarea': {
    id: 'textarea',
    exports: ['TxTextarea'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxTextarea placeholder="Write notes..." rows={4} showCount maxLength={200} />`,
  },
  'checkbox': {
    id: 'checkbox',
    exports: ['TxCheckbox'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxCheckbox defaultChecked label="Enable telemetry" />`,
  },
  'radio': {
    id: 'radio',
    exports: ['TxRadio', 'TxRadioGroup'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxRadioGroup defaultValue="vue"><TxRadio value="vue">Vue</TxRadio><TxRadio value="react">React</TxRadio></TxRadioGroup>`,
  },
  'slider': {
    id: 'slider',
    exports: ['TxSlider'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxSlider defaultValue={45} min={0} max={100} showValue />`,
  },
  'tabs': {
    id: 'tabs',
    exports: ['TxTabs', 'TxTabItem'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxTabs defaultValue="general" placement="top"><TxTabItem name="general" label="General">General panel</TxTabItem><TxTabItem name="security" label="Security">Security panel</TxTabItem></TxTabs>`,
  },
  'collapse': {
    id: 'collapse',
    exports: ['TxCollapse', 'TxCollapseItem'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxCollapse defaultValue={['a']}><TxCollapseItem name="a" title="Details">Expanded body</TxCollapseItem></TxCollapse>`,
  },
  'tooltip': {
    id: 'tooltip',
    exports: ['TxTooltip'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxTooltip content="Keyboard shortcut: ⌘K"><TxButton>Hover me</TxButton></TxTooltip>`,
  },
  'popover': {
    id: 'popover',
    exports: ['TxPopover'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxPopover content={<div>Quick actions</div>}><TxButton>Open popover</TxButton></TxPopover>`,
  },
  'dialog': {
    id: 'dialog',
    exports: ['TxDialog'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxDialog open={open} onOpenChange={setOpen} title="Confirm action">Proceed with deployment?</TxDialog>`,
  },
  'drawer': {
    id: 'drawer',
    exports: ['TxDrawer'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxDrawer open={open} onOpenChange={setOpen} title="Inspector" direction="right">Drawer content</TxDrawer>`,
  },
  'select': {
    id: 'select',
    exports: ['TxSelect', 'TxSelectItem'],
    status: 'ready',
    tier: 'B',
    sampleTsx: `<TxSelect defaultValue="react" placeholder="Choose framework"><TxSelectItem value="vue" label="Vue" /><TxSelectItem value="react" label="React" /></TxSelect>`,
  },

  // Tier C (2)
  'stream-text': {
    id: 'stream-text',
    exports: ['TxStreamText', 'TxStreamCaret'],
    status: 'ready',
    tier: 'C',
    sampleTsx: `<TxStreamText content="Streaming native React tokens smoothly." streaming reveal="aurora" />`,
  },
  'markdown-view': {
    id: 'markdown-view',
    exports: ['TxMarkdownView'],
    status: 'ready',
    tier: 'C',
    sampleTsx: `<TxMarkdownView content="## TuffEx React\n\nSupports **GFM** & safe sanitization." />`,
  },
}

export const REACT_COMPONENT_IDS: readonly string[] = Object.keys(REACT_COMPONENTS_MANIFEST)
