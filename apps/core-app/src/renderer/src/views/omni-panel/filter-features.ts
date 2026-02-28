import type { OmniPanelFeatureItemPayload } from '../../../../shared/events/omni-panel'

export function filterOmniPanelFeatures(
  features: OmniPanelFeatureItemPayload[],
  keyword: string
): OmniPanelFeatureItemPayload[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) {
    return features
  }

  return features.filter((item) => {
    const title = item.title.toLowerCase()
    const subtitle = item.subtitle.toLowerCase()
    const pluginName = (item.pluginName || '').toLowerCase()
    return (
      title.includes(normalizedKeyword) ||
      subtitle.includes(normalizedKeyword) ||
      pluginName.includes(normalizedKeyword)
    )
  })
}
