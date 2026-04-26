import { describe, expect, it } from 'vitest'
import { buildSearchEngineLogsSettingMigrationPlan } from './search-engine-logs-setting-transfer'

describe('search-engine-logs-setting transfer', () => {
  it('copies historical true setting into app setting when new field is absent', () => {
    const result = buildSearchEngineLogsSettingMigrationPlan({}, true)

    expect(result.writeAppSetting).toBe(true)
    expect(result.removeHistoricalSetting).toBe(true)
    expect(result.nextAppSetting.searchEngine.logsEnabled).toBe(true)
  })

  it('does not override explicit app setting with historical value', () => {
    const result = buildSearchEngineLogsSettingMigrationPlan(
      {
        searchEngine: {
          logsEnabled: false
        }
      },
      true
    )

    expect(result.writeAppSetting).toBe(false)
    expect(result.removeHistoricalSetting).toBe(true)
    expect(result.nextAppSetting.searchEngine.logsEnabled).toBe(false)
  })

  it('drops historical false setting without writing defaults back into app setting', () => {
    const result = buildSearchEngineLogsSettingMigrationPlan({}, false)

    expect(result.writeAppSetting).toBe(false)
    expect(result.removeHistoricalSetting).toBe(true)
    expect(result.nextAppSetting.searchEngine?.logsEnabled ?? false).toBe(false)
  })

  it('ignores invalid historical payloads', () => {
    const result = buildSearchEngineLogsSettingMigrationPlan({}, { enabled: true })

    expect(result.writeAppSetting).toBe(false)
    expect(result.removeHistoricalSetting).toBe(false)
    expect(result.nextAppSetting.searchEngine?.logsEnabled ?? false).toBe(false)
  })
})
