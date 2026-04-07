// Vault file watcher / Vault 文件监听器
// Watches local file changes and sends them to the sync engine
import { type Vault, TFile, TFolder, type EventRef } from 'obsidian';
import type { SyncEngine } from './sync-engine';
import type { CollabManager } from '../collab/collab-manager';

export class VaultWatcher {
  private vault: Vault;
  private syncEngine: SyncEngine;
  private watchedFolders: Set<string>;
  private eventRefs: EventRef[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Paths to ignore (remote changes being applied) / 忽略列表（正在应用远程变更） L-03 fix */
  private ignorePaths = new Set<string>();
  private collabManager: CollabManager | null = null;

  constructor(vault: Vault, syncEngine: SyncEngine, watchedFolders: string[]) {
    this.vault = vault;
    this.syncEngine = syncEngine;
    this.watchedFolders = new Set(watchedFolders);
  }

  /** Set collab manager for checking active collab sessions */
  setCollabManager(cm: CollabManager): void {
    this.collabManager = cm;
  }

  /** Temporarily ignore a path (used when applying remote changes) / 临时忽略路径 */
  suppressPath(path: string) {
    this.ignorePaths.add(path);
  }

  /** Remove path from ignore list / 取消忽略 */
  unsuppressPath(path: string) {
    this.ignorePaths.delete(path);
  }

  /** Start watching file changes / 开始监听文件变更 */
  start() {
    // Watch file modifications / 监听文件修改
    this.eventRefs.push(
      this.vault.on('modify', (file) => {
        if (file instanceof TFile && this.shouldSync(file.path)) {
          this.debouncedSync(file);
        }
      })
    );

    // Watch file creation / 监听文件创建
    this.eventRefs.push(
      this.vault.on('create', (file) => {
        if (file instanceof TFile && this.shouldSync(file.path)) {
          this.debouncedSync(file);
        }
      })
    );

    // Watch file deletion / 监听文件删除
    this.eventRefs.push(
      this.vault.on('delete', (file) => {
        if (file instanceof TFile && this.shouldSync(file.path)) {
          this.syncEngine.sendNoteDelete(file.path);
        }
      })
    );

    // Watch file rename / 监听文件重命名
    this.eventRefs.push(
      this.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile) {
          if (this.shouldSync(oldPath)) {
            this.syncEngine.sendNoteDelete(oldPath);
          }
          if (this.shouldSync(file.path)) {
            this.debouncedSync(file);
          }
        }
      })
    );
  }

  /** Stop watching / 停止监听 */
  stop() {
    for (const ref of this.eventRefs) {
      this.vault.offref(ref);
    }
    this.eventRefs = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /** Update watched folders / 更新监听的文件夹 */
  updateWatchedFolders(folders: string[]) {
    this.watchedFolders = new Set(folders);
  }

  /** Check if a file path should be synced / 检查文件路径是否需要同步 */
  private shouldSync(path: string): boolean {
    // Skip suppressed paths (remote changes being applied) / 跳过被抑制的路径
    if (this.ignorePaths.has(path)) return false;

    // Skip files being collaboratively edited (Yjs handles sync) / 跳过协同编辑中的文件
    if (this.collabManager?.isCollabActive(path)) return false;

    // Only sync markdown files / 只同步 Markdown 文件
    if (!path.endsWith('.md')) return false;

    // Check if file is in a watched folder / 检查文件是否在监听的文件夹中
    if (this.watchedFolders.size === 0) return true; // Sync all if no folder filter
    for (const folder of this.watchedFolders) {
      if (path.startsWith(folder + '/') || path === folder) return true;
    }
    return false;
  }

  /** Debounced file sync - wait 500ms after last change / 防抖同步 - 最后一次修改后等 500ms */
  private debouncedSync(file: TFile) {
    const existing = this.debounceTimers.get(file.path);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      file.path,
      setTimeout(async () => {
        this.debounceTimers.delete(file.path);
        try {
          const content = await this.vault.read(file);
          this.syncEngine.sendNoteModify(file.path, content, file.stat.mtime);
        } catch (err) {
          console.error('[OTS] Failed to read file for sync:', file.path, err);
        }
      }, 500)
    );
  }
}
