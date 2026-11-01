import { PROFILE_COUNTS } from './plan'
import { optionsFor } from './test-fixtures'
import { runFullSuite } from './test-full'

runFullSuite({
  name: 'full profile, 89 installed apps',
  options: optionsFor(PROFILE_COUNTS.full),
  uncovered: {}
})
