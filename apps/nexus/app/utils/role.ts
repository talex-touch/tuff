export function isAdminRole(role?: string | null) {
  const normalized = String(role || '').toLowerCase()
  return normalized === 'admin' || normalized === 'owner'
}
