// Carrega variáveis de ambiente do Railway
require('dotenv').config();

// Importa classes do discord.js
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} = require('discord.js');

// Verifica se as variáveis principais estão presentes
['DISCORD_TOKEN', 'GUILD_ID', 'STAFF_ROLE_ID'].forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️ Variável de ambiente ausente: ${key}`);
  }
});

// Inicializa o cliente do Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Comando /painel
const slashCommands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publica o painel de compra de Robux (botão para abrir ticket).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map((cmd) => cmd.toJSON());

// Quando o bot estiver pronto
client.once('ready', async () => {
  console.log(`✅ Logado como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: slashCommands }
    );
    console.log('✅ Slash commands registrados no servidor.');
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err);
  }
});

// Listener para interações
client.on('interactionCreate', async (interaction) => {
  // Comando /painel
  if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
    const abrirBtn = new ButtonBuilder()
      .setCustomId('abrir_ticket')
      .setLabel('🎟️ Abrir Ticket para Comprar Robux')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(abrirBtn);

    await interaction.reply({
      content: `**Comprar Robux via Gamepass (Atendimento por Ticket)**

Clique no botão abaixo para abrir um canal privado com nossa equipe.
Lá vamos:
• Confirmar a quantidade de Robux
• Passar/validar o link do *gamepass*
• Explicar pagamento e prazos de entrega

Se tiver dúvidas, é só abrir o ticket.`,
      components: [row],
    });
  }

  // Clique no botão abrir_ticket
  if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
    const guild = interaction.guild;
    const categoryId = process.env.TICKETS_CATEGORY_ID || null;
    const staffRoleId = process.env.STAFF_ROLE_ID;

    const safeName = (str) => str.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
    const channelName = `ticket-${safeName(interaction.user.username)}`;

    // Evita criar ticket duplicado
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === channelName
    );
    if (existing) {
      await interaction.reply({
        content: `⚠️ Você já tem um ticket aberto: ${existing}`,
        ephemeral: true,
      });
      return;
    }

    // Cria canal do ticket
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    await interaction.reply({
      content: `✅ Ticket criado: ${channel}`,
      ephemeral: true,
    });

    await channel.send(
      `Olá, ${interaction.user}!

**Compra de Robux via Gamepass**
Para agilizar, envie:
1) Quantidade de Robux desejada
2) Link do seu **jogo** onde será criado o *gamepass*
3) Seu **@** no Roblox

**Como funciona:**
• Vamos informar o valor e criar/validar o *gamepass* com o preço correto.  
• Você realiza a compra do *gamepass*.  
• Após a confirmação, os Robux entram na sua conta (descontado o corte padrão da plataforma).

Se precisar, explico tudo passo a passo.`
    );
  }
});

// Login no bot
client.login(process.env.DISCORD_TOKEN);
