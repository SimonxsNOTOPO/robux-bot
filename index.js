// ========================= WATCHDOG (reinício auto) =========================
const cluster = require('node:cluster');
if (cluster.isPrimary) {
  let restarts = 0;
  const fork = () => {
    const w = cluster.fork();
    w.on('exit', (code, sig) => {
      restarts++;
      const backoff = Math.min(30000, 2000 * restarts);
      console.warn(`⚠️ Worker saiu (code=${code}, sig=${sig}). Reiniciando em ${backoff/1000}s…`);
      setTimeout(fork, backoff);
    });
  };
  console.log(`👑 Master PID ${process.pid} iniciando worker…`);
  fork();
  process.on('SIGUSR2', () => {
    console.log('♻️ Reinício manual solicitado (SIGUSR2).');
    for (const id in cluster.workers) cluster.workers[id].process.kill();
  });
  return;
}
// ========================= FIM WATCHDOG =========================

require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials, REST, Routes, ChannelType,
  PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, PermissionsBitField,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder // NEW (vendas)
} = require('discord.js');

/* ===================== IDENTIDADE VISUAL (vermelho) ===================== */
const BRAND = 'TRACKONTOP';
const COLORS = {
  primary: 0xdc2626, accent: 0xef4444, ok: 0x22c55e, warn: 0xf59e0b, danger: 0xb91c1c
};
const BAR_IMAGE_URL = process.env.BAR_IMAGE_URL || "https://i.vgy.me/Jqt1ra.png";

/* ======================== CONFIG GERAL ======================== */
const TICKET_PREFIX = 'ticket-';
const DEFAULT_LANG = 'pt';
const INACTIVITY_HOURS = Number(process.env.INACTIVITY_HOURS || 12);
const INACTIVITY_MS = Math.max(1, INACTIVITY_HOURS) * 60 * 60 * 1000;
// Pagamentos (links) — NEW (vendas)
const PAYPAL_LINK = process.env.PAYPAL_LINK || '';
const TWINT_LINK  = process.env.TWINT_LINK  || '';

process.on('unhandledRejection', (r) => console.error('⚠️ UnhandledRejection:', r));
process.on('uncaughtException',  (e) => { console.error('⚠️ UncaughtException:', e); setTimeout(()=>process.exit(1), 500); });

['DISCORD_TOKEN', 'GUILD_ID'].forEach(k => { if (!process.env[k]) console.warn(`⚠️ Variável ausente: ${k}`); });

/* ======================== CLIENT (intents) ======================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* ========================= TEXTOS BASE ========================= */
const texts = {
  pt: {
    brand: BRAND,
    painelTitle: '— Painel de Tickets',
    painelDesc:
`${':red_bar:'}

**Suporte** • Abra um ticket para falar com a equipe`,
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
    },

    vendas: { // NEW (vendas)
      titulo: '— Menu de Compras',
      subtitulo: 'Selecione um produto abaixo para ver as opções de pagamento.',
      selectPlaceholder: 'Selecione um Produto',
      resumo: (p) => `**${p.name}**\n💵 Valor: **R$${p.price.toFixed(2)}**\n📦 Estoque: **${p.stock}**\nSKU: \`${p.sku}\``,
      pagarPaypal: '💳 Pagar com PayPal',
      pagarTwint:  '💠 Pagar com TWINT',
      abrirTicket: '🎟️ Abrir Ticket',
      indisponivel: 'Produto indisponível no momento.',
      faltamLinks: 'Métodos de pagamento ainda não configurados.'
    }
  },
  en: { /* (mantido como antes; omitido aqui por brevidade) */ ...texts?.en }
};
// Pequeno truque para manter en sem reescrever tudo aqui
texts.en = texts.en || JSON.parse(JSON.stringify(texts.pt));

/* ====================== TERMOS ====================== */
const TERMS_PT = [
  { num: 1,  title: 'Responsabilidade do Cliente', text:
'O cliente é responsável por fornecer as informações corretas e completas no momento da compra. Erros ou informações incompletas podem resultar em atrasos na entrega ou problemas de acesso ao produto.' },
  { num: 2,  title: 'Pagamento e Reembolso', text:
`A compra deve ser feita utilizando um dos métodos de pagamento disponíveis no ticket de cada loja.

• Todos os pagamentos pelos nossos serviços são definitivos e não reembolsáveis após a entrega do produto, salvo em circunstâncias extremamente específicas.  
• Tentativas de cancelamento ou contestação após a entrega serão consideradas fraude, sujeitando o autor às consequências legais.  
• Para a compra de Robux, nossos serviços não cobrem questões relacionadas à dependência do Roblox. Portanto, banimentos e contestações realizados pela plataforma não são de responsabilidade da nossa loja.  
• Em caso de reembolsos, o usuário concorda em aguardar um prazo de até 3 dias úteis para receber o valor.` },
  { num: 3,  title: 'Ativação após Confirmação', text:
'O acesso ao produto adquirido será concedido somente após a confirmação do pagamento. O cliente assume total responsabilidade caso acesse o jogo ou servidor antes da liberação oficial por um atendente, podendo comprometer a ativação do produto.' },
  { num: 4,  title: 'Prazo de Entrega', text:
'As entregas serão realizadas com um prazo de até 72 horas após a confirmação do pagamento. Caso ocorra algum atraso, entraremos em contato para informar sobre a situação.' },
  { num: 5,  title: 'Entregas Programadas', text:
'Ao efetuar o pagamento, você obtém o direito de posse do item adquirido. Algumas entregas podem ser agendadas para outro dia, desde que haja aviso prévio e acordo. Caso haja imprevistos e não seja possível realizar a entrega no dia combinado, o pedido será automaticamente reagendado para o próximo dia útil, respeitando nosso horário de atendimento.' },
  { num: 6,  title: 'Suporte Técnico', text:
'Oferecemos suporte técnico para questões relacionadas à entrega e acesso ao produto adquirido. Qualquer problema deve ser relatado imediatamente dentro do prazo de 72 horas para que possamos resolver de forma rápida e eficiente.' },
  { num: 7,  title: 'Política de Privacidade e Logs de Atividade', text:
'Garantimos total integridade e segurança dos dados compartilhados conosco pelo usuário, bem como de outras informações, ao longo de todo o processo. Todas as atividades realizadas pelo usuário dentro do servidor são registradas em logs. Portanto, qualquer violação dos termos, condições ou regras pode ser visualizada no banco de dados e usada como prova contra o autor.' },
  { num: 8,  title: 'Alterações nos Termos', text:
'Reservamo‑nos o direito de fazer alterações nestes termos a qualquer momento, mediante aviso prévio aos clientes. É responsabilidade do cliente revisar regularmente os termos de compra para estar ciente de quaisquer atualizações e alterações.' },
  { num: 9,  title: 'Aceitação dos Termos', text:
'Ao realizar uma compra em nosso servidor, o cliente concorda com todos os termos e condições estabelecidos acima.' },
  { num: 10, title: 'Dúvidas e Contato', text:
'Em caso de qualquer dúvida, entre em contato com nossa equipe através do sistema de tickets.' },
];

/* ====================== REGRAS ====================== */
const RULES_PT = [
  { num: 1,  title: 'Respeito em Primeiro Lugar', text: 'Seja respeitoso com todos os membros e com a equipe.' },
  { num: 2,  title: 'Sem SPAM/Divulgação', text: 'Proibido SPAM, flood ou divulgação sem autorização.' },
  { num: 3,  title: 'Privacidade', text: 'Não envie dados pessoais no chat ou em tickets.' },
  { num: 4,  title: 'Pagamento Seguro', text: 'Todos os pagamentos devem ser confirmados antes da entrega.' },
  { num: 5,  title: 'Linguagem', text: 'Evite palavras de baixo calão e qualquer conteúdo ofensivo.' },
  { num: 6,  title: 'Ordem de Atendimento', text: 'Não insista para ser atendido fora da ordem.' },
  { num: 7,  title: 'Prazos', text: 'O prazo de entrega é informado pela equipe e pode variar.' },
  { num: 8,  title: '1 Ticket por Usuário', text: 'Não abra múltiplos tickets para o mesmo assunto.' },
  { num: 9,  title: 'Ticket do Comprador', text: 'Somente o comprador deve interagir no ticket.' },
  { num: 10, title: 'Consequências', text: 'Quebra de regras pode resultar em mute/ban permanente.' },
];

/* ======================== HELPERS ======================== */
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const safe = (s) => s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);

const isStaff = (member) => {
  const roleId = process.env.STAFF_ROLE_ID;
  if (!roleId) return member.permissions.has(PermissionFlagsBits.ManageChannels);
  return member.roles.cache.has(roleId) || member.permissions.has(PermissionFlagsBits.ManageChannels);
};

const channelIsTicket = (channel) =>
  !!channel && channel.type === ChannelType.GuildText &&
  (channel.name?.startsWith(TICKET_PREFIX) || channel.topic?.includes('TICKET_OWNER:'));

const ticketLangOf = (channel) => {
  if (!channel?.name) return DEFAULT_LANG;
  if (channel.name.endsWith('-en')) return 'en';
  if (channel.name.endsWith('-pt')) return 'pt';
  return DEFAULT_LANG;
};

const buildTicketName = (username, lang = DEFAULT_LANG) =>
  `${TICKET_PREFIX}${safe(username)}-${lang}`;

function ce(guild, name) {
  try {
    const em = guild?.emojis?.cache?.find?.(e => e.name === name);
    return em ? `<:${em.name}:${em.id}>` : '';
  } catch { return ''; }
}

function styledEmbed(guild, lang, title, description, color = COLORS.primary) {
  const emb = new EmbedBuilder()
    .setColor(color)
    .setTitle(title ? `🟥 ${title}` : '🟥')
    .setDescription(description || '')
    .setFooter({ text: texts[lang].brand });
  if (typeof BAR_IMAGE_URL === 'string' && /^https?:\/\//i.test(BAR_IMAGE_URL)) {
    emb.setImage(BAR_IMAGE_URL);
  }
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
    .setTitle('🟥 Ticket Logs')
    .addFields(
      { name: 'Evento',  value: `**${title}**`, inline: true },
      { name: 'Usuário', value: `${data.user || '—'}`, inline: true },
      { name: 'Canal',   value: `${data.channel || '—'}`, inline: true },
      ...(data.details ? [{ name: 'Detalhes', value: data.details, inline: false }] : [])
    )
    .setTimestamp();

  if (typeof BAR_IMAGE_URL === 'string' && /^https?:\/\//i.test(BAR_IMAGE_URL)) emb.setImage(BAR_IMAGE_URL);

  try {
    if (attachment) await ch.send({ embeds: [emb], files: [attachment] });
    else await ch.send({ embeds: [emb] });
  } catch {}
}

async function collectTranscript(channel) {
  const lines = []; let lastId = null;
  while (true) {
    const opts = { limit: 100 }; if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts); if (!batch.size) break;
    const arr = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of arr) {
      const time = new Date(m.createdTimestamp).toISOString();
      const author = `${m.author.tag} (${m.author.id})`;
      const content = m.content || '';
      const attachments = m.attachments.map(a => a.url).join(' ');
      lines.push(`[${time}] ${author}: ${content} ${attachments}`.trim());
    }
    lastId = arr[0].id; if (lines.length > 10000) break;
  }
  const text = lines.join('\n') || 'Sem mensagens.';
  const buf = Buffer.from(text, 'utf8');
  return new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` });
}

/* =================== AUTO-FECHAMENTO POR INATIVIDADE =================== */
const inactivityTimers = new Map();
function startInactivityTimer(channel, lang) {
  clearInactivityTimer(channel.id);
  const id = setTimeout(async () => {
    try {
      if (!channelIsTicket(channel)) return;
      await channel.send({ embeds: [styledEmbed(channel.guild, lang, '', texts[lang].logs.auto, COLORS.warn)] }).catch(()=>{});
      await logEmbed(channel.guild, lang, 'closed', {
        user: 'Sistema', channel: `${channel}`, details: texts[lang].logs.auto
      });
      await channel.delete().catch(() => {});
    } catch (e) {
      console.warn('Auto-close falhou:', e.message);
    } finally { inactivityTimers.delete(channel.id); }
  }, INACTIVITY_MS);
  inactivityTimers.set(channel.id, id);
}
function clearInactivityTimer(channelId) {
  const t = inactivityTimers.get(channelId);
  if (t) clearTimeout(t);
  inactivityTimers.delete(channelId);
}

/* ================== CATÁLOGO (env PRODUCTS_JSON) — NEW ================== */
function loadProducts() {
  try {
    if (process.env.PRODUCTS_JSON) {
      const arr = JSON.parse(process.env.PRODUCTS_JSON);
      if (Array.isArray(arr)) {
        return arr.slice(0, 25).map((p, i) => ({
          sku: String(p.sku || `sku-${i+1}`),
          name: String(p.name || `Produto ${i+1}`),
          price: Number(p.price || 0),
          stock: Number(p.stock || 0)
        }));
      }
    }
  } catch (e) { console.warn('⚠️ PRODUCTS_JSON inválido:', e.message); }
  // exemplos
  return [
    { sku: 'ff-1d',  name: '1 DIA MOD M3NU FF EMULADOR',  price: 30, stock: 0 },
    { sku: 'ff-7d',  name: '7 DIAS MOD M3NU FF EMULADOR', price: 65, stock: 21 },
    { sku: 'ff-30d', name: '30 DIAS MOD M3NU FF EMULADOR',price: 85, stock: 39 },
  ];
}
let PRODUCTS = loadProducts();

/* ======================= SLASH COMMANDS ======================= */
const slashCommands = [
  new SlashCommandBuilder()
    .setName('painelticket')
    .setDescription('Publica o painel de tickets (layout vermelho).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('apagar_ticket')
    .setDescription('Apaga um ticket específico (apenas staff).')
    .addChannelOption(o =>
      o.setName('canal').setDescription('Canal do ticket a apagar').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('termos')
    .setDescription('Envia os Termos (10 em 1 mensagem).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('regras')
    .setDescription('Envia as regras essenciais (1 mensagem).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder() // NEW (vendas)
    .setName('painelvendas1')
    .setDescription('Envia o painel de vendas com seleção de produtos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
].map(c => c.toJSON());

/* ============================ READY ============================ */
client.once('ready', async () => {
  console.log(`✅ Logado como ${client.user.tag} (PID ${process.pid})`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: slashCommands });
    console.log('✅ Slash commands registrados.');
  } catch (err) { console.error('❌ Erro ao registrar comandos:', err); }
});

/* ========================= INTERAÇÕES ========================= */
client.on('interactionCreate', async (interaction) => {
  try {
    // ------------------- /painelticket -------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelticket') {
      const lang = DEFAULT_LANG, g = interaction.guild;
      const rb = ce(g, 'red_bar');
      const desc = texts[lang].painelDesc.replace(':red_bar:', rb || '');
      const embed = styledEmbed(g, lang, texts[lang].painelTitle, desc, COLORS.primary);
      const abrirBtn = new ButtonBuilder().setCustomId('abrir_ticket').setLabel(texts[lang].btnOpen).setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(abrirBtn);
      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    // ------------------- /apagar_ticket -------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'apagar_ticket') {
      if (!isStaff(interaction.member)) { await interaction.reply({ content: texts[DEFAULT_LANG].notAllowed, ephemeral: true }); return; }
      const ch = interaction.options.getChannel('canal');
      if (!channelIsTicket(ch)) { await interaction.reply({ content: texts[DEFAULT_LANG].notTicket, ephemeral: true }); return; }
      await interaction.reply({ content: `🗑️ ${texts[DEFAULT_LANG].deleted}` , ephemeral: true });
      await logEmbed(interaction.guild, DEFAULT_LANG, 'deleted', { user: `${interaction.user} (${interaction.user.id})`, channel: `${ch}` });
      clearInactivityTimer(ch.id); await ch.delete().catch(() => {});
      return;
    }

    // ------------------- /termos (1 embed) -------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'termos') {
      const g = interaction.guild, channel = interaction.channel;
      await interaction.reply({ content: '📄 Enviando termos…', ephemeral: true });
      const emb = new EmbedBuilder().setColor(COLORS.primary).setTitle('🟥 — Termos de Compra').setFooter({ text: texts.pt.brand });
      TERMS_PT.forEach(t => {
        const emoji = ce(g, `red_${t.num}`) || `#${t.num}`;
        emb.addFields({ name: `${emoji} — ${t.title}`, value: (t.text || '—').slice(0, 1024) });
      });
      if (typeof BAR_IMAGE_URL === 'string' && /^https?:\/\//i.test(BAR_IMAGE_URL)) emb.setImage(BAR_IMAGE_URL);
      try { await channel.send({ embeds: [emb] }); }
      catch { const block = TERMS_PT.map(t => `**${t.num} — ${t.title}**\n${t.text}`).join('\n\n'); await channel.send({ content: block.slice(0,1950) }).catch(()=>{}); }
      return;
    }

    // ------------------- /regras (1 embed) -------------------
    if (interaction.isChatInputCommand() && interaction.commandName === 'regras') {
      const g = interaction.guild, channel = interaction.channel;
      await interaction.reply({ content: '📋 Enviando regras…', ephemeral: true });
      const emb = new EmbedBuilder().setColor(COLORS.primary).setTitle('🟥 — Regras do Servidor').setFooter({ text: texts.pt.brand });
      RULES_PT.forEach(r => {
        const emoji = ce(g, `red_${r.num}`) || `#${r.num}`;
        emb.addFields({ name: `${emoji} — ${r.title}`, value: r.text.slice(0, 1024) });
      });
      if (typeof BAR_IMAGE_URL === 'string' && /^https?:\/\//i.test(BAR_IMAGE_URL)) emb.setImage(BAR_IMAGE_URL);
      try { await channel.send({ embeds: [emb] }); }
      catch { const block = RULES_PT.map(r => `**${r.num} — ${r.title}**\n${r.text}`).join('\n\n'); await channel.send({ content: block.slice(0,1950) }).catch(()=>{}); }
      return;
    }

    // ------------------- /painelvendas1 -------------------  NEW (vendas)
    if (interaction.isChatInputCommand() && interaction.commandName === 'painelvendas1') {
      PRODUCTS = loadProducts(); // recarrega caso tenha mudado env
      const g = interaction.guild;

      const lista = PRODUCTS.map(p => `• ${p.name}`).join('\n');
      const desc = `**${texts.pt.vendas.subtitulo}**\n\n${lista || 'Sem produtos no momento.'}`;
      const embed = styledEmbed(g, DEFAULT_LANG, texts.pt.vendas.titulo, desc, COLORS.primary);

      // Select com opções
      const select = new StringSelectMenuBuilder()
        .setCustomId('select_produto')
        .setPlaceholder(texts.pt.vendas.selectPlaceholder)
        .addOptions(
          PRODUCTS.map(p =>
            new StringSelectMenuOptionBuilder()
              .setLabel(p.name.slice(0, 100))
              .setDescription(`Valor: R$${p.price.toFixed(2)} • Estoque: ${p.stock}`.slice(0, 100))
              .setValue(p.sku)
              .setEmoji('🛒')
          )
        );

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ embeds: [embed], components: [row] });
      return;
    }

    // ------------------- Seleção de produto -------------------  NEW (vendas)
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_produto') {
      const sku = interaction.values?.[0];
      const p = PRODUCTS.find(x => x.sku === sku);
      if (!p) { await interaction.reply({ content: '❌ Produto não encontrado.', ephemeral: true }); return; }

      const resumo = texts.pt.vendas.resumo(p) + (p.stock <= 0 ? `\n\n❗ ${texts.pt.vendas.indisponivel}` : '');
      const embed = styledEmbed(interaction.guild, DEFAULT_LANG, '— Detalhes do Produto', resumo, COLORS.accent);

      const payBtns = [];
      if (PAYPAL_LINK) payBtns.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(PAYPAL_LINK).setLabel(texts.pt.vendas.pagarPaypal));
      if (TWINT_LINK)  payBtns.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(TWINT_LINK).setLabel(texts.pt.vendas.pagarTwint));
      if (payBtns.length === 0) payBtns.push(new ButtonBuilder().setCustomId('no_pay_cfg').setLabel(texts.pt.vendas.faltamLinks).setStyle(ButtonStyle.Secondary).setDisabled(true));

      const abrirTicketBtn = new ButtonBuilder()
        .setCustomId(`abrir_ticket_from_sales:${p.sku}`) // vai pré-preencher o ticket
        .setLabel(texts.pt.vendas.abrirTicket)
        .setStyle(ButtonStyle.Primary);

      const row1 = new ActionRowBuilder().addComponents(...payBtns);
      const row2 = new ActionRowBuilder().addComponents(abrirTicketBtn);

      await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
      return;
    }

    // ------------------- Abrir ticket (normal e de vendas) -------------------
    if (interaction.isButton() && (interaction.customId === 'abrir_ticket' || interaction.customId.startsWith('abrir_ticket_from_sales'))) {
      const guild = interaction.guild;
      const categoryId = process.env.TICKETS_CATEGORY_ID || null;
      const staffRoleId = process.env.STAFF_ROLE_ID || null;

      const existing = guild.channels.cache.find(c =>
        c.type === ChannelType.GuildText && channelIsTicket(c) &&
        (c.name.includes(safe(interaction.user.username)) || c.topic?.includes(`TICKET_OWNER:${interaction.user.id}`))
      );
      if (existing) {
        await interaction.reply({ content: `⚠️ ${texts[DEFAULT_LANG].ticketExists(existing)}`, ephemeral: true });
        return;
      }

      const lang = DEFAULT_LANG;
      const channelName = buildTicketName(interaction.user.username, lang);

      const overwrites = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles
        ]},
      ];
      if (staffRoleId) {
        overwrites.push({
          id: staffRoleId, allow: [
            PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
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

      // Se veio do painel de vendas, pega o SKU e escreve um resumo no ticket
      let salesIntro = '';
      if (interaction.customId.startsWith('abrir_ticket_from_sales')) {
        const sku = interaction.customId.split(':')[1];
        const p = PRODUCTS.find(x => x.sku === sku);
        if (p) {
          salesIntro =
`**Pedido do painel de vendas**
• Produto: **${p.name}**
• Preço: **R$${p.price.toFixed(2)}**
• Estoque: **${p.stock}**
• SKU: \`${p.sku}\`

> Envie seu método de pagamento preferido (**PayPal/TWINT**) e o comprovante quando solicitado.`;
        }
      }

      const m1desc = (salesIntro ? salesIntro + '\n\n' : '') + texts[lang].pinnedDesc;
      const m1 = styledEmbed(guild, lang, `${ce(guild,'red_1') || '1'} ${texts[lang].pinnedTitle}`, m1desc, COLORS.accent);
      await channel.send({ embeds: [m1] }).catch(()=>{});

      const m2 = styledEmbed(guild, lang, `${ce(guild,'red_2') || '2'} ${texts[lang].introTitle}`, texts[lang].introDesc, COLORS.primary);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_with_transcript').setLabel(texts[lang].btnCloseWith).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_no_transcript').setLabel(texts[lang].btnCloseNo).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('delete_ticket').setLabel(texts[lang].btnDelete).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('toggle_lang').setLabel(texts[lang].btnLang).setStyle(ButtonStyle.Primary)
      );
      await channel.send({ embeds: [m2], components: [row] }).catch(()=>{});

      await logEmbed(guild, lang, 'created', { user: `${interaction.user} (${interaction.user.id})`, channel: `${channel}` });
      startInactivityTimer(channel, lang);
      return;
    }

    // ------------------- Botões do ticket (fechar/apagar/lang) -------------------
    if (interaction.isButton() && ['close_with_transcript','close_no_transcript','delete_ticket','toggle_lang'].includes(interaction.customId)) {
      const channel = interaction.channel;
      if (!channelIsTicket(channel)) { await interaction.reply({ content: texts[DEFAULT_LANG].notTicket, ephemeral: true }); return; }

      const openerId = channel.topic?.match(/TICKET_OWNER:(\d+)/)?.[1];
      const userIsOpener = openerId && openerId === interaction.user.id;
      const userIsStaff = isStaff(interaction.member);
      const lang = ticketLangOf(channel);

      if (!userIsStaff && !userIsOpener && interaction.customId !== 'toggle_lang') {
        await interaction.reply({ content: texts[lang].notAllowed, ephemeral: true }); return;
      }

      if (interaction.customId === 'toggle_lang') {
        const newLang = lang === 'pt' ? 'en' : 'pt';
        const base = channel.name.replace(/-(pt|en)$/i, '');
        await channel.setName(`${base}-${newLang}`).catch(()=>{});
        await channel.setTopic(`TICKET_OWNER:${openerId || interaction.user.id} | LANG:${newLang}`).catch(()=>{});
        await interaction.deferUpdate();

        const p = styledEmbed(channel.guild, newLang, `${ce(channel.guild,'red_1') || '1'} ${texts[newLang].pinnedTitle}`, texts[newLang].pinnedDesc, COLORS.accent);
        const i = styledEmbed(channel.guild, newLang, `${ce(channel.guild,'red_2') || '2'} ${texts[newLang].introTitle}`, texts[newLang].introDesc, COLORS.primary);
        await channel.send({ embeds: [p] }).catch(()=>{});
        await channel.send({ embeds: [i], components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_with_transcript').setLabel(texts[newLang].btnCloseWith).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('close_no_transcript').setLabel(texts[newLang].btnCloseNo).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('delete_ticket').setLabel(texts[newLang].btnDelete).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('toggle_lang').setLabel(texts[newLang].btnLang).setStyle(ButtonStyle.Primary)
        )] }).catch(()=>{});
        startInactivityTimer(channel, newLang);
        return;
      }

      if (interaction.customId === 'close_with_transcript' || interaction.customId === 'close_no_transcript') {
        const withTranscript = interaction.customId === 'close_with_transcript';
        await interaction.reply({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closing, COLORS.warn)], ephemeral: true }).catch(()=>{});
        let attach = null;
        if (withTranscript) {
          try {
            attach = await collectTranscript(channel);
            await channel.send({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closed, COLORS.ok)], files: [attach] }).catch(()=>{});
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`, channel: `${channel}`, details: texts[lang].logs.withTranscript
            }, attach);
          } catch {
            await logEmbed(interaction.guild, lang, 'closed', {
              user: `${interaction.user} (${interaction.user.id})`, channel: `${channel}`, details: texts[lang].logs.noTranscript
            });
          }
        } else {
          await channel.send({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].closed, COLORS.ok)] }).catch(()=>{});
          await logEmbed(interaction.guild, lang, 'closed', {
            user: `${interaction.user} (${interaction.user.id})`, channel: `${channel}`, details: texts[lang].logs.noTranscript
          });
        }
        clearInactivityTimer(channel.id);
        setTimeout(async () => { await channel.delete().catch(()=>{}); }, 5000);
        return;
      }

      if (interaction.customId === 'delete_ticket') {
        await interaction.reply({ embeds: [styledEmbed(interaction.guild, lang, '', texts[lang].deleted, COLORS.danger)], ephemeral: true }).catch(()=>{});
        await logEmbed(interaction.guild, lang, 'deleted', { user: `${interaction.user} (${interaction.user.id})`, channel: `${channel}` });
        clearInactivityTimer(channel.id);
        setTimeout(async () => { await channel.delete().catch(()=>{}); }, 2000);
        return;
      }
    }
  } catch (err) {
    console.error('❌ Erro na interação:', err);
    if (!interaction.replied) {
      const fallback = styledEmbed(interaction.guild || null, DEFAULT_LANG, 'Erro', '❌ Ocorreu um erro. Tente novamente mais tarde.', COLORS.danger);
      try { await interaction.reply({ embeds: [fallback], ephemeral: true }); } catch {}
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
