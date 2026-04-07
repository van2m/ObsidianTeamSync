import { api } from '../api-client';
import type { NoteInfo, NoteContent, NoteHistoryEntry, PaginatedResponse } from '@ots/shared';

export const notesApi = {
  list: (vaultId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<NoteInfo>>(`/vaults/${vaultId}/notes?page=${page}&limit=${limit}`),
  create: (vaultId: string, data: { path: string; content: string }) =>
    api.post<NoteInfo>(`/vaults/${vaultId}/notes`, data),
  get: (noteId: string) => api.get<NoteContent>(`/notes/${noteId}`),
  update: (noteId: string, data: { content: string; path?: string }) =>
    api.put<NoteInfo>(`/notes/${noteId}`, data),
  delete: (noteId: string) => api.delete<void>(`/notes/${noteId}`),
  history: (noteId: string) => api.get<NoteHistoryEntry[]>(`/notes/${noteId}/history`),
};
