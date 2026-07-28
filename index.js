const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder,
  MessageFlags,
  Events
} = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  NoSubscriberBehavior, 
  AudioPlayerStatus, 
  VoiceConnectionStatus, 
  StreamType,
  entersState 
} = require('@discordjs/voice');
const ffmpeg = require('ffmpeg-static');
const prism = require('prism-media');
const { spawn } = require('child_process');
const config = require('./config.json');
require('dotenv').config();

// Token & Target Channel Config
const token = process.env.DISCORD_TOKEN;
const targetChannelId = process.env.TARGET_CHANNEL_ID || config.targetChannelId;

if (!token) {
  console.error('CRITICAL ERROR: DISCORD_TOKEN is missing in environment variables or .env file!');
  console.error('Please copy .env.example to .env and insert your bot token.');
  process.exit(1);
}

// Create Discord Client
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildVoiceStates, 
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

// Create global Audio Player
const player = createAudioPlayer({
  behaviors: { 
    noSubscriber: NoSubscriberBehavior.Play 
  }
});

let currentConnection = null;
let currentStationKey = config.defaultStation || 'rahman';
let currentChannelId = null;
let reconnectTimer = null;
let activeFfmpegProcess = null;
let leaveTimer = null;
let backgroundRetryTimer = null;

const http = require('http');
const PORT = process.env.PORT || 10000;

// Health-check HTTP server to satisfy Render port detection
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Tamil Radio Discord Bot is running online!\n');
}).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// Helper: Play a station by key
function playStation(stationKey) {
  const station = config.stations[stationKey] || config.stations[config.defaultStation];
  if (!station) {
    console.error(`Station key "${stationKey}" not found in config.json`);
    return false;
  }

  // Destroy previous FFmpeg stream if active
  if (activeFfmpegProcess) {
    try {
      if (typeof activeFfmpegProcess.destroy === 'function') {
        activeFfmpegProcess.destroy();
      } else {
        activeFfmpegProcess.kill('SIGKILL');
      }
    } catch (e) {}
    activeFfmpegProcess = null;
  }

  try {
    console.log(`[FFmpeg Prism] Streaming station [${stationKey}]: ${station.url}`);

    const ffmpegStream = new prism.FFmpeg({
      args: [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '-i', station.url,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-vbr', 'on',
        '-compression_level', '10',
        '-application', 'audio',
        '-ar', '48000',
        '-ac', '2',
        '-f', 'ogg'
      ]
    });

    activeFfmpegProcess = ffmpegStream;

    ffmpegStream.on('error', err => {
      console.error(`[FFmpeg Prism Error] Station [${stationKey}]:`, err.message);
    });

    const resource = createAudioResource(ffmpegStream, {
      inputType: StreamType.OggOpus,
      metadata: {
        title: station.name,
        key: stationKey
      }
    });

    player.play(resource);
    currentStationKey = stationKey;
    console.log(`Now streaming station: [${stationKey}] ${station.name} (${station.url})`);
    return station;
  } catch (err) {
    console.error(`Failed to create audio resource for ${station.name}:`, err);
    return false;
  }
}

// Helper: Join voice channel with exponential backoff for ECONNREFUSED resilience
async function connectToVoiceChannel(channel, retries = 5, baseDelay = 5000) {
  if (currentConnection && currentChannelId === channel.id && currentConnection.state?.status === VoiceConnectionStatus.Ready) {
    return currentConnection;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Fully tear down any stale connection before each attempt
      if (currentConnection) {
        try { currentConnection.destroy(); } catch (e) {}
        currentConnection = null;
        currentChannelId = null;
      }

      console.log(`[Voice Connection] Attempt ${attempt}/${retries} to connect to channel: ${channel.name} (${channel.id})`);

      currentConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false
      });

      currentChannelId = channel.id;

      currentConnection.on('stateChange', (oldState, newState) => {
        console.log(`[Voice Connection] Connection state changed from ${oldState.status} to ${newState.status}`);
      });

      currentConnection.on('debug', msg => {
        console.log(`[Voice Debug] ${msg}`);
      });

      currentConnection.on(VoiceConnectionStatus.Disconnected, async () => {
        console.warn(`Voice connection disconnected from channel ${channel.id}. Attempting reconnect...`);
        try {
          await Promise.race([
            entersState(currentConnection, VoiceConnectionStatus.Signalling, 5000),
            entersState(currentConnection, VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch (e) {
          console.error('Failed to reconnect voice connection. Cleaning up connection state.');
          if (currentConnection) {
            try { currentConnection.destroy(); } catch (err) {}
            currentConnection = null;
            currentChannelId = null;
          }
        }
      });

      console.log(`[Voice Connection] Waiting for connection to reach Ready state (attempt ${attempt})...`);
      await entersState(currentConnection, VoiceConnectionStatus.Ready, 20_000);
      console.log(`[Voice Connection] Connection successfully reached READY state on attempt ${attempt}!`);
      currentConnection.subscribe(player);
      return currentConnection;

    } catch (error) {
      console.warn(`[Voice Connection Warning] Attempt ${attempt}/${retries} failed: ${error.code || error.message || error}`);
      if (currentConnection) {
        try { currentConnection.destroy(); } catch (e) {}
        currentConnection = null;
        currentChannelId = null;
      }

      if (attempt < retries) {
        // Exponential backoff: 5s, 10s, 20s, 40s
        const backoff = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[Voice Connection] Retrying in ${backoff / 1000}s (exponential backoff)...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      } else {
        console.error(`[Voice Connection Error] All ${retries} connection attempts failed.`);
        throw error;
      }
    }
  }
}

// Helper: Background retry loop — keeps trying to connect while users are in the channel
function scheduleBackgroundRetry(channel) {
  // Clear any existing background retry
  if (backgroundRetryTimer) {
    clearTimeout(backgroundRetryTimer);
    backgroundRetryTimer = null;
  }

  backgroundRetryTimer = setTimeout(async () => {
    backgroundRetryTimer = null;

    // Abort if bot is already connected
    if (currentConnection && currentConnection.state?.status === VoiceConnectionStatus.Ready) {
      console.log('[Background Retry] Bot is already connected, skipping retry.');
      return;
    }

    // Abort if no humans are left in the target channel
    const freshChannel = channel.guild.channels.cache.get(channel.id);
    if (!freshChannel) return;
    const humanMembers = freshChannel.members.filter(m => !m.user.bot).size;
    if (humanMembers === 0) {
      console.log('[Background Retry] No humans in channel anymore, stopping retry.');
      return;
    }

    console.log(`[Background Retry] ${humanMembers} humans still in channel. Attempting connection...`);
    try {
      await connectToVoiceChannel(freshChannel);
      playStation(currentStationKey);
      console.log('[Background Retry] Successfully connected!');
    } catch (err) {
      console.error('[Background Retry] Connection attempt failed:', err.code || err.message);
      // Schedule another background retry
      scheduleBackgroundRetry(channel);
    }
  }, 15_000); // Wait 15 seconds before each background retry cycle

  console.log('[Background Retry] Scheduled next connection attempt in 15s...');
}

// Player status monitoring
player.on(AudioPlayerStatus.Playing, () => {
  console.log(`Audio Player State: PLAYING (${config.stations[currentStationKey]?.name})`);
});

player.on(AudioPlayerStatus.Idle, () => {
  console.log('Audio Player State: IDLE. Stream ended or stopped.');
});

player.on('error', error => {
  console.error(`Audio Player Stream Error (${currentStationKey}):`, error.message);
  // Auto retry station after 3 seconds on stream error / drop
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (currentConnection) {
      console.log(`Attempting to restart stream for station: ${currentStationKey}...`);
      playStation(currentStationKey);
    }
  }, 3000);
});

// Event: Client Ready
client.on(Events.ClientReady, () => {
  console.log('=====================================================');
  console.log(`📻 Tamil Radio Bot initialized as ${client.user.tag}`);
  console.log(`Target Voice Channel ID: ${targetChannelId || 'Not Configured (Slash mode)'}`);
  console.log(`Default Station: ${config.stations[currentStationKey]?.name}`);
  console.log('=====================================================');

  client.user.setActivity('📡 Tamil Radio 24/7 | /help', { type: 3 }); // ActivityType.Watching
});

// Event: Voice State Updates (Auto-Join & Auto-Leave logic)
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Ignore bot's own voice state updates to prevent state loop
  if (newState.member?.user.bot) return;

  console.log(`[Voice State] Member ${newState.member?.user.tag} updated voice state. Old channel: ${oldState.channelId}, New channel: ${newState.channelId}`);
  if (!targetChannelId) return; // Skip auto-join if target channel is not configured

  // Check if voice update happened in target channel
  if (newState.channelId === targetChannelId || oldState.channelId === targetChannelId) {
    const guild = newState.guild || oldState.guild;
    const channel = guild.channels.cache.get(targetChannelId);

    if (!channel) return;

    // Count human members in target channel
    const humanMembers = channel.members.filter(member => !member.user.bot).size;
    console.log(`[Voice State] Target channel check: ${channel.name} has ${humanMembers} human members.`);

    // If humans join target channel
    if (humanMembers >= 1) {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
        console.log('[Voice State] Member present in channel. Cancelled auto-disconnect timer.');
      }

      if (!currentConnection) {
        console.log(`User joined target voice channel (${channel.name}). Auto-connecting bot...`);
        try {
          await connectToVoiceChannel(channel);
          playStation(currentStationKey);
        } catch (err) {
          console.error('Failed to auto-connect to voice channel:', err.code || err.message);
          // All initial retries failed — schedule a background retry loop
          // so the bot keeps trying while users are in the channel
          scheduleBackgroundRetry(channel);
        }
      }
    } 
    // If no humans left in channel, set 5-second grace timer before disconnecting
    else if (humanMembers === 0 && currentConnection && currentChannelId === targetChannelId) {
      // Cancel any background retry — no one to play for
      if (backgroundRetryTimer) {
        clearTimeout(backgroundRetryTimer);
        backgroundRetryTimer = null;
        console.log('[Voice State] Cancelled background retry — channel is empty.');
      }

      if (!leaveTimer) {
        console.log(`[Voice State] Target channel (${channel.name}) is empty. Starting 5-second auto-disconnect timer...`);
        leaveTimer = setTimeout(() => {
          const recheckHumans = channel.members.filter(m => !m.user.bot).size;
          if (recheckHumans === 0 && currentConnection) {
            console.log(`[Voice State] Target channel (${channel.name}) still empty after grace period. Auto-disconnecting...`);
            if (activeFfmpegProcess) {
              try { activeFfmpegProcess.kill('SIGKILL'); } catch (e) {}
              activeFfmpegProcess = null;
            }
            currentConnection.destroy();
            currentConnection = null;
            currentChannelId = null;
            player.stop();
          }
          leaveTimer = null;
        }, 5000);
      }
    }
  }
});

// Event: Slash Commands
client.on('interactionCreate', async interaction => {
  try {
    console.log(`[Interaction] Received interaction: ${interaction.type} (isCommand: ${interaction.isChatInputCommand()})`);
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    console.log(`[Interaction] Command: /${commandName}`);

    // /play command
    if (commandName === 'play') {
      const stationArg = interaction.options.getString('station') || config.defaultStation;
      const memberVoiceChannel = interaction.member.voice?.channel;

      let targetChannel = memberVoiceChannel;
      if (!targetChannel && targetChannelId) {
        targetChannel = interaction.guild.channels.cache.get(targetChannelId);
      }

      if (!targetChannel) {
        return interaction.reply({
          content: '❌ You must be in a Voice Channel or set a valid `TARGET_CHANNEL_ID` in `.env` to play radio!',
          flags: MessageFlags.Ephemeral
        });
      }

      const stationInfo = config.stations[stationArg];
      if (!stationInfo) {
        return interaction.reply({
          content: `❌ Unknown station \`${stationArg}\`. Use \`/stations\` to list valid stations.`,
          flags: MessageFlags.Ephemeral
        });
      }

      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }
      } catch (e) {
        console.warn('[Interaction Warning] Could not defer reply:', e.message);
      }

      await connectToVoiceChannel(targetChannel);
      playStation(stationArg);

      const embed = new EmbedBuilder()
        .setColor('#FF5500')
        .setTitle(`📻 Playing: ${stationInfo.name}`)
        .setDescription(stationInfo.description)
        .addFields(
          { name: 'Genre', value: stationInfo.genre, inline: true },
          { name: 'Voice Channel', value: `<#${targetChannel.id}>`, inline: true }
        )
        .setFooter({ text: 'Tamil Radio Bot • 24/7 Live Stream' })
        .setTimestamp();

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ embeds: [embed] });
      } else {
        return interaction.reply({ embeds: [embed] });
      }
    }

    // /stop command
    if (commandName === 'stop') {
      // Cancel any background retry
      if (backgroundRetryTimer) {
        clearTimeout(backgroundRetryTimer);
        backgroundRetryTimer = null;
      }

      if (!currentConnection) {
        return interaction.reply({ content: '⚠️ Bot is not currently in any voice channel.', flags: MessageFlags.Ephemeral });
      }

      if (activeFfmpegProcess) {
        try { activeFfmpegProcess.kill('SIGKILL'); } catch (e) {}
        activeFfmpegProcess = null;
      }

      currentConnection.destroy();
      currentConnection = null;
      currentChannelId = null;
      player.stop();

      return interaction.reply({ content: '⏹️ Stopped radio playback and left the voice channel.' });
    }

    // /stations command
    if (commandName === 'stations') {
      const embed = new EmbedBuilder()
        .setColor('#00AAFF')
        .setTitle('📻 Available Tamil Radio Stations')
        .setDescription('Use `/play [station]` to listen to any of the following stations:')
        .setFooter({ text: 'Tamil Radio Bot' });

      Object.keys(config.stations).forEach(key => {
        const s = config.stations[key];
        embed.addFields({
          name: `🔹 ${s.name} (\`/play ${key}\`)`,
          value: `**Genre:** ${s.genre}\n**Info:** ${s.description}`
        });
      });

      return interaction.reply({ embeds: [embed] });
    }

    // /status command
    if (commandName === 'status') {
      const activeStation = config.stations[currentStationKey];
      const isPlaying = player.state.status === AudioPlayerStatus.Playing;

      const embed = new EmbedBuilder()
        .setColor(isPlaying ? '#00FF66' : '#FFBB00')
        .setTitle('📡 Tamil Radio Bot Status')
        .addFields(
          { name: 'Status', value: isPlaying ? '🟢 Playing Live' : '🟡 Idle / Stopped', inline: true },
          { name: 'Current Station', value: activeStation ? activeStation.name : 'None', inline: true },
          { name: 'Voice Channel', value: currentChannelId ? `<#${currentChannelId}>` : 'Disconnected', inline: true },
          { name: 'Auto-Join Target Channel', value: targetChannelId ? `<#${targetChannelId}>` : 'Not Configured', inline: false }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // /help command
    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setColor('#9933FF')
        .setTitle('📖 Tamil Radio Bot - Help & Setup Guide')
        .setDescription('Listen to high-quality Tamil radio streams directly in your Discord voice channels!')
        .addFields(
          { name: '`/play [station]`', value: 'Play a Tamil radio station (e.g. `/play rahman`, `/play ilayaraja`, `/play sooriyan`).' },
          { name: '`/stop`', value: 'Stop playback and disconnect the bot from voice channel.' },
          { name: '`/stations`', value: 'Display list of all available radio stations.' },
          { name: '`/status`', value: 'Check connection and stream health status.' },
          { name: '🤖 Auto-Join Feature', value: 'The bot will automatically join the channel when members enter, and disconnect when empty!' }
        )
        .setFooter({ text: 'Tamil Radio Bot' });

      return interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('[Interaction Error] Failed to handle interaction:', error);
  }
});

// Login
client.login(token);
