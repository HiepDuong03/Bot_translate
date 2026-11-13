import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/env.js';

const DATA_DIR = path.resolve('data');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');

class ChannelService {
  constructor() {
    this.enabledChannels = new Set(config.autoTranslateChannelIds);
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(CHANNELS_FILE)) return;
      const raw = fs.readFileSync(CHANNELS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          this.enabledChannels.add(String(id));
        }
      }
    } catch (error) {
      console.error('[ChannelService] Failed to load channels.json:', error.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CHANNELS_FILE, JSON.stringify([...this.enabledChannels], null, 2), 'utf8');
    } catch (error) {
      console.error('[ChannelService] Failed to save channels.json:', error.message);
    }
  }

  isEnabled(channelId) {
    return this.enabledChannels.has(String(channelId));
  }

  enable(channelId) {
    const id = String(channelId);
    const added = !this.enabledChannels.has(id);
    this.enabledChannels.add(id);
    this.save();
    return added;
  }

  disable(channelId) {
    const id = String(channelId);
    const removed = this.enabledChannels.delete(id);
    this.save();
    return removed;
  }

  list() {
    return [...this.enabledChannels];
  }
}

export const channelService = new ChannelService();
