import base from './base-zh'
import landing from './route/zh/landing'
import store from './route/zh/store'

// Strip unused auth/team console subtrees from the public website bundle.
const { auth: _auth, team: _team, ...publicBase } = base

export default {
  ...publicBase,
  landing,
  store,
}
