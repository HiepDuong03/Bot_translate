import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';

const DATA_DIR = path.resolve('data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

export class ChannelService {
  constructor({
    autoTranslateAll = config.autoTranslateAll,
    initialEnabled = config.autoTranslateChannelIds,
    initialDisabled = config.ignoredChannelIds,
    storageFile = CHANNELS_FILE,
  } = {}) {
    this.autoTranslateAll = autoTranslateAll;
    this.storageFile = storageFile;
    this.enabledChannels = new Set(initialEnabled.map(String));
    this.disabledChannels = new Set(initialDisabled.map(String));
    this.load();
  }

  load() {
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

  save() {
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

  isEnabled(channelId) {
    const id = String(channelId);
    if (this.disabledChannels.has(id)) return false;
    if (this.autoTranslateAll) return true;
    return this.enabledChannels.has(id);
  }

  enable(channelId) {
    const id = String(channelId);
    const wasEnabled = this.isEnabled(id);
    this.disabledChannels.delete(id);
    this.enabledChannels.add(id);
    this.save();
    return !wasEnabled;
  }

  disable(channelId) {
    const id = String(channelId);
    const wasEnabled = this.isEnabled(id);
    this.enabledChannels.delete(id);
    this.disabledChannels.add(id);
    this.save();
    return wasEnabled;
  }

  listEnabled() {
    return [...this.enabledChannels];
  }

  listDisabled() {
    return [...this.disabledChannels];
  }
}

export const channelService = new ChannelService();
