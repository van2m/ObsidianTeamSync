import { api } from '../api-client';
import type { NoteInfo, NoteContent, NoteHistoryEntry, PaginatedResponse, DiffResult } from '@ots/shared';

export const notesApi = {
  list: (vaultId: string, page = 1, pageSize = 20) =>
    api.get<PaginatedResponse<NoteInfo>>(`/vaults/${vaultId}/notes?page=${page}&pageSize=${pageSize}`),
  create: (vaultId: string, data: { path: string; content: string }) =>
    api.post<NoteInfo>(`/vaults/${vaultId}/notes`, data),
  get: (noteId: string) => api.get<NoteContent>(`/notes/${noteId}`),
  update: (noteId: string, data: { markdown: string; path?: string }) =>
    api.put<NoteInfo>(`/notes/${noteId}`, data),
  delete: (noteId: string) => api.delete<void>(`/notes/${noteId}`),
  history: (noteId: string, includeContent = true) =>
    api.get<NoteHistoryEntry[]>(`/notes/${noteId}/history${includeContent ? '?content=true' : ''}`),
  diff: (noteId: string, from: string, to: string = 'current') =>
    api.get<DiffResult>(`/notes/${noteId}/diff?from=${from}&to=${to}`),
  rollback: (noteId: string, historyId: string) =>
    api.post<{ id: string; mtime: number }>(`/notes/${noteId}/rollback`, { historyId }),
};
