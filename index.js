// Carrega variáveis de ambiente (Railway lê automaticamente)
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
  AttachmentBuilder,
} = require('discord.js');

// ====== CONFIG ======
const TICKET_PREFIX = 'ticket-';
const DEFAULT_LANG = 'pt'; // 'pt' ou 'en'
// ====================

// Tratamento global de erros (evita crash)
process.on('unhandledRejection', (reason) => console.error('⚠️ UnhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ UncaughtException:', err));

// Verificação de variáveis essenciais
['DISCORD_TOKEN', 'GUILD_ID'].forEach((k) => {
  if (!process.env[k]) console.warn(`⚠️ Variável ausente: ${k}`);
});
// Variáveis opcionais: STAFF_ROLE_ID, TICKETS_CATEGORY_ID, LOG_CHANNEL_ID

// Cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ====== TEXTOS (PT/EN) ======
const texts = {
  pt: {
    painel:
`**Comprar Robux via Gamepass (Atendimento por Ticket)**

Clique no botão abaixo para abrir um canal privado com nossa equipe.
Lá vamos:
• Confirmar a quantidade de Robux
• Passar/validar o link do *gamepass*
• Explicar pagamento e prazos de entrega

Se tiver dúvidas, é só abrir o ticket.`,
    btnOpen: '🎟️ Abrir Ticket para Comprar Robux',
    ticketPinned:
`📢 **Seja paciente, nossa equipe vai te atender em breve.**

Para adiantar, envie:
1) Quantidade de Robux desejada  
2) Link do seu **jogo** onde será criado o *gamepass*  
3) Seu **@** no Roblox  
4) Comprovante de pagamento quando solicitado

**Importante:** Não compartilhe sua senha. Todo atendimento é feito **somente neste ticket**.`,
    ticketIntro:
`**Fluxo da compra via Gamepass**
• Informaremos o valor e criaremos/validaremos o *gamepass* com o preço correto.  
• Você realiza a compra do *gamepass*.  
• Após confirmarmos, os Robux entram na sua conta (considerando o corte padrão da plataforma).`,
    actionsTitle: 'Ações do Ticket',
    btnCloseWith: '✅ Fechar (com transcrição)',
    btnCloseNo: '🛑 Fechar (sem transcrição)',
    btnDelete: '🗑️ Apagar Ticket',
    btnLang: '🌐 Switch to English',
    ticketExists: (ch) => `⚠️ Você já tem um ticket aberto: ${ch}`,
    ticketCreated: (ch) => `✅ Ticket criado: ${ch}`,
    closing: '⏳ Fechando este ticket…',
    closed: '✅ Ticket fechado.',
    deleted: '🗑️ Canal do ticket será apagado.',
    notAllowed: '❌ Você não tem permissão para esta ação.',
    notTicket: '❌ Este canal não parece ser um ticket.',
    cmdDeleted: (ch) => `🗑️ Ticket apagado: ${ch}`,
    logs: {
      created: (user, ch) => `🆕 **Ticket criado** por ${user} → ${ch}`,
      closed: (user, ch, withT) => `${withT ? '✅' : '🛑'} **Ticket fechado** por ${user} → ${ch} ${withT ? '(com transcrição)' : ''}`,
      deleted: (user, ch) => `🗑️ **Ticket apagado** por ${user} → ${ch}`,
    }
  },
  en: {
    painel:
`**Buy Robux via Gamepass (Ticket Support)**

Click the button below to open a private channel with our team.
We will:
• Confirm the amount of Robux
• Provide/validate the *gamepass* link
• Explain payment and delivery times

If you have questions, just open a ticket.`,
    btnOpen: '🎟️ Open Ticket to Buy Robux',
    ticketPinned:
`📢 **Please be patient, our team will assist you shortly.**

To speed things up, send:
1) Desired amount of Robux  
2) Link to your **game** where the *gamepass* will be created  
3) Your **@** on Roblox  
4) Payment proof when requested

**Important:** Do not share your password. All support is done **only in this ticket**.`,
    ticketIntro:
`**Gamepass purchase flow**
• We will inform the price and create/validate the *gamepass* with the correct amount.  
• You purchase the *gamepass*.  
• After confirmation, Robux are delivered to your account (considering the platform fee).`,
    actionsTitle: 'Ticket Actions',
    btnCloseWith: '✅ Close (with transcript)',
    btnCloseNo: '🛑 Close (no transcript)',
    btnDelete: '🗑️ Delete Ticket',
    btnLang: '🌐 Mudar para Português',
    ticketExists: (ch) => `⚠️ You already have an open ticket: ${ch}`,
    ticketCreated: (ch) => `✅ Ticket created: ${ch}`,
    closing: '⏳ Closing this ticket…',
    closed: '✅ Ticket closed.',
    deleted: '🗑️ Ticket channel will be deleted.',
    notAllowed: '❌ You are not allowed to do this.',
    notTicket: '❌ This channel does not look like a ticket.',
    cmdDeleted: (ch) => `🗑️ Ticket deleted: ${ch}`,
    logs: {
      created: (user, ch) => `🆕 **Ticket created** by ${user} → ${ch}`,
      closed: (user, ch, withT) => `${withT ? '✅' : '🛑'} **Ticket closed** by ${user} → ${ch} ${withT ? '(with transcript)' : ''}`,
      deleted: (user, ch) => `🗑️ **Ticket deleted** by ${user} → ${ch}`,
    }
  }
};

// ====== HELPERS ======
const safe = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
const isStaff = (member) => {
  const roleId = process.env.STAFF_ROLE_ID;
  if (!roleId) return member.permissions.has(PermissionFlagsBits.ManageChannels);
  return member.roles.cache.has(roleId) || member.permissions.has(PermissionFlagsBits.ManageChannels);
};

function channelIsTicket(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  return channel.name.startsWith(TICKET_PREFIX) || (channel.topic && channel.topic.includes('TICKET_OWNER:'));
}

function ticketLangOf(channel) {
  // Define idioma pelo sufixo no nome do canal: -pt ou -en; fallback para DEFAULT_LANG
  if (!channel || !channel.name) return DEFAULT_LANG;
  if (channel.name.endsWith('-en')) return 'en';
  if (channel.name.endsWith('-pt')) return 'pt';
  return DEFAULT_LANG;
}

function buildTicketName(username, lang = DEFAULT_LANG) {
  const base = `${TICKET_PREFIX}${safe(username)}`;
  return `${base}-${lang}`;
}

function buildActionsRow(lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_with_transcript').setLabel(texts[lang].btnCloseWith).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('close_no_transcript').setLabel(texts[lang].btnCloseNo).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('delete_ticket').setLabel(texts[lang].btnDelete).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('toggle_lang').setLabel(texts[lang].btnLang).setStyle(ButtonStyle.Primary)
  );
}

async function logEvent(guild, content, attachment) {
  const logId = process.env.LOG_CHANNEL_ID;
  if (!logId) return;
  const ch = guild.channels.cache.get(logId) || await guild.channels.fetch(logId).catch(() => null);
  if (!ch) return;
  try {
    if (attachment) await ch.send({ content, files: [attachment] });
    else await ch.send({ content });
  } catch {}
}

async function collectTranscript(channel) {
  const lines = [];
  let lastId = null;
  let fetchedTotal = 0;

  while (true) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts);
    if (!batch.size) break;

    const arr = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of arr) {
      fetchedTotal++;
      const time = new Date(m.createdTimestamp).toISOString();
      const author = `${m.author.tag} (${m.author.id})`;
      const content = m.content || '';
      const attachments = m.attachments.map(a => a.url).join(' ');
      lines.push(`[${time}] ${author}: ${content} ${attachments}`.trim());
    }
    lastId = arr[0].id;
    if (fetchedTotal >= 1000) break; // segurança
  }

  const text = lines.join('\n') || 'Sem mensagens.';
  const buf = Buffer.from(text, 'utf8');
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}

// ====== SLASH COMMANDS ======
const slashCommands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publica o painel de compra de Robux (botão para abrir ticket).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('apagar_ticket')
    .setDescription('Apaga um ticket específico (apenas staff).')
    .addChannelOption(o =>
      o.setName('canal')
       .setDescription('Canal do ticket a apagar')
       .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());

// ====== READY ======
client.once('ready', async () => {
  console.log(`✅ Logado como ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: slashCommands }
    );
    console.log('✅ Slash commands registrados.');
  } catch (err) {
    console.error('❌ Erro ao registrar comandos:', err);
  }
});

// ====== INTERAÇÕES ======
client.on('interactionCreate', async (interaction) => {
  try {
    // /painel
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      const lang = DEFAULT_LANG;
      const abrirBtn = new ButtonBuilder()
        .setCustomId('abrir_ticket')
        .setLabel(texts[lang].btnOpen)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(abrirBtn);

      await interaction.reply({
        content: texts[lang].painel,
        components: [row],
      });
      return;
    }

    // /apagar_ticket
    if (interaction.isChatInputCommand() && interaction.commandName === 'apagar_ticket') {
      if (!isStaff(interaction.member)) {
        await interaction.reply({ content: texts[DEFAULT_LANG].notAllowed, ephemeral: true });
        return;
      }
      const ch = interaction.options.getChannel('canal');
      if (!channelIsTicket(ch)) {
        await interaction.reply({ content: texts[DEFAULT_LANG].notTicket, ephemeral: true });
        return;
      }
      await interaction.reply({ content: texts[DEFAULT_LANG].cmdDeleted(`${ch}`), ephemeral: true });
      await logEvent(interaction.guild, texts[DEFAULT_LANG].logs.deleted(interaction.user, `${ch}`));
      await ch.delete().catch(() => {});
      return;
    }

    // Botão abrir_ticket
    if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
      const guild = interaction.guild;
      const categoryId = process.env.TICKETS_CATEGORY_ID || null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;

      // Anti‑spam: 1 ticket por usuário
      const existing = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText &&
        channelIsTicket(c) &&
        (c.name.includes(safe(interaction.user.username)) || (c.topic && c.topic.includes(`TICKET_OWNER:${interaction.user.id}`)))
      );
      if (existing) {
        await interaction.reply({ content: texts[DEFAULT_LANG].ticketExists(existing), ephemeral: true });
        return;
      }

      const lang = DEFAULT_LANG;
      const channelName = buildTicketName(interaction.user.username, lang);

      // Permissões com anexos liberados
      const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
        ]},
      ];
      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.AttachFiles
          ],
        });
      }

      // Cria canal com topic contendo dono e idioma
      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `TICKET_OWNER:${interaction.user.id} | LANG:${lang}`,
        permissionOverwrites: overwrites,
      });

      await interaction.reply({ content: texts[lang].ticketCreated(`${channel}`), ephemeral: true });

      // Mensagem fixada (idioma atual) + botões de ação
      const pinned = await channel.send(texts[lang].ticketPinned);
      // Tenta fixar
      const me = guild.members.me;
      const canPin = me && channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
      if (canPin) await pinned.pin().catch(() => {});

      // Mensagem de introdução + ações
      await channel.send({
        content: texts[lang].ticketIntro,
        components: [buildActionsRow(lang)],
      });

      // Log
      await logEvent(guild, texts[lang].logs.created(interaction.user, `${channel}`));
      return;
    }

    // ====== Botões dentro do ticket ======
    if (interaction.isButton() && ['close_with_transcript','close_no_transcript','delete_ticket','toggle_lang'].includes(interaction.customId)) {
      const channel = interaction.channel;
      if (!channelIsTicket(channel)) {
        await interaction.reply({ content: texts[DEFAULT_LANG].notTicket, ephemeral: true });
        return;
      }

      const openerId = channel.topic?.match(/TICKET_OWNER:(\d+)/)?.[1];
      const userIsOpener = openerId && openerId === interaction.user.id;
      const userIsStaff = isStaff(interaction.member);
      const lang = ticketLangOf(channel);

      // quem pode fechar/apagar: staff ou dono
      if (!userIsStaff && !userIsOpener && interaction.customId !== 'toggle_lang') {
        await interaction.reply({ content: texts[lang].notAllowed, ephemeral: true });
        return;
      }

      // Alternar idioma
      if (interaction.customId === 'toggle_lang') {
        const newLang = lang === 'pt' ? 'en' : 'pt';
        // Renomeia canal e atualiza topic
        const base = channel.name.replace(/-(pt|en)$/i, '');
        await channel.setName(`${base}-${newLang}`).catch(() => {});
        await channel.setTopic(`TICKET_OWNER:${openerId || interaction.user.id} | LANG:${newLang}`).catch(()=>{});

        // Atualiza mensagem de ações (republica com textos do novo idioma)
        await interaction.deferUpdate();
        try {
          // Reenvia mensagem fixada de orientações no novo idioma
          await channel.send(texts[newLang].ticketPinned);
          await channel.send({
            content: texts[newLang].ticketIntro,
            components: [buildActionsRow(newLang)],
          });
        } catch {}
        return;
      }

      // Fechar com/sem transcrição
      if (interaction.customId === 'close_with_transcript' || interaction.customId === 'close_no_transcript') {
        const withTranscript = interaction.customId === 'close_with_transcript';
        await interaction.reply({ content: texts[lang].closing, ephemeral: true });

        // Transcript (se solicitado)
        let attach = null;
        if (withTranscript) {
          try {
            attach = await collectTranscript(channel);
            await channel.send({ content: texts[lang].closed, files: [attach] });
            await logEvent(interaction.guild, texts[lang].logs.closed(interaction.user, `${channel}`, true), attach);
          } catch (e) {
            console.warn('Falha ao gerar transcrição:', e.message);
            await logEvent(interaction.guild, texts[lang].logs.closed(interaction.user, `${channel}`, false));
          }
        } else {
          await channel.send(texts[lang].closed);
          await logEvent(interaction.guild, texts[lang].logs.closed(interaction.user, `${channel}`, false));
        }

        // Opcionalmente: trancar canal ao invés de apagar.
        // Aqui vamos APAGAR o canal após 5s.
        setTimeout(async () => {
          await channel.delete().catch(() => {});
        }, 5000);

        return;
      }

      // Apagar ticket (imediato)
      if (interaction.customId === 'delete_ticket') {
        await interaction.reply({ content: texts[lang].deleted, ephemeral: true });
        await logEvent(interaction.guild, texts[lang].logs.deleted(interaction.user, `${channel}`));
        setTimeout(async () => {
          await channel.delete().catch(() => {});
        }, 2000);
        return;
      }
    }
  } catch (err) {
    console.error('❌ Erro na interação:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Ocorreu um erro. Tente novamente mais tarde.', ephemeral: true }).catch(() => {});
    }
  }
});

// ====== LOGIN ======
client.login(process.env.DISCORD_TOKEN);
