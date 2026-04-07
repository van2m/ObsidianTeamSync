import { api } from '../api-client';
import type { VaultInfo, CreateVaultRequest } from '@ots/shared';

export const vaultsApi = {
  list: () => api.get<VaultInfo[]>('/vaults'),
  create: (data: CreateVaultRequest) => api.post<VaultInfo>('/vaults', data),
  get: (vaultId: string) => api.get<VaultInfo>(`/vaults/${vaultId}`),
  delete: (vaultId: string) => api.delete<void>(`/vaults/${vaultId}`),
};
