// REST API client for ObsidianTeamSync server
// OTS 服务端 REST API 客户端
import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserInfo,
} from '@ots/shared';

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const json = await res.json();
    if (!res.ok) {
      throw new ApiError(json.message || res.statusText, json.code || res.status);
    }
    return json;
  }

  // ==================== Auth / 认证 ====================

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.token = res.data.token;
    return res.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.token = res.data.token;
    return res.data;
  }

  async getMe(): Promise<UserInfo> {
    const res = await this.request<UserInfo>('/api/auth/me');
    return res.data;
  }

  // ==================== Teams / 团队 ====================

  async listTeams() {
    const res = await this.request<any[]>('/api/teams');
    return res.data;
  }

  async createTeam(name: string) {
    const res = await this.request<any>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return res.data;
  }

  async getTeam(teamId: string) {
    const res = await this.request<any>(`/api/teams/${teamId}`);
    return res.data;
  }

  async joinTeam(inviteCode: string) {
    const res = await this.request<any>('/api/teams/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    return res.data;
  }

  // ==================== Vaults ====================

  async listVaults() {
    const res = await this.request<any[]>('/api/vaults');
    return res.data;
  }

  async createVault(data: { name: string; type: string; teamId?: string }) {
    const res = await this.request<any>('/api/vaults', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  }

  async getVault(vaultId: string) {
    const res = await this.request<any>(`/api/vaults/${vaultId}`);
    return res.data;
  }

  // ==================== Notes / 笔记 ====================

  async listNotes(vaultId: string, page = 1, pageSize = 50) {
    const res = await this.request<any>(
      `/api/vaults/${vaultId}/notes?page=${page}&pageSize=${pageSize}`
    );
    return res.data;
  }

  async getNote(noteId: string) {
    const res = await this.request<any>(`/api/notes/${noteId}`);
    return res.data;
  }

  // ==================== Health ====================

  async health() {
    const res = await this.request<any>('/api/health');
    return res.data;
  }
}

export class ApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}
