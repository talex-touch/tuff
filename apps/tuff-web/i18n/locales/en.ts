import base from './base-en'
import landing from './route/en/landing'
import store from './route/en/store'

// Strip unused auth/team console subtrees from the public website bundle.
const { auth: _auth, team: _team, ...publicBase } = base

export default {
  ...publicBase,
  landing,
  store,
}
