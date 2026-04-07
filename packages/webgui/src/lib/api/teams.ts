import { api } from '../api-client';
import type {
  TeamInfo,
  TeamMemberInfo,
  CreateTeamRequest,
  InviteResponse,
  JoinTeamRequest,
  UpdateMemberRoleRequest,
} from '@ots/shared';

export const teamsApi = {
  list: () => api.get<TeamInfo[]>('/teams'),
  create: (data: CreateTeamRequest) => api.post<TeamInfo>('/teams', data),
  get: (teamId: string) => api.get<{ team: TeamInfo; members: TeamMemberInfo[] }>(`/teams/${teamId}`),
  invite: (teamId: string) => api.post<InviteResponse>(`/teams/${teamId}/invite`),
  join: (data: JoinTeamRequest) => api.post<TeamInfo>('/teams/join', data),
  updateMemberRole: (teamId: string, memberId: string, data: UpdateMemberRoleRequest) =>
    api.patch<void>(`/teams/${teamId}/members/${memberId}`, data),
  removeMember: (teamId: string, memberId: string) =>
    api.delete<void>(`/teams/${teamId}/members/${memberId}`),
};
