// Plugin settings tab / 插件设置页
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ObsidianTeamSyncPlugin from '../main';

export interface OTSSettings {
  serverUrl: string;
  token: string;
  activeVaultId: string;
  syncFolders: string[]; // Folders to sync / 要同步的文件夹
  userName: string;
  userEmail: string;
}

export const DEFAULT_SETTINGS: OTSSettings = {
  serverUrl: '',
  token: '',
  activeVaultId: '',
  syncFolders: [],
  userName: '',
  userEmail: '',
};

export class OTSSettingTab extends PluginSettingTab {
  plugin: ObsidianTeamSyncPlugin;

  constructor(app: App, plugin: ObsidianTeamSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'ObsidianTeamSync Settings' });

    // ==================== Connection / 连接设置 ====================

    containerEl.createEl('h3', { text: '🔗 Server Connection / 服务器连接' });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('OTS server address (e.g., http://localhost:9000)')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:9000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auth Token')
      .setDesc('JWT authentication token / JWT 认证令牌')
      .addText((text) =>
        text
          .setPlaceholder('Paste your token here')
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Test Connection')
      .setDesc('Verify server connectivity / 验证服务器连接')
      .addButton((btn) =>
        btn.setButtonText('Test').onClick(async () => {
          try {
            const { ApiClient } = await import('../lib/api-client');
            const client = new ApiClient(this.plugin.settings.serverUrl);
            const health = await client.health();
            new Notice(`✅ Connected! Server v${health.version}`);
          } catch (err) {
            new Notice(`❌ Connection failed: ${err}`);
          }
        })
      );

    // ==================== Login / 登录 ====================

    containerEl.createEl('h3', { text: '👤 Account / 账号' });

    if (this.plugin.settings.token) {
      new Setting(containerEl)
        .setName('Logged in as')
        .setDesc(
          this.plugin.settings.userName
            ? `${this.plugin.settings.userName} (${this.plugin.settings.userEmail})`
            : 'Token configured'
        )
        .addButton((btn) =>
          btn
            .setButtonText('Logout')
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.token = '';
              this.plugin.settings.userName = '';
              this.plugin.settings.userEmail = '';
              await this.plugin.saveSettings();
              this.plugin.syncEngine?.disconnect();
              this.display();
            })
        );
    } else {
      let emailInput = '';
      let passwordInput = '';

      new Setting(containerEl)
        .setName('Email')
        .addText((text) => text.setPlaceholder('email@example.com').onChange((v) => { emailInput = v; }));

      new Setting(containerEl)
        .setName('Password')
        .addText((text) => {
          text.setPlaceholder('Password').onChange((v) => { passwordInput = v; });
          text.inputEl.type = 'password';
        });

      new Setting(containerEl)
        .addButton((btn) =>
          btn.setButtonText('Login').setCta().onClick(async () => {
            try {
              const { ApiClient } = await import('../lib/api-client');
              const client = new ApiClient(this.plugin.settings.serverUrl);
              const result = await client.login({ email: emailInput, password: passwordInput });
              this.plugin.settings.token = result.token;
              this.plugin.settings.userName = result.user.name;
              this.plugin.settings.userEmail = result.user.email;
              await this.plugin.saveSettings();
              new Notice('✅ Login successful!');
              this.display();
            } catch (err) {
              new Notice(`❌ Login failed: ${err}`);
            }
          })
        )
        .addButton((btn) =>
          btn.setButtonText('Register').onClick(async () => {
            new Notice('Register via the web management panel');
          })
        );
    }

    // ==================== Sync / 同步设置 ====================

    containerEl.createEl('h3', { text: '📂 Sync Configuration / 同步配置' });

    new Setting(containerEl)
      .setName('Active Vault ID')
      .setDesc('The remote vault to sync with / 要同步的远程 Vault ID')
      .addText((text) =>
        text
          .setPlaceholder('Vault ID')
          .setValue(this.plugin.settings.activeVaultId)
          .onChange(async (value) => {
            this.plugin.settings.activeVaultId = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Sync Folders')
      .setDesc('Folders to sync, comma-separated. Empty = sync all. / 要同步的文件夹，逗号分隔，留空=全部同步')
      .addText((text) =>
        text
          .setPlaceholder('Team-Wiki, Team-Project')
          .setValue(this.plugin.settings.syncFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.syncFolders = value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.plugin.vaultWatcher?.updateWatchedFolders(this.plugin.settings.syncFolders);
          })
      );

    // ==================== Status / 状态 ====================

    containerEl.createEl('h3', { text: '📊 Status / 状态' });

    const status = this.plugin.syncEngine?.isConnected ? '🟢 Connected' : '🔴 Disconnected';
    containerEl.createEl('p', { text: `Sync status: ${status}` });
  }
}
