/**
 * Legacy Permission Types
 * 
 * For backward compatibility with old permission-center.ts
 * @deprecated Use new permission system instead
 */

/**
 * Legacy permission interface
 */
export interface Permission {
  id: symbol
  name: string
  description?: string
}

/**
 * Legacy permission center interface
 */
export interface IPermissionCenter {
  addPermission(pluginScope: string, permission: Permission): void
  delPermission(pluginScope: string, permission: Permission): void
  hasPermission(pluginScope: string, permission: Permission): boolean
  getPermission(pluginScope: string, permission: symbol): Permission
  save(): Promise<void>
}
