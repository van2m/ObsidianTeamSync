// Team types / 团队相关类型

export enum Role {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER',
}

/** Role hierarchy for permission checks / 角色权限层级 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.OWNER]: 40,
  [Role.ADMIN]: 30,
  [Role.EDITOR]: 20,
  [Role.VIEWER]: 10,
};

export interface TeamInfo {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
}

export interface TeamMemberInfo {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  role: Role;
  joinedAt: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface InviteResponse {
  inviteCode: string;
  inviteLink: string;
}

export interface JoinTeamRequest {
  inviteCode: string;
}

export interface UpdateMemberRoleRequest {
  role: Role;
}
