// Authentication types / 认证相关类型

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
}
