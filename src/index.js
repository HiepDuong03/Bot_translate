import http from 'node:http';
import { Client, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { config, validateConfig } from './config/env.js';
import { commandDefinitions, handleSlashCommand } from './commands/translateCommands.js';
import { handleMessageCreate } from './events/messageCreate.js';

validateConfig();

const PORT = process.env.PORT || 8080;
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Discord Translate Bot is Online 24/7!');
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
  console.log(`[Bot] Model: ${config.geminiModel} | Loaded ${config.geminiApiKeys.length} Gemini API key(s).`);
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

client.login(config.discordToken);
