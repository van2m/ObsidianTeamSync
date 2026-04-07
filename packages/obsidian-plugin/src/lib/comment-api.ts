// Comment API client for plugin / 插件端评论 API
import { ApiClient } from './api-client';
import type { CommentInfo, CreateCommentRequest } from '@ots/shared';

export class CommentApiClient {
  constructor(private api: ApiClient) {}

  async list(noteId: string, resolved?: boolean): Promise<CommentInfo[]> {
    const params = resolved !== undefined ? `?resolved=${resolved}` : '';
    const res = await this.api.get<{ data: CommentInfo[] }>(`/notes/${noteId}/comments${params}`);
    return (res as any).data ?? res;
  }

  async create(noteId: string, data: CreateCommentRequest): Promise<CommentInfo> {
    const res = await this.api.post<{ data: CommentInfo }>(`/notes/${noteId}/comments`, data);
    return (res as any).data ?? res;
  }

  async resolve(commentId: string, resolved: boolean): Promise<CommentInfo> {
    const res = await this.api.patch<{ data: CommentInfo }>(`/comments/${commentId}/resolve`, { resolved });
    return (res as any).data ?? res;
  }

  async delete(commentId: string): Promise<void> {
    await this.api.delete(`/comments/${commentId}`);
  }
}
