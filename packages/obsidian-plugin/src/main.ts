// ObsidianTeamSync Plugin Entry Point
// OTS Obsidian 插件入口
import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { Compartment } from '@codemirror/state';
import { ApiClient } from './lib/api-client';
import { SyncEngine } from './core/sync-engine';
import { VaultWatcher } from './core/vault-watcher';
import { CollabManager } from './collab/collab-manager';
import { createCollabExtension } from './collab/collab-extension';
import { CommentView, COMMENT_VIEW_TYPE } from './ui/comment-view';
import { PresenceView, PRESENCE_VIEW_TYPE } from './ui/presence-view';
import { HistoryModal } from './ui/history-modal';
import { OTSSettingTab, type OTSSettings, DEFAULT_SETTINGS } from './ui/settings-tab';
import { SyncAction, type UserPresenceData, type CommentNotifyData } from '@ots/shared';

export default class ObsidianTeamSyncPlugin extends Plugin {
  settings: OTSSettings = DEFAULT_SETTINGS;
  apiClient: ApiClient | null = null;
  syncEngine: SyncEngine | null = null;
  vaultWatcher: VaultWatcher | null = null;
  collabManager: CollabManager | null = null;
  private collabCompartment = new Compartment();
  private suppressTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async onload() {
    console.log('[OTS] Loading ObsidianTeamSync plugin');
    await this.loadSettings();

    // Add settings tab / 添加设置页
    this.addSettingTab(new OTSSettingTab(this.app, this));

    // Add ribbon icon / 添加侧边栏图标
    this.addRibbonIcon('users', 'ObsidianTeamSync', () => {
      new Notice('ObsidianTeamSync: Click settings to configure');
    });

    // Add status bar item / 添加状态栏
    const statusBarEl = this.addStatusBarItem();
    statusBarEl.setText('OTS: Disconnected');

    // Register sidebar views / 注册侧边栏视图
    this.registerView(COMMENT_VIEW_TYPE, (leaf) => new CommentView(leaf, this));
    this.registerView(PRESENCE_VIEW_TYPE, (leaf) => new PresenceView(leaf));

    // Register empty collab compartment for CM6 / 注册空的协同 Compartment
    this.registerEditorExtension(this.collabCompartment.of([]));

    // Auto-connect if configured / 如果已配置则自动连接
    if (this.settings.serverUrl && this.settings.token) {
      this.initializeSync(statusBarEl);
    }

    // Watch active editor changes for collab / 监听编辑器切换以管理协同
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.handleActiveLeafChange();
      })
    );

    // Add commands / 添加命令
    this.addCommand({
      id: 'ots-sync-now',
      name: 'Sync now',
      callback: () => {
        if (this.syncEngine?.isConnected) {
          this.syncEngine.requestSync();
          new Notice('OTS: Sync requested');
        } else {
          new Notice('OTS: Not connected');
        }
      },
    });

    this.addCommand({
      id: 'ots-reconnect',
      name: 'Reconnect to server',
      callback: () => {
        // Clean up all old instances to prevent leaks
        this.collabManager?.destroy();
        this.vaultWatcher?.stop();
        this.syncEngine?.disconnect();
        if (this.settings.serverUrl && this.settings.token) {
          this.initializeSync(statusBarEl);
        }
      },
    });

    this.addCommand({
      id: 'ots-show-comments',
      name: 'Show comments panel',
      callback: () => this.activateView(COMMENT_VIEW_TYPE),
    });

    this.addCommand({
      id: 'ots-show-online-users',
      name: 'Show online users',
      callback: () => this.activateView(PRESENCE_VIEW_TYPE),
    });

    this.addCommand({
      id: 'ots-show-history',
      name: 'Show note history',
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) { new Notice('OTS: 请先打开一篇笔记'); return; }
        // We need the noteId — fetch it via API
        if (!this.apiClient) return;
        this.apiClient.get(`/vaults/${this.settings.activeVaultId}/notes?page=1&limit=1&path=${encodeURIComponent(file.path)}`)
          .then((res: any) => {
            const notes = res.data?.items ?? res.items ?? [];
            if (notes.length > 0) {
              new HistoryModal(this, notes[0].id, file.path).open();
            } else {
              new Notice('OTS: 未找到此笔记的同步记录');
            }
          })
          .catch(() => new Notice('OTS: 获取笔记信息失败'));
      },
    });
  }

  async onunload() {
    console.log('[OTS] Unloading ObsidianTeamSync plugin');
    this.collabManager?.destroy();
    this.vaultWatcher?.stop();
    this.syncEngine?.disconnect();
  }

  /** Initialize sync connection / 初始化同步连接 */
  initializeSync(statusBarEl: HTMLElement) {
    // Create API client
    this.apiClient = new ApiClient(this.settings.serverUrl);
    this.apiClient.setToken(this.settings.token);

    // Create sync engine
    this.syncEngine = new SyncEngine(
      {
        serverUrl: this.settings.serverUrl,
        token: this.settings.token,
        vaultId: this.settings.activeVaultId || '',
        deviceId: this.getDeviceId(),
      },
      {
        onConnected: () => {
          statusBarEl.setText('OTS: Connected ✓');
          new Notice('OTS: Connected to server');
        },
        onDisconnected: () => {
          statusBarEl.setText('OTS: Disconnected');
        },
        onNoteModified: async (data) => {
          await this.applyRemoteChange(data);
        },
        onNoteDeleted: async (data) => {
          await this.applyRemoteDeletion(data);
        },
        onUserOnline: (data) => {
          const presenceView = this.getPresenceView();
          if (presenceView) presenceView.addUser(data as UserPresenceData);
          this.updateOnlineCount(statusBarEl);
        },
        onUserOffline: (data) => {
          const presenceView = this.getPresenceView();
          if (presenceView) presenceView.removeUser(data.userId);
          this.updateOnlineCount(statusBarEl);
        },
        onError: (err) => {
          console.error('[OTS] Sync error:', err);
          statusBarEl.setText('OTS: Error');
        },
      }
    );

    // Create collab manager / 创建协同管理器
    this.collabManager = new CollabManager();
    this.collabManager.setSendBinary((data) => this.syncEngine?.sendBinary(data));
    this.syncEngine.setBinaryMessageHandler((data) => this.collabManager?.handleBinaryMessage(data));

    // Create vault watcher
    this.vaultWatcher = new VaultWatcher(
      this.app.vault,
      this.syncEngine,
      this.settings.syncFolders
    );
    this.vaultWatcher.setCollabManager(this.collabManager);

    // Connect and start watching
    this.syncEngine.connect();
    this.vaultWatcher.start();
  }

  /** Apply remote note change to local vault / 将远程笔记变更应用到本地 */
  private async applyRemoteChange(data: {
    path: string;
    content: string;
    mtime: number;
    editorName?: string;
  }) {
    // Suppress watcher to prevent sync loop / 抑制 watcher 防止同步回环 (L-03 fix)
    this.vaultWatcher?.suppressPath(data.path);
    try {
      const existingFile = this.app.vault.getAbstractFileByPath(data.path);
      if (existingFile instanceof TFile) {
        if (existingFile.stat.mtime >= data.mtime) return;
        await this.app.vault.modify(existingFile, data.content);
      } else {
        // Create file and parent folders / 创建文件及父目录
        await this.ensureParentDirs(data.path);
        await this.app.vault.create(data.path, data.content);
      }
    } catch (err) {
      console.error('[OTS] Failed to apply remote change:', data.path, err);
    } finally {
      // Cancel previous unsuppress timer for same path to prevent early unsuppress
      const existingTimer = this.suppressTimers.get(data.path);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        this.vaultWatcher?.unsuppressPath(data.path);
        this.suppressTimers.delete(data.path);
      }, 1000);
      this.suppressTimers.set(data.path, timer);
    }
  }

  /** Apply remote deletion to local vault / 将远程删除应用到本地 */
  private async applyRemoteDeletion(data: { path: string; mtime: number }) {
    this.vaultWatcher?.suppressPath(data.path);
    try {
      const file = this.app.vault.getAbstractFileByPath(data.path);
      if (file instanceof TFile) {
        await this.app.vault.trash(file, true);
      }
    } catch (err) {
      console.error('[OTS] Failed to apply remote deletion:', data.path, err);
    } finally {
      setTimeout(() => this.vaultWatcher?.unsuppressPath(data.path), 1000);
    }
  }

  /** Handle active editor leaf change — join/leave collab sessions */
  private handleActiveLeafChange(): void {
    if (!this.collabManager || !this.syncEngine?.isConnected) return;

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = activeView?.file;
    const currentSession = this.collabManager.getActiveSession();

    // If same file, nothing to do
    if (currentSession?.path === activeFile?.path) return;

    // Leave current collab session
    // Note: The previous editor's CM6 Compartment will be reconfigured to []
    // when we reconfigure the new editor, or via the Compartment being global.
    // We reconfigure ALL editors to empty first to clean up any stale extension.
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const cm = (view.editor as any).cm;
        if (cm) {
          try {
            cm.dispatch({ effects: this.collabCompartment.reconfigure([]) });
          } catch { /* editor may be destroyed */ }
        }
      }
    });
    if (currentSession) {
      this.collabManager.leaveCurrentNote();
    }

    // Join new collab if viewing a markdown file
    if (activeFile && activeFile.path.endsWith('.md') && activeView) {
      const session = this.collabManager.joinNote(activeFile.path);
      if (session) {
        const ytext = session.doc.getText('content');
        const userName = this.settings.userName || 'Anonymous';

        // Wait for initial Yjs sync before attaching CM6 extension
        setTimeout(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || view.file?.path !== activeFile.path) return;

          const cm = (view.editor as any).cm;
          if (cm) {
            const ext = createCollabExtension(ytext, session.provider.awareness, { name: userName });
            cm.dispatch({ effects: this.collabCompartment.reconfigure(ext) });
          }
        }, 300);
      }
    }
  }

  /** Recursively ensure parent directories exist / 递归确保父目录存在 (L-04 fix) */
  private async ensureParentDirs(filePath: string) {
    const parts = filePath.split('/');
    parts.pop(); // remove filename
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  /** Activate a sidebar view */
  private async activateView(viewType: string) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(viewType)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({ type: viewType, active: true });
      }
    }
    if (leaf) workspace.revealLeaf(leaf);
  }

  /** Get PresenceView instance */
  private getPresenceView(): PresenceView | null {
    const leaves = this.app.workspace.getLeavesOfType(PRESENCE_VIEW_TYPE);
    return leaves.length > 0 ? (leaves[0].view as PresenceView) : null;
  }

  /** Update online user count in status bar */
  private updateOnlineCount(statusBarEl: HTMLElement) {
    const presenceView = this.getPresenceView();
    if (presenceView && this.syncEngine?.isConnected) {
      statusBarEl.setText('OTS: Connected ✓');
    }
  }

  /** Get or generate device ID / 获取或生成设备 ID */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('ots-device-id');
    if (!deviceId) {
      deviceId = 'dev-' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('ots-device-id', deviceId);
    }
    return deviceId;
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
