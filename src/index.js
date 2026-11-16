import http from 'node:http';
import { Client, Events, GatewayIntentBits, Partials, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config/env.js';
import { commandDefinitions, handleSlashCommand } from './commands/translateCommands.js';
import { disposeMessageHandler, handleMessageCreate } from './events/messageCreate.js';
import { channelService } from './services/channelService.js';

validateConfig();

const PORT = process.env.PORT || 8080;
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Discord Translate Bot v2 (Instant) is Online 24/7!');
});
httpServer.listen(PORT, () => {
  console.log(`[HTTP] Health check server listening on port: ${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

async function registerCommands() {
  const rest = new REST().setToken(config.discordToken);
  const body = commandDefinitions.map((cmd) => cmd.toJSON());

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`[Commands] Registered ${body.length} guild slash commands for guild ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`[Commands] Registered ${body.length} global slash commands.`);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Bot] Logged in as ${readyClient.user.tag}`);
  console.log(
    `[Bot] Model: ${config.geminiModel} (fallbacks: ${config.geminiFallbackModels.join(', ') || 'none'}) | ` +
    `Keys: ${config.geminiApiKeys.length} | AutoAll: ${config.autoTranslateAll} | ` +
    `Batch: ${config.batchDebounceMs}ms | Context: ${config.contextMaxMessages}`
  );
  try {
    await registerCommands();
  } catch (error) {
    console.error('[Commands] Failed to register slash commands:', error.message);
  }
});

client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleSlashCommand(interaction);
  } catch (error) {
    console.error('[Interaction] Error handling command:', error);
  }
});

let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Bot] Received ${signal}. Shutting down gracefully...`);
  disposeMessageHandler();
  channelService.close();
  client.destroy();
  httpServer.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function bootstrap() {
  await channelService.init();
  await client.login(config.discordToken);
}

bootstrap().catch((error) => {
  console.error('[Bot] Fatal startup error:', error);
  process.exit(1);
});
