import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { config } from '../config/env.js';

const DATA_DIR = path.resolve('data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

export class ChannelService {
  constructor({
    autoTranslateAll = config.autoTranslateAll,
    initialEnabled = config.autoTranslateChannelIds,
    initialDisabled = config.ignoredChannelIds,
    storageFile = CHANNELS_FILE,
    tursoUrl = config.tursoDatabaseUrl,
    tursoAuthToken = config.tursoAuthToken,
  } = {}) {
    this.autoTranslateAll = autoTranslateAll;
    this.storageFile = storageFile;
    this.enabledChannels = new Set(initialEnabled.map(String));
    this.disabledChannels = new Set(initialDisabled.map(String));
    this.db = tursoUrl
      ? createClient({ url: tursoUrl, authToken: tursoAuthToken || undefined })
      : null;

    this.loadLocal();
  }

  async init() {
    if (!this.db) {
      const mode = this.storageFile ? `Local JSON (${this.storageFile})` : 'In-memory';
      console.log(`[ChannelService] Storage mode: ${mode}`);
      return;
    }

    try {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS channel_settings (
          channel_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      const res = await this.db.execute('SELECT channel_id, status FROM channel_settings');
      for (const row of res.rows) {
        const id = String(row.channel_id);
        if (row.status === 'enabled') {
          this.disabledChannels.delete(id);
          this.enabledChannels.add(id);
        } else if (row.status === 'disabled') {
          this.enabledChannels.delete(id);
          this.disabledChannels.add(id);
        }
      }
      console.log(`[ChannelService] Connected to Turso Cloud DB (${res.rows.length} channel rule(s) loaded).`);
    } catch (error) {
      console.error('[ChannelService] Turso init failed, continuing with local/env config:', error.message);
    }
  }

  loadLocal() {
    if (!this.storageFile) return;
    try {
      if (!fs.existsSync(this.storageFile)) return;
      const raw = fs.readFileSync(this.storageFile, 'utf8');
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          this.enabledChannels.add(String(id));
        }
        return;
      }

      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.enabled)) {
          for (const id of parsed.enabled) this.enabledChannels.add(String(id));
        }
        if (Array.isArray(parsed.disabled)) {
          for (const id of parsed.disabled) this.disabledChannels.add(String(id));
        }
      }
    } catch (error) {
      console.error('[ChannelService] Failed to load channels.json:', error.message);
    }
  }

  saveLocal() {
    if (!this.storageFile) return;
    try {
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const payload = {
        enabled: [...this.enabledChannels],
        disabled: [...this.disabledChannels],
      };
      fs.writeFileSync(this.storageFile, JSON.stringify(payload, null, 2), 'utf8');
    } catch (error) {
      console.error('[ChannelService] Failed to save channels.json:', error.message);
    }
  }

  async persistToTurso(channelId, status) {
    if (!this.db) return;
    try {
      await this.db.execute({
        sql: `INSERT INTO channel_settings (channel_id, status, updated_at)
              VALUES (?, ?, ?)
              ON CONFLICT(channel_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
        args: [String(channelId), status, Date.now()],
      });
    } catch (error) {
      console.error('[ChannelService] Failed to persist channel to Turso:', error.message);
    }
  }

  isEnabled(channelId) {
    const id = String(channelId);
    if (this.disabledChannels.has(id)) return false;
    if (this.autoTranslateAll) return true;
    return this.enabledChannels.has(id);
  }

  async enable(channelId) {
    const id = String(channelId);
    const wasEnabled = this.isEnabled(id);
    this.disabledChannels.delete(id);
    this.enabledChannels.add(id);
    this.saveLocal();
    await this.persistToTurso(id, 'enabled');
    return !wasEnabled;
  }

  async disable(channelId) {
    const id = String(channelId);
    const wasEnabled = this.isEnabled(id);
    this.enabledChannels.delete(id);
    this.disabledChannels.add(id);
    this.saveLocal();
    await this.persistToTurso(id, 'disabled');
    return wasEnabled;
  }

  listEnabled() {
    return [...this.enabledChannels];
  }

  listDisabled() {
    return [...this.disabledChannels];
  }

  close() {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}

export const channelService = new ChannelService();
