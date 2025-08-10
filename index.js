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

/* ===================== CORES (tema vermelho) ===================== */
const COLORS = {
  primary: 0xdc2626, // vermelho principal
  accent:  0xef4444, // vermelho vivo
  ok:      0x22c55e, // verde (status ok)
  warn:    0xf59e0b, // amarelo (aviso)
  danger:  0xb91c1c  // vermelho escuro (erro)
};
/* ================================================================ */

/* ======================== CONFIG GERAL ======================== */
const TICKET_PREFIX = 'ticket-';
const DEFAULT_LANG = 'pt'; // 'pt' | 'en'
const INACTIVITY_HOURS = Number(process.env.INACTIVITY_HOURS || 12);
const INACTIVITY_MS = Math.max(1, INACTIVITY_HOURS) * 60 * 60 * 1000;
const BAR_IMAGE_URL = process.env.BAR_IMAGE_URL || ""; // URL da imagem da barra
// Vars esperadas: DISCORD_TOKEN, GUILD_ID
// Opcionais: STAFF_ROLE_ID, TICKETS_CATEGORY_ID, LOG_CHANNEL_ID, BAR_IMAGE_URL, INACTIVITY_HOURS

process.on('unhandledRejection', (r) => console.error('⚠️ UnhandledRejection:', r));
process.on('uncaughtException',  (e) => console.error('⚠️ UncaughtException:', e));

['DISCORD_TOKEN', 'GUILD_ID'].forEach(k => { if (!process.env[k]) console.warn(`⚠️ Variável ausente: ${k}`); });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ========================= TEXTOS ========================= */
const texts = {
  pt: {
    brand: 'Loja de Robux',
    painelTitle: '— Painel de Tickets',
    painelDesc:
`:red_warning: **As lojas estão fechadas no momento**  

:red_bar:

**Suporte** • Abra um ticket para falar com a equipe
**Horários** • Consulte nosso horário de atendimento`,

    btnOpen: '🎟️ Abrir Ticket',
    btnCloseWith: '✅ Fechar (com transcrição)',
    btnCloseNo: '🛑 Fechar (sem transcrição)',
    btnDelete: '🗑️ Apagar Ticket',
    btnLang: '🌐 Switch to English',

    pinnedTitle: '— Atendimento',
    pinnedDesc:
`**Seja paciente**, nossa equipe vai te atender.  
Para adiantar, envie:
• Quantidade de Robux  
• Link do seu **jogo** (onde será criado o *gamepass*)  
• Seu **@** do Roblox  
• Comprovante quando solicitado

> **Atenção:** nunca compartilhe sua senha. O atendimento acontece **apenas neste canal**.`,

    introTitle: '— Como funciona',
    introDesc:
`• Informamos o valor e criamos/validamos o *gamepass*  
• Você compra o *gamepass*  
• Confirmado o pagamento, os Robux entram na sua conta (com as taxas da plataforma)`,

    ticketExists: (ch) => `Você já tem um ticket aberto: ${ch}`,
    ticketCreated: (ch) => `Ticket criado: ${ch}`,
    closing: 'Fechando este ticket…',
    closed: 'Ticket fechado.',
    deleted: 'Ticket será apagado.',
    notAllowed: 'Você não tem permissão para esta ação.',
    notTicket: 'Este canal não parece ser um ticket.',

    logs: {
      header: 'Ticket Logs',
      created: 'Ticket Criado',
      closed: 'Ticket Fechado',
      deleted: 'Ticket Apagado',
      withTranscript: 'com transcrição',
      noTranscript: 'sem transcrição',
      auto: 'fechado automaticamente (inatividade)'
    }
  },

  en: {
    brand: 'Robux Store',
    painelTitle: '— Ticket Panel',
    painelDesc:
`:red_warning: **Stores are closed at the moment**  

:red_bar:

**Support** • Open a ticket to talk to the team  
**Hours** • Check our business hours`,

    btnOpen: '🎟️ Open Ticket',
    btnCloseWith: '✅ Close (with transcript)',
    btnCloseNo: '🛑 Close (no transcript)',
    btnDelete: '🗑️ Delete Ticket',
    btnLang: '🌐 Mudar para Português',

    pinnedTitle: '— Support',
    pinnedDesc:
`**Please be patient**, our team will assist you.  
To speed up, send:
• Desired amount of Robux  
• Link to your **game** (where the *gamepass* will be created)  
• Your Roblox **@**  
• Payment proof when requested

> **Note:** never share your password. Support happens **only in this channel**.`,

    introTitle: '— How it works',
    introDesc:
`• We inform the price and create/validate the *gamepass*  
• You purchase the *gamepass*  
• After confirmation, Robux are delivered to your account (platform fees apply)`,

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
      auto: 'auto‑closed (inactivity)'
    }
  }
};

/* ======================== HELPERS ======================== */
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

// Resolve custom emoji por nome -> "<:name:id>"
function ce(guild, name) {
  try {
    const em = guild.emojis.cache.find(e => e.name === name);
    return em ? `<:${em.name}:${em.id}>` : `:${name}:`;
  } catch { return `:${name}:`; }
}

function buildActionsRow(lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_with_transcript').setLabel(texts[lang].btnCloseWith).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('close_no_transcript').setLabel(texts[lang].btnCloseNo).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('delete_ticket').setLabel(texts[lang].btnDelete).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('toggle_lang').setLabel(texts[lang].btnLang).setStyle(ButtonStyle.Primary)
  );
}

// Cria embed no estilo do print (vermelho) + imagem de barra
function styledEmbed(guild, lang, title, description, color = COLORS.primary) {
  const emb = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🟥 ${title}`)
    .setDescription(description)
    .setFooter({ text: texts[lang].brand });

  if (BAR_IMAGE_URL) emb.setImage(BAR_IMAGE_URL);
  return emb;
}

async function logEmbed(guild, lang, kind, data = {}, attachment) {
  const id = process.env.LOG_CHANNEL_ID;
  if (!id) return;
  const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  if (!ch) return;

  const color = kind === 'created' ? COLORS.accent : kind === 'closed' ? COLORS.ok : COLORS.danger;
  const title = kind === 'created' ? texts[lang].logs.created :
                kind === 'closed'  ? texts[lang].logs.closed  :
                                     texts[lang].logs.deleted;

  const emb = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🟥 ${texts[lang].logs.header}`)
    .addFields(
      { name: 'Evento',  value: `**${title}**`, inline: true },
      { name: 'Usuário', value: `${data.user || '—'}`, inline: true },
      { name: 'Canal',   value: `${data.channel || '—'}`, inline: true },
      ...(data.details ? [{ name: 'Detalhes', value: data.details, inline: false }] : [])
    )
    .setTimestamp();

  if (BAR_IMAGE_URL) emb.setImage(BAR_IMAGE_URL);

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
    if (fetchedTotal >= 2000) break;
  }

  const text = lines.join('\n') || 'Sem mensagens.';
  const buf = Buffer.from(text, 'utf8');
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}

/* =================== INATIVIDADE (AUTO‑CLOSE) =================== */
const inactivityTimers = new Map(); // channelId -> timeoutId
function startInactivityTimer(channel, lang) {
  clearInactivityTimer(channel.id);
  const id = setTimeout(async () => {
    try {
      if (!channelIsTicket(channel)) return;
      await channel.send({ embeds: [styledEmbed(channel.guild, lang, '', texts[lang].logs.auto, COLORS.warn)] });
      await logEmbed(channel.guild, lang, 'closed', {
        user: 'Sistema',
        channel: `${channel}`,
        details: texts[lang].logs.auto
      });
      await channel.delete().catch(() => {});
    } catch (e) {
      console.warn('Auto-close falhou:', e.message);
    } finally {
      inactivityTimers.delete(channel.id);
    }
  }, INACTIVITY_MS);
  inactivityTimers.set(channel.id, id);
}
function clearInactivityTimer(channelId) {
  const t = inactivityTimers.get(channelId);
  if (t) clearTimeout(t);
  inactivityTimers.delete(channelId);
}

/* ======================= SLASH COMMANDS ======================= */
const slashCommands = [
  new SlashCommandBuilder()
    .setName('painelticket')
    .setDescription('Publica o painel de tickets.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('apagar_ticket')
    .setDescription('Apaga um ticket específico (apenas staff).')
    .addChannelOption(o =>
      o.setName('canal').setDescription('Canal do ticket a apagar').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());

/* ============================ READY ============================ */
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

/* ========================= INTERAÇÕES ========================= */
client.on('interactionCreate', async (interaction) => {
  try {
    // /painelticket
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelticket') {
      const lang = DEFAULT_LANG;
      const g = interaction.guild;

      // Tenta substituir tags de emoji pelo custom emoji do servidor
      const desc = texts[lang].painelDesc
        .replaceAll(':red_bar:', ce(g, 'red_bar'))
        .replaceAll(':red_warning:', ce(g, 'red_warning'));

      const embed = styledEmbed(g, lang, texts[lang].painelTitle, desc, COLORS.primary);

      const abrirBtn = new ButtonBuilder()
        .setCustomId('abrir_ticket')
        .setLabel(texts[lang].btnOpen)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(abrirBtn);
      await interaction.reply({ embeds: [embed], components: [row] });
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
      await interaction.reply({ content: `🗑️ ${texts[DEFAULT_LANG].deleted}` , ephemeral: true });
      await logEmbed(interaction.guild, DEFAULT_LANG, 'deleted', {
        user: `${interaction.user} (${interaction.user.id})`,
        channel: `${ch}`,
      });
      clearInactivityTimer(ch.id);
      await ch.delete().catch(() => {});
      return;
    }

    // Botão: abrir ticket
    if (interaction.isButton() && interaction.customId === 'abrir_ticket') {
      const guild = interaction.guild;
      const categoryId = process.env.TICKETS_CATEGORY_ID || null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;

      // 1 ticket por usuário (check por nome ou topic)
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

      // permissões com anexos
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

      // Mensagem fixada (estilo vermelho)
      const pinnedEmbed = styledEmbed(
        guild,
        lang,
        `${ce(guild,'red_1')} ${texts[lang].pinnedTitle}`,
        texts[lang].pinnedDesc,
        COLORS.accent
      );
      const pinned = await channel.send({ embeds: [pinnedEmbed] });

      // Fixar se possível
      const me = guild.members.me;
      const canPin = me && channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages);
      if (canPin) await pinned.pin().catch(() => {});

      // Intro + botões
      const introEmbed = styledEmbed(
        guild,
        lang,
        `${ce(guild,'red_2')} ${texts[lang].introTitle}`,
        texts[lang].introDesc,
        COLORS.primary
      );
      await channel.send({ embeds: [introEmbed], components: [buildActionsRow(lang)] });

      // Logs + timer
      await logEmbed(guild, lang, 'created', {
        user: `${interaction.user} (${interaction.user.id})`,
        channel: `${channel}`,
      });
      startInactivityTimer(channel, lang);
      return;
    }

    // Botões do ticket
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

        const pinnedEmbed = styledEmbed(
          channel.guild,
          newLang,
          `${ce(channel.guild,'red_1')} ${texts[newLang].pinnedTitle}`,
          texts[newLang].pinnedDesc,
          COLORS.accent
        );
        const introEmbed  = styledEmbed(
          channel.guild,
          newLang,
          `${ce(channel.guild,'red_2')} ${texts[newLang].introTitle}`,
          texts[newLang].introDesc,
          COLORS.primary
        );

        await channel.send({ embeds: [pinnedEmbed] });
        await channel.send({ embeds: [introEmbed], components: [buildActionsRow(newLang)] });
        startInactivityTimer(channel, newLang);
        return;
      }

      // Fechar (com/sem transcrição)
      if (interaction.customId === 'close_with_transcript' || interaction.customId === 'close_no_transcript') {
        const withTranscript = interaction.customId === 'close_with_transcript';
        await interaction.reply({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closing, COLORS.warn)], ephemeral: true });

        let attach = null;
        if (withTranscript) {
          try {
            attach = await collectTranscript(channel);
            await channel.send({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closed, COLORS.ok)], files: [attach] });
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`,
              channel: `${channel}`,
              details: texts[lang].logs.withTranscript
            }, attach);
          } catch (e) {
            console.warn('Transcrição falhou:', e.message);
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`,
              channel: `${channel}`,
              details: texts[lang].logs.noTranscript
            });
          }
        } else {
          await channel.send({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closed, COLORS.ok)] });
          await logEmbed(interaction.guild, lang, 'closed', {
            user: `${interaction.user} (${interaction.user.id})`,
            channel: `${channel}`,
            details: texts[lang].logs.noTranscript
          });
        }

        clearInactivityTimer(channel.id);
        setTimeout(async () => { await channel.delete().catch(() => {}); }, 5000);
        return;
      }

      // Apagar ticket
      if (interaction.customId === 'delete_ticket') {
        await interaction.reply({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].deleted, COLORS.danger)], ephemeral: true });
        await logEmbed(interaction.guild, lang, 'deleted', {
          user: `${interaction.user} (${interaction.user.id})`,
          channel: `${channel}`,
        });
        clearInactivityTimer(channel.id);
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

/* ============== RESETAR TIMER AO RECEBER MENSAGENS ============== */
client.on('messageCreate', (message) => {
  try {
    if (message.author.bot) return;
    const ch = message.channel;
    if (!channelIsTicket(ch)) return;
    const lang = ticketLangOf(ch);
    startInactivityTimer(ch, lang);
  } catch {}
});

/* ============================ LOGIN ============================ */
client.login(process.env.DISCORD_TOKEN);
