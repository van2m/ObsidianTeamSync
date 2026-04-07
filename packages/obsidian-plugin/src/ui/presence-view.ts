// Obsidian online users sidebar view / Obsidian 在线用户侧边栏
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { UserPresenceData } from '@ots/shared';

export const PRESENCE_VIEW_TYPE = 'ots-presence-view';

export class PresenceView extends ItemView {
  private users = new Map<string, UserPresenceData>();

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() { return PRESENCE_VIEW_TYPE; }
  getDisplayText() { return 'OTS 在线用户'; }
  getIcon() { return 'users'; }

  async onOpen() {
    this.render();
  }

  async onClose() {}

  /** Update the user list */
  updateUsers(users: Map<string, UserPresenceData>) {
    this.users = new Map(users);
    this.render();
  }

  addUser(data: UserPresenceData) {
    this.users.set(data.userId, data);
    this.render();
  }

  removeUser(userId: string) {
    this.users.delete(userId);
    this.render();
  }

  updateEditing(userId: string, editingNotePath?: string) {
    const user = this.users.get(userId);
    if (user) {
      this.users.set(userId, { ...user, editingNotePath });
      this.render();
    }
  }

  private render() {
    const container = this.containerEl.children[1];
    container.empty();

    if (this.users.size === 0) {
      container.createEl('div', { text: '暂无在线用户', cls: 'pane-empty' });
      return;
    }

    const header = container.createEl('div');
    header.style.cssText = 'padding: 8px 12px; font-size: 12px; color: var(--text-muted); border-bottom: 1px solid var(--background-modifier-border);';
    header.setText(`${this.users.size} 位用户在线`);

    const list = container.createEl('div');
    for (const user of this.users.values()) {
      const item = list.createEl('div');
      item.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--background-modifier-border);';

      // Avatar circle
      const avatar = item.createEl('div');
      avatar.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; background: var(--interactive-accent); color: var(--text-on-accent); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;';
      avatar.setText(user.userName.charAt(0).toUpperCase());

      const info = item.createEl('div');

      const nameEl = info.createEl('div', { text: user.userName });
      nameEl.style.cssText = 'font-size: 13px; font-weight: 500;';

      if (user.editingNotePath) {
        const editingEl = info.createEl('div', { text: `编辑中: ${user.editingNotePath}` });
        editingEl.style.cssText = 'font-size: 10px; color: var(--text-muted);';
      }
    }
  }
}
