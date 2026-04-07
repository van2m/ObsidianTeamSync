// History/Diff/Rollback API client for plugin / 插件端版本历史 API
import { ApiClient } from './api-client';
import type { NoteHistoryEntry, DiffResult } from '@ots/shared';

export class HistoryApiClient {
  constructor(private api: ApiClient) {}

  async list(noteId: string): Promise<NoteHistoryEntry[]> {
    const res = await this.api.get<{ data: NoteHistoryEntry[] }>(`/notes/${noteId}/history`);
    return (res as any).data ?? res;
  }

  async diff(noteId: string, from: string, to = 'current'): Promise<DiffResult> {
    const res = await this.api.get<{ data: DiffResult }>(`/notes/${noteId}/diff?from=${from}&to=${to}`);
    return (res as any).data ?? res;
  }

  async rollback(noteId: string, historyId: string): Promise<{ id: string; mtime: number }> {
    const res = await this.api.post<{ data: { id: string; mtime: number } }>(`/notes/${noteId}/rollback`, { historyId });
    return (res as any).data ?? res;
  }
}
