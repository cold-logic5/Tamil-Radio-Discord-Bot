# 📻 Tamil Radio & News Discord Bot

A high-performance, 24/7 Tamil Radio & News streaming bot for Discord built with **Node.js**, **discord.js v14**, `@discordjs/voice`, and **FFmpeg**.

---

## ✨ Features

- 🎵 **High Quality Audio Streaming**: Transcodes MP3/AAC radio streams to Opus on-the-fly.
- ⚡ **Auto-Join & Auto-Leave**: Automatically joins your dedicated voice channel when members join, and disconnects when empty to save server bandwidth & CPU.
- 🔀 **Seamless Station Switching**: Instantly switch streams without disconnecting from the voice channel.
- 💬 **Discord Slash Commands**: `/play`, `/stop`, `/stations`, `/status`, `/help`.
- 🔁 **Auto-Reconnection**: Reconnects automatically if internet radio streams drop or stutter.
- ⚙️ **Configurable Station Directory**: Simple `config.json` file to add, modify, or remove Tamil Icecast radio streams.

---

## 🛠️ Architecture & Requirements

- **Runtime**: Node.js (v18+)
- **Libraries**: `discord.js@14`, `@discordjs/voice`, `ffmpeg-static`, `libsodium-wrappers`
- **Voice Encoding**: FFmpeg handles live MP3/AAC audio decoding to Opus.

---

## 🚀 Quick Start Guide

### 1. Installation

Clone or copy the files into your project folder and install dependencies:

```bash
npm install
```

### 2. Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a **New Application** (e.g. `Tamil Radio Bot`).
3. Navigate to **Bot** -> Reset / Copy **Bot Token**.
4. Enable **Server Members Intent** and **Message Content Intent** (under Privileged Gateway Intents).
5. Copy your **Client ID** from the **OAuth2** tab.
6. Generate an OAuth2 invite link with permissions:
   - `bot`, `applications.commands`
   - Voice Permissions: `Connect`, `Speak`, `Use Voice Activity`
7. Invite the bot to your server.

### 3. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your secrets in `.env`:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here_optional_for_fast_testing
TARGET_CHANNEL_ID=your_dedicated_voice_channel_id
```

### 4. Deploy Slash Commands

Register slash commands with Discord API:

```bash
npm run deploy-commands
```

### 5. Start the Bot

```bash
npm start
```

---

## 📡 Radio Stations Configuration (`config.json`)

You can easily add new Tamil stream URLs to `config.json`:

```json
{
  "targetChannelId": "YOUR_VOICE_CHANNEL_ID",
  "defaultStation": "hello",
  "stations": {
    "hello": {
      "name": "Hello FM 106.4",
      "url": "http://163.172.158.94:8048/;stream.mp3",
      "genre": "FM Radio / Tamil Super Hits",
      "description": "Tamil live radio broadcast - Hello FM 106.4"
    },
    "mirchi": {
      "name": "Radio Mirchi FM 98.3",
      "url": "http://163.172.158.94:8052/;stream.mp3",
      "genre": "FM Radio / Latest Hits & Comedy",
      "description": "It's Hot! Radio Mirchi Tamil 98.3 FM"
    },
    "bigfm": {
      "name": "Big FM 92.7",
      "url": "http://163.172.158.94:8062/;stream.mp3",
      "genre": "FM Radio / Music & Entertainment",
      "description": "Kettukitte Iru Big FM 92.7 Tamil"
    },
    "rainbow": {
      "name": "Chennai FM Rainbow",
      "url": "http://163.172.158.94:8066/;stream.mp3",
      "genre": "AIR / Chennai Rainbow FM",
      "description": "All India Radio Chennai FM Rainbow live stream"
    },
    "radiocity": {
      "name": "Radio City Live 91.1",
      "url": "http://163.172.158.94:8064/;stream.mp3",
      "genre": "FM Radio / Superhit Songs",
      "description": "Radio City Tamil Live 91.1 FM stream"
    },
    "sooriyan": {
      "name": "Sooriyan FM",
      "url": "http://104.238.193.114:7077/;stream.mp3",
      "genre": "Pop & Entertainment",
      "description": "Latest Tamil movie tracks & entertainment shows"
    },
    "tamilfm_uae": {
      "name": "Tamil FM 89.4 - UAE",
      "url": "http://31.14.40.149:8000/;stream.mp3",
      "genre": "International / UAE Tamil FM",
      "description": "Popular Tamil radio broadcasting live from UAE"
    },
    "tamilisai_uk": {
      "name": "Tamilisai FM - UK",
      "url": "http://185.193.112.155:18244/;stream.mp3",
      "genre": "International / UK Tamil FM",
      "description": "Tamil music & cultural stream live from UK"
    }
  }
}
```

---

## 🤖 Slash Commands

| Command | Description |
|---|---|
| `/play [station]` | Start streaming radio (e.g. `/play rahman`, `/play ilayaraja`, `/play btc`) |
| `/stop` | Stop playback and disconnect from voice channel |
| `/stations` | List all configured Tamil radio stations with genres |
| `/status` | View current streaming status, voice channel, and health |
| `/help` | Display command usage and instructions |

---

## 🖥️ VPS Hosting & Deployment (24/7 Production)

For 24/7 uptime without network interruptions, deploy the bot to a Linux VPS (DigitalOcean, Hetzner, AWS EC2, or Oracle Free Tier).

### Step 1: SSH into VPS & Install Node.js + Git + FFmpeg

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 2: Clone Bot Files & Install PM2

```bash
git clone <your-repo-url> tamil-radio-bot
cd tamil-radio-bot
npm install
npm install -g pm2
```

### Step 3: Configure `.env` & Register Commands

```bash
nano .env
# Paste your DISCORD_TOKEN, CLIENT_ID, and TARGET_CHANNEL_ID
node deploy-commands.js
```

### Step 4: Start Bot with PM2 Process Manager

```bash
pm2 start index.js --name "tamil-radio"
pm2 save
pm2 startup
```

PM2 will automatically manage the bot process, restart it on crashes, and launch it automatically if your server reboots!

---

## 🛡️ Troubleshooting

- **No audio output**: Ensure `ffmpeg-static` and `libsodium-wrappers` are installed. On Linux, ensure `ffmpeg` system binary is installed (`sudo apt install ffmpeg`).
- **Bot missing permissions**: Ensure the bot has `Connect` and `Speak` permissions in the voice channel.
- **Commands not showing up**: Run `npm run deploy-commands` after setting `CLIENT_ID` in `.env`.
