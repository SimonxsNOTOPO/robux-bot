// Carrega variáveis de ambiente (Railway usa automaticamente)
require('dotenv').config();

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

// Tratamento global de erros para evitar crash
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ UncaughtException:', err);
});

// Verifica variáveis essenciais
['DISCORD_TOKEN', 'GUILD_ID'].forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️ Variável de ambiente ausente: ${key}`);
  }
});

// Cria cliente Discord
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

// Evento: Bot pronto
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

// Evento: Interações
client.on('interactionCreate', async (interaction) => {
  try {
    // /painel
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

    // Botão abrir_ticket
    if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
      const guild = interaction.guild;
      const categoryId = process.env.TICKETS_CATEGORY_ID || null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;

      const safeName = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
      const channelName = `ticket-${safeName(interaction.user.username)}`;

      // Evita duplicado
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

      // Permissões do canal
      const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ];
      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        });
      }

      // Cria canal
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        permissionOverwrites: overwrites,
      });

      await interaction.reply({
        content: `✅ Ticket criado: ${channel}`,
        ephemeral: true,
      });

      // Mensagem automática inicial
      const initialMsg = await channel.send(
`📢 **Seja paciente, nossa equipe vai te atender em breve.**

Para adiantar, envie:
1) Quantidade de Robux desejada  
2) Link do seu **jogo** onde será criado o *gamepass*  
3) Seu **@** no Roblox  
4) Comprovante de pagamento quando solicitado

**Importante:** Não compartilhe sua senha. Todo atendimento é feito **somente neste ticket**.`
      );

      // Fixar se possível
      const me = guild.members.me;
      const canPin = me && channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
      if (canPin) {
        await initialMsg.pin().catch((err) =>
          console.warn('⚠️ Não foi possível fixar a mensagem:', err.message)
        );
      } else {
        console.warn('⚠️ Sem permissão para fixar a mensagem.');
      }
    }
  } catch (err) {
    console.error('❌ Erro na interação:', err);
    if (!interaction.replied) {
      try {
        await interaction.reply({
          content: '❌ Ocorreu um erro. Tente novamente mais tarde.',
          ephemeral: true,
        });
      } catch {}
    }
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
