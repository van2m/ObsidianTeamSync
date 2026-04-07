import { api } from '../api-client';
import type { ActivityEntry, PaginatedResponse } from '@ots/shared';

export const activityApi = {
  list: (vaultId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<ActivityEntry>>(`/vaults/${vaultId}/activity?page=${page}&limit=${limit}`),
};
