import { api } from '../api-client';
import type { CommentInfo, CreateCommentRequest, UpdateCommentRequest } from '@ots/shared';

export const commentsApi = {
  list: (noteId: string, resolved?: boolean) => {
    const params = resolved !== undefined ? `?resolved=${resolved}` : '';
    return api.get<CommentInfo[]>(`/notes/${noteId}/comments${params}`);
  },
  create: (noteId: string, data: CreateCommentRequest) =>
    api.post<CommentInfo>(`/notes/${noteId}/comments`, data),
  update: (commentId: string, data: UpdateCommentRequest) =>
    api.put<CommentInfo>(`/comments/${commentId}`, data),
  resolve: (commentId: string, resolved: boolean) =>
    api.patch<CommentInfo>(`/comments/${commentId}/resolve`, { resolved }),
  delete: (commentId: string) =>
    api.delete<void>(`/comments/${commentId}`),
};
