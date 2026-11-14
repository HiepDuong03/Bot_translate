import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { config } from '../config/env.js';
import { channelService } from '../services/channelService.js';
import { keyPool } from '../services/geminiService.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('translate-on')
    .setDescription('Bật tự động dịch song song Hàn ⇄ Việt trong kênh này')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('translate-off')
    .setDescription('Tắt tự động dịch song song trong kênh này')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('key-status')
    .setDescription('Kiểm tra trạng thái các Gemini API Key, Model và kênh hiện tại')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

export async function handleSlashCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, channelId } = interaction;

  if (commandName === 'translate-on') {
    const added = channelService.enable(channelId);
    const msg = added
      ? '✅ Đã **BẬT** tự động dịch song song Hàn ⇄ Việt cho kênh này.'
      : 'ℹ️ Kênh này đã được bật dịch tự động từ trước rồi.';
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }

  if (commandName === 'translate-off') {
    const removed = channelService.disable(channelId);
    const msg = removed
      ? '🛑 Đã **TẮT** tự động dịch cho kênh này.'
      : 'ℹ️ Kênh này hiện chưa bật dịch tự động.';
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }

  if (commandName === 'key-status') {
    const channelEnabled = channelService.isEnabled(channelId);
    const statuses = keyPool.getStatus();
    const modeLabel = config.autoTranslateAll
      ? 'Tự động dịch mọi kênh bot tham gia (tắt riêng bằng `/translate-off`)'
      : 'Chỉ dịch các kênh được bật (`/translate-on`)';

    const lines = statuses.map(
      (k) => `• **Key #${k.id}** (\`${k.maskedKey}\`): **${k.status}** | Thành công: \`${k.successCount}\` | Lỗi: \`${k.errorCount}\``
    );

    const modelsLabel = [config.geminiModel, ...config.geminiFallbackModels].join(' → ');

    const summary = [
      `**Trạng thái kênh hiện tại:** ${channelEnabled ? '🟢 Đang BẬT dịch tự động' : '⚪ Đang TẮT'}`,
      `**Chế độ kênh:** ${modeLabel}`,
      `**Model (Ưu tiên → Dự phòng):** \`${modelsLabel}\``,
      `**Danh sách Gemini API Keys (${statuses.length} key):**`,
      lines.length > 0 ? lines.join('\n') : '_Chưa cấu hình API Key nào._',
    ].join('\n\n');

    await interaction.reply({ content: summary, flags: MessageFlags.Ephemeral });
  }
}
