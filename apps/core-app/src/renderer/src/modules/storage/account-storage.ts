import { useStorageSdk } from '@talex-touch/utils/renderer'

const storageSdk = useStorageSdk()

interface Eller {
  permissions: Permission[]
  roles: Role[]
}

interface Role {
  id: number
  name: string
  desc: string
  parent?: unknown
  createdAt: string
  updatedAt: string
  deletedAt?: unknown
  UserRole: UserRole
}

interface UserRole {
  id: number
  user_id: number
  role_id: number
  createdAt: string
  updatedAt: string
  deletedAt?: unknown
}

interface Permission {
  id: number
  name: string
  module: string
  createdAt: string
  updatedAt: string
  deletedAt?: unknown
}

interface User {
  id: number
  username: string
  email: string
  updatedAt: string
  createdAt: string
}

interface AccountStorageData {
  user?: User
  eller?: Eller
  token?: unknown
}

export class AccountStorage {
  user?: User
  eller?: Eller

  constructor(data?: AccountStorageData) {
    this.analyzeFromObj(data)
  }

  analyzeFromObj(data?: AccountStorageData): void {
    if (!data) return
    if (data.user) this.user = data.user
    if (data.eller) this.eller = data.eller

    setTimeout(() => this.__save())
  }

  __save(): void {
    const { user, eller } = this

    void storageSdk.app.save({
      key: 'account.ini',
      content: JSON.stringify({ user, eller }),
      clear: false
    })
  }

  saveToStr(): string {
    const { user, eller } = this

    return JSON.stringify({
      user,
      eller
    })
  }
}
