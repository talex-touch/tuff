export interface Permission {
  /**
   * permission id
   */
  id: symbol;

  /**
   * permission name
   */
  name: string;

  /**
   * permission description
   */
  description: string;
}

// generate a permission manager interface
export interface IPermissionCenter {
  /**
   * add a permission
   * @param pluginScope plugin name
   * @param permission permission
   * @throws if permission already exists
   */
  addPermission(pluginScope: string, permission: Permission): void;

  /**
   * remove a permission
   * @param pluginScope plugin name
   * @param permission permission
   * @throws if permission not exists
   */
  delPermission(pluginScope: string, permission: Permission): void;

  /**
   * if pluginScope has permission
   * @param pluginScope plugin name
   * @param permission permission
   */
  hasPermission(pluginScope: string, permission: Permission): boolean;

  /**
   * get permission
   * @param pluginScope plugin name
   * @param permission permission id
   * @returns permission
   */
  getPermission(pluginScope: string, permission: symbol): Permission;
}