{\rtf1\ansi\ansicpg1252\cocoartf2639
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;\f1\fnil\fcharset0 AppleColorEmoji;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 require('dotenv').config();\
const \{\
  Client,\
  GatewayIntentBits,\
  Partials,\
  REST,\
  Routes,\
  ChannelType,\
  PermissionFlagsBits,\
  ActionRowBuilder,\
  ButtonBuilder,\
  ButtonStyle,\
  SlashCommandBuilder,\
\} = require('discord.js');\
\
['DISCORD_TOKEN','GUILD_ID','STAFF_ROLE_ID'].forEach(k=>\{\
  if(!process.env[k]) console.warn(`
\f1 \uc0\u9888 \u65039 
\f0  Missing env: $\{k\}`);\
\});\
\
const client = new Client(\{\
  intents: [\
    GatewayIntentBits.Guilds,\
    GatewayIntentBits.GuildMembers,\
    GatewayIntentBits.GuildMessages,\
    GatewayIntentBits.MessageContent\
  ],\
  partials: [Partials.Channel]\
\});\
\
// Slash command: /painel\
const slashCommands = [\
  new SlashCommandBuilder()\
    .setName('painel')\
    .setDescription('Publica o painel de compra de Robux (bot\'e3o para abrir ticket).')\
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)\
].map(c => c.toJSON());\
\
client.once('ready', async () => \{\
  console.log(`
\f1 \uc0\u9989 
\f0  Logado como $\{client.user.tag\}`);\
  try \{\
    const rest = new REST(\{ version: '10' \}).setToken(process.env.DISCORD_TOKEN);\
    await rest.put(\
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),\
      \{ body: slashCommands \}\
    );\
    console.log('
\f1 \uc0\u9989 
\f0  Slash commands registrados no servidor.');\
  \} catch (err) \{\
    console.error('
\f1 \uc0\u10060 
\f0  Erro ao registrar comandos:', err);\
  \}\
\});\
\
client.on('interactionCreate', async (interaction) => \{\
  // comando /painel\
  if (interaction.isChatInputCommand() && interaction.commandName === 'painel') \{\
    const abrirBtn = new ButtonBuilder()\
      .setCustomId('abrir_ticket')\
      .setLabel('
\f1 \uc0\u55356 \u57247 \u65039 
\f0  Abrir Ticket para Comprar Robux')\
      .setStyle(ButtonStyle.Primary);\
\
    const row = new ActionRowBuilder().addComponents(abrirBtn);\
\
    await interaction.reply(\{\
      content:\
`**Comprar Robux via Gamepass (Atendimento por Ticket)**\
\
Clique no bot\'e3o abaixo para abrir um canal privado com nossa equipe.\
L\'e1 vamos:\
\'95 Confirmar a quantidade de Robux\
\'95 Passar/validar o link do *gamepass*\
\'95 Explicar pagamento e prazos de entrega\
\
Se tiver d\'favidas, \'e9 s\'f3 abrir o ticket.`,\
      components: [row],\
    \});\
  \}\
\
  // clique no bot\'e3o\
  if (interaction.isButton() && interaction.customId === 'abrir_ticket') \{\
    const guild = interaction.guild;\
    const categoryId = process.env.TICKETS_CATEGORY_ID || null;\
    const staffRoleId = process.env.STAFF_ROLE_ID;\
\
    const safe = s => s.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,90);\
    const channelName = `ticket-$\{safe(interaction.user.username)\}`;\
\
    // evita ticket duplicado do mesmo usu\'e1rio\
    const existing = guild.channels.cache.find(\
      c => c.type === ChannelType.GuildText && c.name === channelName\
    );\
    if (existing) \{\
      await interaction.reply(\{ content: `Voc\'ea j\'e1 tem um ticket aberto: $\{existing\}`, ephemeral: true \});\
      return;\
    \}\
\
    const channel = await guild.channels.create(\{\
      name: channelName,\
      type: ChannelType.GuildText,\
      parent: categoryId,\
      permissionOverwrites: [\
        \{ id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] \},\
        \{ id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] \},\
        \{ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] \},\
      ],\
    \});\
\
    await interaction.reply(\{ content: `
\f1 \uc0\u9989 
\f0  Ticket criado: $\{channel\}`, ephemeral: true \});\
\
    await channel.send(\
`Ol\'e1, $\{interaction.user\}!\
\
**Compra de Robux via Gamepass**\
Para agilizar, envie:\
1) Quantidade de Robux desejada\
2) Link do seu **jogo** onde ser\'e1 criado o *gamepass*\
3) Seu **@** no Roblox\
\
**Como funciona:**\
\'95 Vamos informar o valor e criar/validar o *gamepass* com o pre\'e7o correto.  \
\'95 Voc\'ea realiza a compra do *gamepass*.  \
\'95 Ap\'f3s a confirma\'e7\'e3o, os Robux entram na sua conta (considerando o corte padr\'e3o da plataforma).\
\
Se precisar, explico tudo passo a passo.`\
    );\
  \}\
\});\
\
client.login(process.env.DISCORD_TOKEN);\
}