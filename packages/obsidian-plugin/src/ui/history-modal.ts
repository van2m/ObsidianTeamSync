// Obsidian note history modal with diff and rollback / Obsidian 版本历史 Modal
import { Modal, Notice } from 'obsidian';
import type ObsidianTeamSyncPlugin from '../main';
import type { NoteHistoryEntry, DiffResult } from '@ots/shared';

export class HistoryModal extends Modal {
  private plugin: ObsidianTeamSyncPlugin;
  private noteId: string;
  private notePath: string;
  private history: NoteHistoryEntry[] = [];
  private diffResult: DiffResult | null = null;

  constructor(plugin: ObsidianTeamSyncPlugin, noteId: string, notePath: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.noteId = noteId;
    this.notePath = notePath;
  }

  async onOpen() {
    this.titleEl.setText(`版本历史: ${this.notePath}`);
    this.modalEl.style.width = '700px';
    this.modalEl.style.maxHeight = '80vh';

    await this.loadHistory();
    this.renderHistory();
  }

  onClose() {
    this.contentEl.empty();
  }

  private async loadHistory() {
    if (!this.plugin.apiClient) return;
    try {
      const res = await this.plugin.apiClient.get(`/notes/${this.noteId}/history`);
      this.history = (res as any).data ?? [];
    } catch {
      this.history = [];
    }
  }

  private renderHistory() {
    this.contentEl.empty();

    if (this.diffResult) {
      this.renderDiff();
      return;
    }

    if (this.history.length === 0) {
      this.contentEl.createEl('p', { text: '暂无历史记录', cls: 'mod-empty' });
      return;
    }

    for (const entry of this.history) {
      const card = this.contentEl.createEl('div');
      card.style.cssText = 'border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;';

      const info = card.createEl('div');
      const nameEl = info.createEl('span', { text: entry.editorName });
      nameEl.style.cssText = 'font-weight: 600; font-size: 13px;';
      const timeEl = info.createEl('span', { text: ` — ${new Date(entry.createdAt).toLocaleString('zh-CN')}` });
      timeEl.style.cssText = 'font-size: 12px; color: var(--text-muted);';

      const actions = card.createEl('div');
      actions.style.cssText = 'display: flex; gap: 4px;';

      const diffBtn = actions.createEl('button', { text: '对比' });
      diffBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; border: 1px solid var(--background-modifier-border); background: none;';
      diffBtn.onclick = () => this.showDiff(entry.id);

      const rollbackBtn = actions.createEl('button', { text: '回滚' });
      rollbackBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; border: 1px solid var(--background-modifier-border-hover); background: none; color: var(--text-error);';
      rollbackBtn.onclick = () => this.handleRollback(entry.id);
    }
  }

  private async showDiff(historyId: string) {
    if (!this.plugin.apiClient) return;
    try {
      const res = await this.plugin.apiClient.get(`/notes/${this.noteId}/diff?from=${historyId}&to=current`);
      this.diffResult = (res as any).data ?? res;
      this.renderHistory(); // re-render with diff
    } catch {
      new Notice('获取差异失败');
    }
  }

  private renderDiff() {
    this.contentEl.empty();
    const diff = this.diffResult!;

    const header = this.contentEl.createEl('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

    header.createEl('h3', { text: '版本对比' }).style.cssText = 'margin: 0; font-size: 14px;';
    const backBtn = header.createEl('button', { text: '← 返回列表' });
    backBtn.style.cssText = 'padding: 2px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; border: 1px solid var(--background-modifier-border); background: none;';
    backBtn.onclick = () => { this.diffResult = null; this.renderHistory(); };

    const diffContainer = this.contentEl.createEl('div');
    diffContainer.style.cssText = 'font-family: var(--font-monospace); font-size: 12px; border: 1px solid var(--background-modifier-border); border-radius: 4px; overflow: auto; max-height: 50vh;';

    if (diff.hunks.length === 0) {
      diffContainer.createEl('div', { text: '两个版本内容相同' }).style.cssText = 'padding: 16px; text-align: center; color: var(--text-muted);';
      return;
    }

    for (const hunk of diff.hunks) {
      const hunkHeader = diffContainer.createEl('div', { text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` });
      hunkHeader.style.cssText = 'padding: 4px 8px; background: var(--background-secondary); color: var(--text-muted);';

      for (const line of hunk.lines) {
        const lineEl = diffContainer.createEl('div');
        const prefix = line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ';
        lineEl.setText(prefix + line.content);
        lineEl.style.cssText = `padding: 1px 8px; white-space: pre-wrap; ${
          line.type === 'add' ? 'background: rgba(0, 180, 0, 0.1); color: var(--text-success);' :
          line.type === 'remove' ? 'background: rgba(255, 0, 0, 0.1); color: var(--text-error);' : ''
        }`;
      }
    }
  }

  private async handleRollback(historyId: string) {
    if (!this.plugin.apiClient) return;
    if (!confirm('确定要回滚到此版本吗？当前内容将被覆盖。')) return;

    try {
      await this.plugin.apiClient.post(`/notes/${this.noteId}/rollback`, { historyId });
      new Notice('已成功回滚');
      this.close();
    } catch {
      new Notice('回滚失败');
    }
  }
}
