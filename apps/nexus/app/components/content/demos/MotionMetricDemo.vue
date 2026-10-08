<script setup lang="ts">
import type { MotionMetricData, MotionMetricLabels, MotionMetricReadout, MotionMetricSeries, MotionMetricVariant } from '@talex-touch/tuffex/motion-metric'
import { MOTION_METRIC_CATALOG, MOTION_METRIC_COMPOSITES, MOTION_METRIC_INTERACTIONS } from '@talex-touch/tuffex/motion-metric'
import { computed, ref, watch } from 'vue'
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const copy = computed(() => zh.value ? { catalog: '15 个目录变体', source: '29 个独立源码能力', extra: 'AnimatedMetricCard 全部交互', variant: '选择能力', sample: '这些数据是可编辑的文档样本，不连接任何业务后端。周期筛选切换不同样本；滑块、热图和图表支持实际输入。', value: '调用方数值', status: '调用方状态', paused: '已暂停', available: '样本可用', first: '周期一', second: '周期二', events: '发出的事件', preview: '由调用方提供的广告内容预览', week: '本周', month: '本月', title: '样本', detail: '详细信息由调用方处理' } : { catalog: '15 catalog variants', source: '29 independent source capabilities', extra: 'Every AnimatedMetricCard interaction', variant: 'Select capability', sample: 'Editable documentation samples, not connected to a business backend. Period filters switch distinct samples; sliders, matrices and charts accept real input.', value: 'Caller value', status: 'Caller status', paused: 'Paused', available: 'Sample available', first: 'Period one', second: 'Period two', events: 'Emitted events', preview: 'Caller-owned advertisement preview', week: 'This week', month: 'This month', title: 'Sample', detail: 'The caller handles details' })
const labels = computed<Partial<MotionMetricLabels>>(() => zh.value ? { period: '周期', empty: '当前周期没有数据', details: '查看详情', share: '分享', more: '更多操作', scrubber: '选择数据点', current: '当前', target: '目标', remaining: '剩余时间', low: '低', high: '高', minimum: '下限', maximum: '上限', threshold: '阈值', start: '开始', pause: '暂停', message: '输入反馈', send: '发送事件', all: '全部', resume: '继续学习', analysis: '分析', average: '平均' } : { send: 'Emit message' })
const variant = ref<MotionMetricVariant>('m-cache-bandwidth')
const interaction = ref<typeof MOTION_METRIC_INTERACTIONS[number]>('progress-indicator-piano')
const period = ref('first')
const value = ref(66)
const selectedIndex = ref(0)
const range = ref<[number, number]>([30, 80])
const running = ref(false)
const message = ref('')
const event = ref('—')
const messageList = ref([{ id: 'comment-1', author: 'Arthur', text: 'The contrast is easier to read.', time: '10:30' }])
const status = ref('')
const catalog: Record<string, string> = {
  'm-cache-bandwidth': 'cacheable-bandwidth-cost', 'm-net-matrix': 'network-telemetry-matrix', 'm-progress-piano': 'progress-indicator-piano', 'm-server-step': 'server-performance-step-bars', 'm-overview-scrubber': 'overview-bar-scrubber-card', 'm-sales-dual': 'sales-analytics-dual-bars', 'm-sales-arc': 'sales-target-segmented-arc', 'm-sales-radial-dash': 'sales-overview-radial-dashboard', 'm-credit-barcode': 'credit-score-barcode-meter', 'm-mono-stock': 'mono-stock', 'm-users-pill': 'users-growth-pill-progress', 'm-views-wave': 'views-hourly-wave-chart', 'm-mono-heatmap': 'mono-heatmap', 'm-timer-prep': 'timer-preparation-segmented', 'm-noise-level': 'noise-decibel-level',
}
const kind = computed(() => variant.value === 'animated-metric-card' ? interaction.value : catalog[variant.value] ?? variant.value)
function s(id: string, values: number[], label = id, unit = ''): MotionMetricSeries {
  return { id, label, unit, points: values.map((value, index) => ({ label: `${index + 1}`, value, tone: id === 'heart' ? (value > 85 ? 'danger' as const : 'info' as const) : undefined })) }
}
function metric(id: string, label: string, value: number | string, unit = '', target?: number): MotionMetricReadout { return { id, label, value, unit, target } }
const sample = computed<MotionMetricData>(() => {
  const sales = [s('sales', [40, 72, 55, 86], zh.value ? '销售' : 'Sales'), s('earnings', [30, 88, 42, 65], zh.value ? '收益' : 'Earnings')]
  const bars = [s('activity', [12, 22, 34, 42, 53, 66, 78, 92], zh.value ? '活动' : 'Activity')]
  const history = [s('history', [48, 62, 56, 74, 67, 91, 83], zh.value ? '趋势' : 'History')]
  const reads = [metric('current', zh.value ? '当前' : 'Current', 66), metric('target', zh.value ? '目标' : 'Target', 100)]
  const cells = Array.from({ length: 28 }, (_, index) => ({ id: `day-${index}`, label: String(index + 1), value: [0, 1, 4, 2, 6, 3, 8][index % 7]! }))
  const base: MotionMetricData = { title: `${copy.value.title} · ${variant.value}`, description: copy.value.detail, value: 66, target: 100, previous: 58, unit: '%', series: history, metrics: reads }
  switch (kind.value) {
    case 'cacheable-bandwidth-cost': case 'cache-stats-card':
      return { ...base, value: 90.5, target: 129.6, unit: 'GB', metrics: [metric('hit', zh.value ? '缓存命中率' : 'Cache hit rate', 12.3, '%'), metric('maximum', zh.value ? '最大命中率' : 'Max hit rate', 72.6, '%'), metric('requests', zh.value ? '请求' : 'Requests', 7150000), metric('cost', zh.value ? '成本' : 'Cost', 9.5, 'USD')], groups: [{ id: 'bandwidth', label: 'Bandwidth', value: 90.5, unit: 'GB', metrics: [metric('cached', zh.value ? '已缓存' : 'Cached', 12.8, 'GB'), metric('uncached', zh.value ? '不可缓存' : 'Non-cacheable', 26.3, 'GB')] }] }
    case 'network-telemetry': case 'network-telemetry-matrix':
      return { ...base, metrics: [metric('finality', zh.value ? '平均最终确认时间' : 'Average finality', 1.8, 's'), metric('intents', zh.value ? '已确认意图' : 'Finalized intents', 312134)], groups: [{ id: 'aug', label: 'Testnet V0', value: 12450, columns: 16, cells }, { id: 'sep', label: 'Sequencer V1', value: 18916, columns: 16, cells: cells.map(cell => ({ ...cell, value: 8 - cell.value })) }] }
    case 'server-performance': case 'server-performance-step-bars': return { ...base, series: bars }
    case 'budget': return { ...base, value: 1420, target: 2200, unit: 'USD' }
    case 'growth': return { ...base, value: 7432.58, unit: 'USD', series: [s('growth', [16, 28, 46])] }
    case 'prompts-card': return { ...base, value: 12480, target: 20800, unit: '' }
    case 'real-time-alerts': return { ...base, value: 30, target: 45, unit: 'B', threshold: 36, series: [s('usage', [8.5, 9.2, 4.1, 8.7])] }
    case 'system-metrics-card': return { ...base, metrics: [metric('orders', 'Orders import · TimeoutError', 13, '', 36), metric('enrichment', 'Data enrichment · NotFound', 3, '', 12), metric('dedupe', 'Deduplication · MergeConflict', 2, '', 8)], groups: [{ id: 'latency', label: zh.value ? '平均延迟' : 'Average latency', value: 1.8, unit: 's', metrics: [metric('p99', 'P99', 3.6, 's'), metric('p95', 'P95', 0.4, 's')], series: history }, { id: 'lag', label: zh.value ? '平均滞后' : 'Average lag', value: 38, unit: 's', metrics: [metric('p99', 'P99', 67, 's'), metric('p95', 'P95', 48, 's')], series: bars }] }
    case 'sales-analytics-dual-bars': return { ...base, value: 345, target: 500, unit: '', series: sales }
    case 'sales-target-segmented-arc': return { ...base, value: 70, metrics: [metric('listed', zh.value ? '已挂牌' : 'Listed', 30, '%'), metric('delivered', zh.value ? '已交付' : 'Delivered', 40, '%')] }
    case 'sales-overview': case 'sales-overview-radial-dashboard': return { ...base, value: 67.2, rank: zh.value ? '前 17% 的表现者' : 'Top 17% of performers', metrics: [metric('sales', zh.value ? '销售笔数' : 'Number of sales', 1304), metric('revenue', zh.value ? '总营收' : 'Total revenue', 21100, 'USD')] }
    case 'sales-dashboard': return { ...base, metrics: [metric('sales', 'Sales', 34678, 'USD'), metric('views', 'Views', 46246), metric('funds', 'Funds', 12800, 'USD'), metric('properties', 'Properties', 435)], groups: [{ id: 'analytics', label: zh.value ? '销售分析' : 'Sales analytics', value: typeof value.value === 'number' && value.value !== 66 ? value.value : 345, target: 500, series: sales, periods: [{ value: 'weekly', label: copy.value.week, data: { value: typeof value.value === 'number' && value.value !== 66 ? value.value : 345, series: sales } }, { value: 'monthly', label: copy.value.month, data: { value: 420, series: sales.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: point.value * 1.2 })) })) } }] }, { id: 'target', label: zh.value ? '销售目标' : 'Sales target', value: 70, target: 100, unit: '%', metrics: [metric('listed', 'Listed', 30), metric('delivered', 'Delivered', 40)], periods: [{ value: 'monthly', label: copy.value.month, data: { value: 70, metrics: [metric('listed', 'Listed', 30), metric('delivered', 'Delivered', 40)] } }, { value: 'yearly', label: zh.value ? '本年' : 'This year', data: { value: 85, metrics: [metric('listed', 'Listed', 35), metric('delivered', 'Delivered', 50)] } }] }] }
    case 'credit-score-cards': return { ...base, value: 730, min: 300, max: 850, unit: '', previous: 717, groups: [{ id: 'report', label: zh.value ? '信用报告' : 'Credit report', metrics: [{ ...metric('usage', 'Card usage', 18, '%'), grade: 'B' }, { ...metric('history', 'Payment history', 'Great'), grade: 'A' }, { ...metric('inquiries', 'Hard inquiries', 4), grade: 'C' }] }, { id: 'utilization', label: zh.value ? '使用情况' : 'Utilization', value: 856, unit: 'USD', metrics: [metric('balance', 'Balance', 856, 'USD', 14500)] }, { id: 'history', label: zh.value ? '分数历史' : 'Score history', series: [s('score', [700, 717, 730])] }] }
    case 'credit-score-barcode-meter': return { ...base, value: 88, max: 100 }
    case 'finance-dashboard': return { ...base, max: 100, groups: [{ id: 'savings', label: zh.value ? '储蓄' : 'Savings', value: 16322.95, unit: 'USD', series: bars, periods: ['1D', '7D', '1M'].map((id, index) => ({ value: id, label: id, data: { value: 16322.95 * (1 + index * 0.1), series: bars.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: point.value * (1 + index * 0.1) })) })) } })) }, { id: 'credit', label: zh.value ? '信用分' : 'Credit score', value: 88, periods: [{ value: 'weekly', label: copy.value.week, data: { value: 88 } }, { value: 'monthly', label: copy.value.month, data: { value: 82 } }] }, { id: 'expenses', label: zh.value ? '主要支出' : 'Major expenses', series: [s('housing', [40, 50, 65, 42]), s('food', [20, 30, 24, 32]), s('other', [10, 18, 12, 20])] }, { id: 'assets', label: zh.value ? '资产' : 'Assets', unit: 'USD', metrics: [metric('usdc', 'USDC', 5482.19), metric('btc', 'BTC', 6731.58), metric('usdt', 'USDT', 4332.6)] }] }
    case 'savings-cards': case 'mono-savings': return { ...base, value: 890, target: 1200, unit: 'USD', series: bars }
    case 'stock-chart-card': case 'mono-stock': return { ...base, value: 182.4, unit: 'USD', previous: 178.25, series: [s('price', [172.5, 174.2, 173.6, 178.1, 177.5, 180.3, 182.4], 'Price', 'USD')] }
    case 'users-growth-pill-progress': case 'growth-calendar': return { ...base, value: 88.3, series: [s('growth', [45, 78, 100])], weekdays: zh.value ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'], cells: Array.from({ length: 35 }, (_, index) => ({ id: `calendar-${index}`, label: String(index < 30 ? index + 1 : index - 29), value: [1, 4, 2, 0, 3, 5, 0][index % 7]!, description: index < 30 ? 'September' : 'October' })), profiles: [{ id: 'alex', name: 'Alex', initials: 'AX', status: 'Active' }], groups: [{ id: 'calendar', label: zh.value ? '日历' : 'Calendar' }] }
    case 'mono-heatmap': return { ...base, value: 342, unit: zh.value ? '次提交' : 'commits', cells }
    case 'user-metrics': return { ...base, metrics: [metric('new', 'New users', 1390), metric('unique', 'Unique users', 1520), metric('retention', 'Week 1 retention', 4.53, '%'), metric('session', 'Session', 0.9, 's')], groups: [{ id: 'views', label: zh.value ? '浏览量' : 'Views', value: 12700, series: history }] }
    case 'users-chart-card': return { ...base, value: 1240, unit: '', metrics: [metric('new', zh.value ? '新用户' : 'New users', 980), metric('bounce', zh.value ? '跳出率' : 'Bounce rate', 43.5, '%')] }
    case 'visitors-chart-card': return { ...base, value: 120, unit: '', series: [s('members', [120, 135, 125, 160, 140, 175, 145], zh.value ? '成员' : 'Members'), s('visitors', [45, 65, 85, 100, 70, 55, 62], zh.value ? '访客' : 'Visitors')] }
    case 'marketing-cards': return { ...base, groups: [{ id: 'channels', label: zh.value ? '销售渠道' : 'Sales channels', value: 246, metrics: [metric('direct', 'Direct', 85), metric('search', 'Search', 72), metric('social', 'Social', 54), metric('referral', 'Referral', 35)] }, { id: 'campaign', label: zh.value ? '营销活动' : 'Campaign', value: 1750, unit: 'USD', series: history, metrics: [metric('used', 'Budget used', 45, '%'), metric('cost', 'Spend', 32900, 'USD')] }] }
    case 'noise-decibel-level': return { ...base, value: 40, min: 30, max: 120, threshold: 55, unit: 'dB', groups: undefined }
    case 'noise-cards': return { ...base, min: 30, max: 120, threshold: 55, groups: [{ id: 'room', label: zh.value ? '室内' : 'Room', value: 40, unit: 'dB' }, { id: 'outside', label: zh.value ? '户外' : 'Outside', value: 60, unit: 'dB' }] }
    case 'timer-card': case 'timer-preparation-segmented': case 'mono-timer-arc': return { ...base, remaining: 1504, total: 1800, steps: [{ id: 'plan', label: zh.value ? '计划' : 'Plan', value: 20 }, { id: 'prepare', label: zh.value ? '准备' : 'Prepare', value: 30 }, { id: 'review', label: zh.value ? '复核' : 'Review', value: 25 }, { id: 'finish', label: zh.value ? '完成' : 'Finish', value: 25 }] }
    case 'running-stats-card': return { ...base, value: 18.13, unit: 'km', metrics: [metric('duration', zh.value ? '时长' : 'Duration', '3h 45m')], series: [s('distance', [6, 5, 0, 7.13, 0, 0, 0], 'Distance', 'km')] }
    case 'course-progress-card': return { ...base, value: 25, groups: [{ id: 'training', label: zh.value ? '培训分析' : 'Training analysis', value: 12, unit: zh.value ? '门课程' : 'courses', metrics: [metric('attended', 'Attended', 26)], series: bars }], profiles: [{ id: 'one', name: 'Alex', initials: 'AX', status: '' }, { id: 'two', name: 'Sam', initials: 'SM', status: '' }] }
    case 'health-cards': return { ...base, groups: [{ id: 'goals', label: zh.value ? '每日目标' : 'Daily goals', value: 4, metrics: [metric('goal', 'Goal', 4, '', 7)], series: [s('days', [7, 7, 7, 7, 0, 0, 0])] }, { id: 'period', label: zh.value ? '周期' : 'Period', value: 7, cells: cells.slice(0, 7) }, { id: 'hydration', label: zh.value ? '饮水' : 'Hydration', value: 1203, unit: 'ml', metrics: [metric('water', 'Water target', 1203, 'ml', 1500)], series: [s('water', [1500, 1300, 1500, 1203, 900, 500, 0])] }, { id: 'workout', label: zh.value ? '锻炼' : 'Workout', series: history }, { id: 'steps', label: zh.value ? '步数' : 'Steps', value: 5093, series: bars }, { id: 'sleep', label: zh.value ? '睡眠' : 'Sleep', value: 6.5, unit: 'h', series: [{ id: 'stages', label: 'Sleep stages', points: [{ label: 'Deep', value: 2, level: 100 }, { label: 'REM', value: 1, level: 45 }, { label: 'Light', value: 3.5, level: 70 }] }] }, { id: 'heart', label: zh.value ? '心率' : 'Heart rate', value: 82, unit: 'BPM', series: [s('heart', [72, 76, 90, 82, 78, 85])] }, { id: 'target', label: zh.value ? '每周目标' : 'Weekly target', value: 110, metrics: [{ ...metric('target', 'Target', 110, '', 150), description: zh.value ? '由调用方提供的每周目标。' : 'Weekly target provided by the caller.' }] }] }
    case 'status-cards': return { ...base, profiles: [{ id: 'cody', name: 'Cody', initials: 'CY', status: 'Awake', detail: '8h 47m asleep', segments: [{ label: 'Deep', value: 4 }, { label: 'REM', value: 1 }, { label: 'Light', value: 3 }] }, { id: 'shane', name: 'Shane', initials: 'SH', status: 'At home', value: 80 }, { id: 'philip', name: 'Philip', initials: 'PH', status: 'Walking', value: 3457 }, { id: 'courtney', name: 'Courtney', initials: 'CO', status: 'Listening', detail: 'Hold Me Like a Grudge' }, { id: 'greg', name: 'Greg', initials: 'GR', status: 'Sleeping' }, { id: 'victoria', name: 'Victoria', initials: 'VI', status: 'Flying to Osaka', flight: { label: 'DL 655', from: 'LAX', to: 'ITM', departure: '1:50 PM PST', arrival: '8:30 AM GMT+9', progress: 60 } }, { id: 'angel', name: 'Angel', initials: 'AN', status: 'Slept', detail: '8h 47m · 00:20–08:27' }] }
    case 'feedback-card': return { ...base, description: copy.value.preview, messages: messageList.value }
    case 'mono-wallet': return { ...base, value: 24500, unit: 'USD', metrics: [metric('inflow', 'Inflow', 8240, 'USD'), metric('outflow', 'Outflow', 2150, 'USD')] }
    case 'mono-activity-ring': case 'mono-timer-ring': return { ...base, metrics: [metric('focus', zh.value ? '专注' : 'Focus', 45, 'min', 60), metric('exercise', zh.value ? '运动' : 'Exercise', 30, 'min', 45), metric('stand', zh.value ? '站立' : 'Stand', 10, 'h', 12)] }
    case 'mono-users': return { ...base, value: 48200, unit: '', metrics: [metric('us', 'US', 54, '%'), metric('eu', 'EU', 32, '%')] }
    case 'mono-kfactor': return { ...base, value: 1.42, target: 2, unit: 'x' }
    case 'mono-latency': return { ...base, value: 1.8, unit: 's', metrics: [metric('p99', 'P99', 3.6, 's'), metric('p95', 'P95', 0.4, 's')] }
    case 'mono-bandwidth': return { ...base, value: 840, target: 1200, unit: 'Mbps', metrics: [metric('latency', 'Latency', 1.2, 'ms'), metric('loss', 'Packet loss', 0, '%')] }
    case 'mono-server': return { ...base, metrics: [metric('cpu', 'CPU', 32, '%', 100), metric('ram', 'RAM', 64, '%', 100)], groups: [{ id: 'system', label: 'System', metrics: [metric('nodes', 'Active nodes', 8), metric('heap', 'Heap', 4.2, 'GB')] }] }
    case 'mono-progress': return { ...base, value: 75, steps: [{ id: 'compile', label: 'Compile', value: 75, status: zh.value ? '调用方进行中' : 'Caller in progress' }, { id: 'publish', label: 'Publish', value: 0, status: zh.value ? '等待调用方' : 'Awaiting caller' }] }
    case 'mono-radar': return { ...base, value: 2, target: 10, metrics: [metric('critical', 'Critical', 0), metric('open', 'Open alerts', 2)] }
    case 'mono-credit': return { ...base, value: 785, min: 300, max: 850, unit: '' }
    case 'mono-revenue': return { ...base, value: 94820, unit: 'USD' }
    default: return base
  }
})
function scaled(data: MotionMetricData): MotionMetricData {
  return { ...data, description: `${data.description ?? ''} · ${copy.value.second}`, value: data.value === undefined ? undefined : data.value * 0.8, threshold: data.threshold === undefined ? undefined : data.threshold * 0.8, remaining: data.remaining === undefined ? undefined : data.remaining * 0.8, series: data.series?.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: point.value * 0.8 })) })), metrics: data.metrics?.map(item => ({ ...item, value: typeof item.value === 'number' ? item.value * 0.8 : item.value })), cells: data.cells?.map(cell => ({ ...cell, value: cell.value * 0.8 })), profiles: data.profiles?.map(profile => ({ ...profile, value: typeof profile.value === 'number' ? profile.value * 0.8 : profile.value, flight: profile.flight ? { ...profile.flight, progress: profile.flight.progress * 0.8 } : undefined })), groups: data.groups?.map(group => ({ ...group, value: group.value === undefined ? undefined : group.value * 0.8, series: group.series?.map(row => ({ ...row, points: row.points.map(point => ({ ...point, value: point.value * 0.8 })) })), metrics: group.metrics?.map(item => ({ ...item, value: typeof item.value === 'number' ? item.value * 0.8 : item.value })), cells: group.cells?.map(cell => ({ ...cell, value: cell.value * 0.8 })) })) }
}
const periods = computed(() => {
  const ids = kind.value === 'stock-chart-card' ? ['1D', '1W', '1M', '3M', '1Y', 'ALL'] : kind.value === 'mono-stock' ? ['1D', '1W', '1M', '1Y'] : kind.value === 'users-chart-card' ? ['7d', '12d', '30d'] : kind.value === 'visitors-chart-card' ? ['1D', '5D', '1M', '6M', '1A', 'custom'] : ['views-hourly-wave-chart', 'user-metrics'].includes(kind.value) ? ['day', 'week', 'month'] : kind.value === 'health-cards' ? ['day', 'week', 'month', 'year'] : kind.value === 'sales-analytics-dual-bars' ? ['monthly', 'weekly'] : kind.value === 'sales-target-segmented-arc' ? ['monthly', 'yearly'] : ['credit-score-barcode-meter', 'marketing-cards'].includes(kind.value) ? ['weekly', 'monthly'] : ['overview-chart', 'overview-bar-scrubber-card'].includes(kind.value) ? ['last-month', 'this-month'] : kind.value === 'growth-calendar' ? ['2024-09', '2024-10'] : ['first', 'second']
  return ids.map((id, index) => {
    let data = sample.value
    for (let i = 0; i < index; i++) data = scaled(data)
    const translated: Record<string, string> = zh.value ? { day: '日', week: '周', month: '月', year: '年', monthly: '月度', weekly: '周度', yearly: '年度', custom: '自定义', 'last-month': '上月', 'this-month': '本月', '2024-09': '2024 年 9 月', '2024-10': '2024 年 10 月', first: copy.value.first, second: copy.value.second } : { day: 'Day', week: 'Week', month: 'Month', year: 'Year', monthly: 'Monthly', weekly: 'Weekly', yearly: 'Yearly', custom: 'Custom', 'last-month': 'Last month', 'this-month': 'This month', '2024-09': 'September 2024', '2024-10': 'October 2024', first: copy.value.first, second: copy.value.second }
    return { value: id, label: translated[id] ?? id, data }
  })
})
watch([variant, interaction], () => { period.value = periods.value[0]?.value ?? '' }, { immediate: true })
watch([variant, interaction, period], () => { const next = periods.value.find(option => option.value === period.value)?.data ?? sample.value; value.value = (kind.value === 'real-time-alerts' ? next.threshold : next.value) ?? 0; selectedIndex.value = 0; running.value = false }, { immediate: true })
function send(text: string): void { event.value = `send: ${text}`; messageList.value = [...messageList.value, { id: `comment-${messageList.value.length + 1}`, author: 'You', text, time: '' }]; message.value = '' }
</script>
<template>
  <div class="motion-metric-demo not-prose">
    <p>{{ copy.sample }}</p>
    <div class="motion-metric-demo__controls">
      <label>{{ copy.variant }}<select v-model="variant"><optgroup :label="copy.catalog"><option v-for="item in MOTION_METRIC_CATALOG" :key="item" :value="item">{{ item }}</option></optgroup><optgroup :label="copy.source"><option v-for="item in MOTION_METRIC_COMPOSITES" :key="item" :value="item">{{ item }}</option></optgroup><optgroup :label="copy.extra"><option v-for="item in MOTION_METRIC_INTERACTIONS" :key="item" :value="item">{{ item }}</option></optgroup></select></label>
      <label v-if="variant === 'animated-metric-card'">{{ copy.extra }}<select v-model="interaction"><option v-for="item in MOTION_METRIC_INTERACTIONS" :key="item" :value="item">{{ item }}</option></select></label>
      <label v-if="!['network-telemetry', 'network-telemetry-matrix', 'system-metrics-card', 'finance-dashboard', 'health-cards', 'status-cards', 'user-metrics', 'marketing-cards', 'feedback-card', 'noise-cards', 'mono-server', 'timer-card', 'timer-preparation-segmented', 'mono-timer-arc'].includes(kind)">{{ copy.value }}<input v-model.number="value" type="number" step="0.1"></label>
      <label>{{ copy.status }}<input v-model="status" type="text" :placeholder="copy.available"></label>
    </div>
    <TxMotionMetric :key="variant" v-model="value" v-model:period="period" v-model:active-index="selectedIndex" v-model:range="range" v-model:running="running" v-model:message="message" :variant="variant" :interaction="interaction" :periods="periods" :status="status" :labels="labels" @action="event = `action: ${$event}`" @select="event = `select: ${$event.id || $event.index}`" @filter="event = `filter: ${$event.groupId}/${$event.period}`" @send="send">
      <template v-if="kind === 'feedback-card'" #preview="{ data }">
<strong>{{ copy.preview }}</strong><p>{{ data.description }}</p>
</template>
    </TxMotionMetric>
    <output>{{ copy.events }}: {{ event }} · {{ running ? (zh ? '运行中' : 'Running') : copy.paused }}</output>
  </div>
</template>
<style scoped>
.motion-metric-demo { display: grid; gap: 16px; width: 100%; font-size: 13px; color: var(--tx-text-color-primary); }
.motion-metric-demo__controls { display: flex; flex-wrap: wrap; gap: 12px; }
.motion-metric-demo__controls label { display: grid; gap: 5px; min-width: 0; max-width: 100%; }
.motion-metric-demo__controls input, .motion-metric-demo__controls select { padding: 6px 8px; border: 1px solid var(--tx-border-color); border-radius: 8px; color: inherit; background: var(--tx-bg-color); font: inherit; max-width: 100%; }
.motion-metric-demo__controls select { cursor: pointer; }
.motion-metric-demo__controls input[type='number'] { width: 130px; }
.motion-metric-demo output { overflow-wrap: anywhere; }
</style>
