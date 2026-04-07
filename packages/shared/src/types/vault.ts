// Vault types / Vault 相关类型

export enum VaultType {
  PERSONAL = 'PERSONAL',
  TEAM = 'TEAM',
}

export interface VaultInfo {
  id: string;
  name: string;
  type: VaultType;
  teamId?: string;
  teamName?: string;
  ownerId: string;
  createdAt: string;
  noteCount: number;
}

export interface CreateVaultRequest {
  name: string;
  type: VaultType;
  teamId?: string; // Required when type is TEAM
}

export interface UpdateVaultRequest {
  name?: string;
}

/** Folder mapping config for plugin / 插件端文件夹映射配置 */
export interface VaultFolderMapping {
  vaultId: string;
  localFolder: string; // Local folder path in Obsidian vault
  remoteVaultName: string;
}
