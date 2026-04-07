import { api } from '../api-client';
import type { AuthResponse, LoginRequest, RegisterRequest, UserInfo } from '@ots/shared';

export const authApi = {
  login: (data: LoginRequest) => api.post<AuthResponse>('/auth/login', data),
  register: (data: RegisterRequest) => api.post<AuthResponse>('/auth/register', data),
  getMe: () => api.get<UserInfo>('/auth/me'),
};
