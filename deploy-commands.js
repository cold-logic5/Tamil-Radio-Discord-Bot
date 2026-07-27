const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config.json');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('Error: DISCORD_TOKEN and CLIENT_ID must be set in your .env file.');
  process.exit(1);
}

// Build choices for stations based on config.json
const stationChoices = Object.keys(config.stations).map(key => ({
  name: `${config.stations[key].name} (${key})`,
  value: key
}));

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Start playing a Tamil radio station')
    .addStringOption(option =>
      option.setName('station')
        .setDescription('Select a radio station')
        .setRequired(false)
        .addChoices(...stationChoices)
    ),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and disconnect the radio bot'),

  new SlashCommandBuilder()
    .setName('stations')
    .setDescription('List all available Tamil radio stations'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check current radio status and playback state'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help and instructions for the Tamil Radio bot')
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    if (guildId) {
      // Register commands to a specific guild (Instant update for development)
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`Successfully registered ${data.length} guild slash commands for Guild ID: ${guildId}`);
    } else {
      // Register global commands (May take up to 1 hour to propagate across Discord)
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`Successfully registered ${data.length} global slash commands.`);
    }
  } catch (error) {
    console.error('Error deploying slash commands:', error);
  }
})();
