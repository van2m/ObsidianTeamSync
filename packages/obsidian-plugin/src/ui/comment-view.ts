// Obsidian comment sidebar view / Obsidian 评论侧边栏
import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';
import type ObsidianTeamSyncPlugin from '../main';
import type { CommentInfo } from '@ots/shared';

export const COMMENT_VIEW_TYPE = 'ots-comment-view';

export class CommentView extends ItemView {
  private plugin: ObsidianTeamSyncPlugin;
  private comments: CommentInfo[] = [];
  private currentNoteId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianTeamSyncPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return COMMENT_VIEW_TYPE; }
  getDisplayText() { return 'OTS 评论'; }
  getIcon() { return 'message-square'; }

  async onOpen() {
    this.renderEmpty();
  }

  async onClose() {}

  /** Load comments for a specific note */
  async loadComments(noteId: string) {
    this.currentNoteId = noteId;
    if (!this.plugin.apiClient) return;

    try {
      const res = await this.plugin.apiClient.get(`/notes/${noteId}/comments`);
      this.comments = (res as any).data ?? [];
      this.render();
    } catch {
      this.comments = [];
      this.render();
    }
  }

  /** Refresh the current comments */
  async refresh() {
    if (this.currentNoteId) {
      await this.loadComments(this.currentNoteId);
    }
  }

  private renderEmpty() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl('div', {
      text: '打开一篇笔记以查看评论',
      cls: 'pane-empty',
    });
  }

  private render() {
    const container = this.containerEl.children[1];
    container.empty();

    if (this.comments.length === 0) {
      container.createEl('div', { text: '暂无评论', cls: 'pane-empty' });
    } else {
      const list = container.createEl('div', { cls: 'ots-comment-list' });
      for (const comment of this.comments) {
        this.renderComment(list, comment);
      }
    }

    // Add comment form
    this.renderForm(container);
  }

  private renderComment(parent: HTMLElement, comment: CommentInfo) {
    const card = parent.createEl('div', { cls: 'ots-comment-card' });
    card.style.cssText = 'border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; margin-bottom: 6px;';

    const header = card.createEl('div', { cls: 'ots-comment-header' });
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';

    const authorEl = header.createEl('span', { text: comment.authorName });
    authorEl.style.cssText = 'font-weight: 600; font-size: 12px;';

    if (comment.line) {
      const lineEl = header.createEl('span', { text: `行 ${comment.line}` });
      lineEl.style.cssText = 'font-size: 10px; color: var(--text-muted); background: var(--background-secondary); padding: 1px 4px; border-radius: 3px;';
    }

    const contentEl = card.createEl('div', { text: comment.content });
    contentEl.style.cssText = 'font-size: 13px; white-space: pre-wrap;';

    const footer = card.createEl('div');
    footer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 4px;';

    const timeEl = footer.createEl('span', { text: new Date(comment.createdAt).toLocaleString('zh-CN') });
    timeEl.style.cssText = 'font-size: 10px; color: var(--text-muted);';

    if (comment.resolved) {
      const badge = footer.createEl('span', { text: '已解决' });
      badge.style.cssText = 'font-size: 10px; color: var(--text-success); background: var(--background-modifier-success); padding: 1px 4px; border-radius: 3px;';
    } else {
      const resolveBtn = footer.createEl('button', { text: '✓ 解决' });
      resolveBtn.style.cssText = 'font-size: 10px; cursor: pointer; background: none; border: 1px solid var(--background-modifier-border); border-radius: 3px; padding: 1px 6px;';
      resolveBtn.onclick = async () => {
        if (!this.plugin.apiClient || !this.currentNoteId) return;
        await this.plugin.apiClient.patch(`/comments/${comment.id}/resolve`, { resolved: true });
        this.refresh();
      };
    }
  }

  private renderForm(parent: HTMLElement) {
    const form = parent.createEl('div');
    form.style.cssText = 'border-top: 1px solid var(--background-modifier-border); padding-top: 8px; margin-top: 8px;';

    const textarea = form.createEl('textarea', { placeholder: '添加评论...' });
    textarea.style.cssText = 'width: 100%; min-height: 60px; resize: vertical; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 6px; font-size: 13px; background: var(--background-primary);';

    const submitBtn = form.createEl('button', { text: '发送' });
    submitBtn.style.cssText = 'margin-top: 4px; padding: 4px 12px; border-radius: 4px; cursor: pointer; background: var(--interactive-accent); color: var(--text-on-accent); border: none; font-size: 12px;';
    submitBtn.onclick = async () => {
      const content = textarea.value.trim();
      if (!content || !this.plugin.apiClient || !this.currentNoteId) return;
      try {
        await this.plugin.apiClient.post(`/notes/${this.currentNoteId}/comments`, { content });
        textarea.value = '';
        this.refresh();
        new Notice('评论已发送');
      } catch {
        new Notice('发送评论失败');
      }
    };
  }
}
