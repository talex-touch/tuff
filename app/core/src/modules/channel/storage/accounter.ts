import { touchChannel } from "../channel-core";

interface Token {
  access_token: string;
  refresh_token: string;
}

interface Eller {
  permissions: Permission[];
  roles: Role[];
}

interface Role {
  id: number;
  name: string;
  desc: string;
  parent?: any;
  createdAt: string;
  updatedAt: string;
  deletedAt?: any;
  UserRole: UserRole;
}

interface UserRole {
  id: number;
  user_id: number;
  role_id: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: any;
}

interface Permission {
  id: number;
  name: string;
  module: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: any;
}

interface User {
  id: number;
  username: string;
  email: string;
  updatedAt: string;
  createdAt: string;
}

export class AccountStorage {
  user: User;
  eller: Eller;
  token: Token;

  constructor(data: string) {
    // console.log( data )
    this.analyzeFromObj(data);
  }

  analyzeFromObj(data: any) {
    if (!data) return;
    if (data.user) this.user = data.user;
    if (data.token) this.token = data.token;
    if (data.eller) this.eller = data.eller;

    setTimeout(() => this.__save());
  }

  __save() {
    const { user, eller, token } = this;

    touchChannel.send("storage:save", {
      key: "account.ini",
      content: JSON.stringify({ user, eller, token }),
      clear: false,
    });
  }

  saveToStr() {
    const { user, eller, token } = this;

    console.log(
      "Accounter",
      JSON.stringify({
        user,
        eller,
        token,
      })
    );

    return JSON.stringify({
      user,
      eller,
      token,
    });
  }
}
