import { PROFILE_COUNTS } from './plan'
import { optionsFor } from './test-fixtures'
import { runFullSuite } from './test-full'

runFullSuite({
  name: 'full profile, no installed apps',
  options: optionsFor(PROFILE_COUNTS.full, { seed: 1, apps: [] }),
  uncovered: { query: ['acronym'] }
})
