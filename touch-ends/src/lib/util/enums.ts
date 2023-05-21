export enum IdentityType {
  PASSWORD,
  EMAIL_PASSWORD
}

export enum DeviceType {
  WEB
}

export enum WikiType {
  PERSONAL_WIKI,
  PERSONAL_IMPORTED_WIKI,

  ORGANIZATION_WIKI,
  ORGANIZATION_IMPORTED_WIKI,

  COMPASS_CHART,
  DATA_SOURCE,

  GUIDANCE,
  TODO_LIST
}

export enum WikiMemberPermission {
  OWNER, ADMIN, MEMBER, NONE
}

export enum WikiPermission {
  PUBLIC_TO_ALL,
  PRIVATE_TO_SELF,
  CODE_TO_VIEW,
  TIME_TO_VIEW,
  CODE_TIME_TO_VIEW
}

export enum LogType {
  ADD, DEL, UPD, LIST, EXP, IMP, UNKNOWN
}

export enum FileType {
  LOCAL, OTHER
}

export enum MessageType {
    TEXT, IMAGE, FILE, APPLICATION, UNKNOWN
}

export enum MessageStatus {
    UNREAD, READ
}

export enum OrgActionType {
    ADD, DEL, UPD, UNKNOWN,
    MEMBER_ADD, MEMBER_DEL, MEMBER_KICK, DISPOSE,
  INVITATION
}

export enum InviteActionType {
    ACCEPT, REJECT, IGNORE
}

export enum OrgMemberStatus {
    NORMAL, WAITING_ACCEPTING, REFUSED, DISPOSED // 已注销
}
