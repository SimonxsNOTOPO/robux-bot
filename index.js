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
  EmbedBuilder,
} = require('discord.js');

/* ===================== TEMA / CORES ===================== */
const COLORS = {
  primary: 0x7c3aed,   // roxo vivo
  accent:  0x8b5cf6,   // roxo claro
  danger:  0xef4444,   // vermelho
  ok:      0x22c55e,   // verde
  warn:    0xf59e0b,   // amarelo
  dark:    0x111827    // "preto" (barra do embed mais escura)
};
/* ======================================================== */

// ====== CONFIG ======
const TICKET_PREFIX = 'ticket-';
const DEFAULT_LANG = 'pt'; // 'pt' ou 'en'
// Variáveis esperadas no Railway: DISCORD_TOKEN, GUILD_ID
// Opcionais: STAFF_ROLE_ID, TICKETS_CATEGORY_ID, LOG_CHANNEL_ID

// Tratamento global de erros (evita crash)
process.on('unhandledRejection', (reason) => console.error('⚠️ UnhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ UncaughtException:', err));

// Verificação de variáveis essenciais
['DISCORD_TOKEN', 'GUILD_ID'].forEach((k) => {
  if (!process.env[k]) console.warn(`⚠️ Variável ausente: ${k}`);
});

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

/* ===================== TEXTOS (PT/EN) ===================== */
const texts = {
  pt: {
    brand: 'Loja de Robux',
    painelTitle: 'Comprar Robux via Gamepass',
    painelDesc:
`Use o botão abaixo para abrir um **ticket privado** com nossa equipe.

**O que faremos no atendimento**
• Confirmar a quantidade de Robux  
• Criar/validar o *gamepass*  
• Explicar pagamento e prazos de entrega`,

    btnOpen: '🎟️ Abrir Ticket',
    btnCloseWith: '✅ Fechar (com transcrição)',
    btnCloseNo: '🛑 Fechar (sem transcrição)',
    btnDelete: '🗑️ Apagar Ticket',
    btnLang: '🌐 Switch to English',

    pinnedTitle: 'Aguarde, estamos chegando!',
    pinnedDesc:
`Para adiantar, envie:
1) Quantidade de Robux desejada  
2) Link do seu **jogo** onde será criado o *gamepass*  
3) Seu **@** do Roblox  
4) Comprovante de pagamento quando solicitado

> **Atenção:** Nunca compartilhe sua senha. O atendimento acontece **apenas neste canal**.`,

    introTitle: 'Como funciona',
    introDesc:
`• Informamos o valor e criamos/validamos o *gamepass*  
• Você efetua a compra do *gamepass*  
• Confirmado o pagamento, os Robux entram na sua conta (considerando as taxas da plataforma)`,

    ticketExists: (ch) => `Você já tem um ticket aberto: ${ch}`,
    ticketCreated: (ch) => `Ticket criado: ${ch}`,
    closing: 'Fechando este ticket…',
    closed: 'Ticket fechado.',
    deleted: 'Ticket será apagado.',
    notAllowed: 'Você não tem permissão para esta ação.',
    notTicket: 'Este canal não parece ser um ticket.',

    logs: {
      header: 'Registro de Tickets',
      created: 'Ticket Criado',
      closed: 'Ticket Fechado',
      deleted: 'Ticket Apagado',
      withTranscript: 'com transcrição',
      noTranscript: 'sem transcrição',
    }
  },

  en: {
    brand: 'Robux Store',
    painelTitle: 'Buy Robux via Gamepass',
    painelDesc:
`Use the button below to open a **private ticket** with our team.

**What we will do**
• Confirm the amount of Robux  
• Create/validate the *gamepass*  
• Explain payment and delivery times`,

    btnOpen: '🎟️ Open Ticket',
    btnCloseWith: '✅ Close (with transcript)',
    btnCloseNo: '🛑 Close (no transcript)',
    btnDelete: '🗑️ Delete Ticket',
    btnLang: '🌐 Mudar para Português',

    pinnedTitle: 'Please be patient!',
    pinnedDesc:
`To speed things up, send:
1) Desired amount of Robux  
2) Link to your **game** where the *gamepass* will be created  
3) Your Roblox **@**  
4) Payment proof when requested

> **Note:** Never share your password. Support happens **only in this channel**.`,

    introTitle: 'How it works',
    introDesc:
`• We inform the price and create/validate the *gamepass*  
• You purchase the *gamepass*  
• After confirmation, Robux are delivered to your account (considering platform fees)`,

    ticketExists: (ch) => `You already have an open ticket: ${ch}`,
    ticketCreated: (ch) => `Ticket created: ${ch}`,
    closing: 'Closing this ticket…',
    closed: 'Ticket closed.',
    deleted: 'Ticket will be deleted.',
    notAllowed: 'You are not allowed to do this.',
    notTicket: 'This channel does not look like a ticket.',

    logs: {
      header: 'Ticket Logs',
      created: 'Ticket Created',
      closed: 'Ticket Closed',
      deleted: 'Ticket Deleted',
      withTranscript: 'with transcript',
      noTranscript: 'no transcript',
    }
  }
};
/* ============================================================ */

/* ========================= HELPERS ========================== */
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

function brandEmbed(lang, title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`💜 ${title}`)
    .setDescription(description)
    .setFooter({ text: texts[lang].brand });
}

async function logEmbed(guild, lang, kind, data = {}, attachment) {
  const id = process.env.LOG_CHANNEL_ID;
  if (!id) return;
  const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!ch) return;

  const color = kind === 'created' ? COLORS.accent : kind === 'closed' ? COLORS.ok : kind === 'deleted' ? COLORS.danger : COLORS.dark;
  const title = kind === 'created' ? texts[lang].logs.created :
                kind === 'closed'  ? texts[lang].logs.closed  :
                                     texts[lang].logs.deleted;

  const emb = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🗂️ ${texts[lang].logs.header}`)
    .addFields(
      { name: 'Evento', value: `**${title}**`, inline: true },
      { name: 'Usuário', value: `${data.user || '—'}`, inline: true },
      { name: 'Canal', value: `${data.channel || '—'}`, inline: true },
      ...(data.details ? [{ name: 'Detalhes', value: data.details, inline: false }] : [])
    )
    .setTimestamp();

  try {
    if (attachment) await ch.send({ embeds: [emb], files: [attachment] });
    else await ch.send({ embeds: [emb] });
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
    if (fetchedTotal >= 2000) break; // segurança
  }

  const text = lines.join('\n') || 'Sem mensagens.';
  const buf = Buffer.from(text, 'utf8');
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}
/* ============================================================ */

/* ======================= SLASH CMDS ======================== */
const slashCommands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publica o painel de compra de Robux.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('apagar_ticket')
    .setDescription('Apaga um ticket específico (apenas staff).')
    .addChannelOption(o =>
      o.setName('canal').setDescription('Canal do ticket a apagar').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());
/* ============================================================ */

/* ========================= READY =========================== */
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
/* ============================================================ */

/* ====================== INTERAÇÕES ========================= */
client.on('interactionCreate', async (interaction) => {
  try {
    /* ---------- /painel ---------- */
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      const lang = DEFAULT_LANG;

      const embed = brandEmbed(lang, texts[lang].painelTitle, texts[lang].painelDesc, COLORS.primary);

      const abrirBtn = new ButtonBuilder()
        .setCustomId('abrir_ticket')
        .setLabel(texts[lang].btnOpen)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(abrirBtn);

      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    /* ---------- /apagar_ticket ---------- */
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
      await interaction.reply({ content: `🗑️ ${texts[DEFAULT_LANG].deleted}` , ephemeral: true });
      await logEmbed(interaction.guild, DEFAULT_LANG, 'deleted', {
        user: `${interaction.user} (${interaction.user.id})`,
        channel: `${ch}`,
      });
      await ch.delete().catch(() => {});
      return;
    }

    /* ---------- Botão: abrir_ticket ---------- */
    if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
      const guild = interaction.guild;
      const categoryId = process.env.TICKETS_CATEGORY_ID || null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;

      // Anti‑spam: 1 ticket por usuário (checa nome e topic)
      const existing = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText &&
        channelIsTicket(c) &&
        (c.name.includes(safe(interaction.user.username)) || (c.topic && c.topic.includes(`TICKET_OWNER:${interaction.user.id}`)))
      );
      if (existing) {
        await interaction.reply({ content: `⚠️ ${texts[DEFAULT_LANG].ticketExists(existing)}`, ephemeral: true });
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

      const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `TICKET_OWNER:${interaction.user.id} | LANG:${lang}`,
        permissionOverwrites: overwrites,
      });

      await interaction.reply({ content: `✅ ${texts[lang].ticketCreated(`${channel}`)}`, ephemeral: true });

      // Mensagem fixada (embed)
      const pinnedEmbed = new EmbedBuilder()
        .setColor(COLORS.accent)
        .setTitle(`⏳ ${texts[lang].pinnedTitle}`)
        .setDescription(texts[lang].pinnedDesc)
        .setFooter({ text: texts[lang].brand });

      const pinned = await channel.send({ embeds: [pinnedEmbed] });

      // Tenta fixar
      const me = guild.members.me;
      const canPin = me && channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
      if (canPin) await pinned.pin().catch(() => {});

      // Mensagem de introdução + ações (embed + buttons)
      const introEmbed = brandEmbed(lang, texts[lang].introTitle, texts[lang].introDesc, COLORS.dark);
      await channel.send({ embeds: [introEmbed], components: [buildActionsRow(lang)] });

      // Log
      await logEmbed(guild, lang, 'created', {
        user: `${interaction.user} (${interaction.user.id})`,
        channel: `${channel}`,
      });
      return;
    }

    /* ---------- Botões dentro do ticket ---------- */
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

      // quem pode fechar/apagar: staff ou dono (toggle_lang liberado)
      if (!userIsStaff && !userIsOpener && interaction.customId !== 'toggle_lang') {
        await interaction.reply({ content: texts[lang].notAllowed, ephemeral: true });
        return;
      }

      // Alternar idioma
      if (interaction.customId === 'toggle_lang') {
        const newLang = lang === 'pt' ? 'en' : 'pt';
        const base = channel.name.replace(/-(pt|en)$/i, '');
        await channel.setName(`${base}-${newLang}`).catch(() => {});
        await channel.setTopic(`TICKET_OWNER:${openerId || interaction.user.id} | LANG:${newLang}`).catch(()=>{});

        await interaction.deferUpdate();

        const pinnedEmbed = new EmbedBuilder()
          .setColor(COLORS.accent)
          .setTitle(`⏳ ${texts[newLang].pinnedTitle}`)
          .setDescription(texts[newLang].pinnedDesc)
          .setFooter({ text: texts[newLang].brand });

        const introEmbed = brandEmbed(newLang, texts[newLang].introTitle, texts[newLang].introDesc, COLORS.dark);

        await channel.send({ embeds: [pinnedEmbed] });
        await channel.send({ embeds: [introEmbed], components: [buildActionsRow(newLang)] });
        return;
      }

      // Fechar com/sem transcrição
      if (interaction.customId === 'close_with_transcript' || interaction.customId === 'close_no_transcript') {
        const withTranscript = interaction.customId === 'close_with_transcript';
        await interaction.reply({ embeds: [brandEmbed(lang, '', texts[lang].closing, COLORS.warn)], ephemeral: true });

        let attach = null;
        if (withTranscript) {
          try {
            attach = await collectTranscript(channel);
            await channel.send({ embeds: [brandEmbed(lang, '', texts[lang].closed, COLORS.ok)], files: [attach] });
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`,
              channel: `${channel}`,
              details: texts[lang].logs.withTranscript
            }, attach);
          } catch (e) {
            console.warn('Falha ao gerar transcrição:', e.message);
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`,
              channel: `${channel}`,
              details: texts[lang].logs.noTranscript
            });
          }
        } else {
          await channel.send({ embeds: [brandEmbed(lang, '', texts[lang].closed, COLORS.ok)] });
          await logEmbed(interaction.guild, lang, 'closed', {
            user: `${interaction.user} (${interaction.user.id})`,
            channel: `${channel}`,
            details: texts[lang].logs.noTranscript
          });
        }

        setTimeout(async () => { await channel.delete().catch(() => {}); }, 5000);
        return;
      }

      // Apagar ticket (imediato)
      if (interaction.customId === 'delete_ticket') {
        await interaction.reply({ embeds: [brandEmbed(lang, '', texts[lang].deleted, COLORS.danger)], ephemeral: true });
        await logEmbed(interaction.guild, lang, 'deleted', {
          user: `${interaction.user} (${interaction.user.id})`,
          channel: `${channel}`,
        });
        setTimeout(async () => { await channel.delete().catch(() => {}); }, 2000);
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

/* ========================= LOGIN ========================== */
client.login(process.env.DISCORD_TOKEN);
