const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const http = require('http');

const CONFIG_PATH = path.join(__dirname, 'config.json');

// Cargar o crear configuración (admite tanto config.json como variables de entorno de la nube)
function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {}
  }
  return {
    bot_token: process.env.BOT_TOKEN || fileConfig.bot_token || "PEGA_AQUI_EL_TOKEN_DE_BOTFATHER",
    channel_id: process.env.CHANNEL_ID || fileConfig.channel_id || "@ElNombreDeTuCanal",
    admin_id: process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : (fileConfig.admin_id || null)
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

const config = loadConfig();

// Servidor HTTP ligero para que plataformas como Render no lo apaguen
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🌯 DurumsBets Bot está activo y corriendo 24/7 🚀\n');
}).listen(PORT, () => {
  console.log(`🌐 Servidor de salud activo en el puerto ${PORT}`);
});

if (!config.bot_token || config.bot_token === "PEGA_AQUI_EL_TOKEN_DE_BOTFATHER") {
  console.log("==================================================================");
  console.log("❌ ERROR: Aún no has configurado tu BOT_TOKEN.");
  console.log("1. Abre el archivo 'config.json' en esta carpeta.");
  console.log("2. Pega el Token que te dio @BotFather.");
  console.log("3. Escribe el @nombre_de_tu_canal en channel_id.");
  console.log("4. Vuelve a ejecutar este archivo.");
  console.log("==================================================================");
  process.exit(1);
}

const bot = new Telegraf(config.bot_token);

// Memoria temporal para creación de picks por usuario
const userSessions = new Map();

// Helper para teclado principal
function getMainMenu() {
  return Markup.keyboard([
    ['🎯 Publicar Pick', '✅ Celebrar Verde'],
    ['🔥 Aviso de Stakazo', '📢 Envío Rápido'],
    ['🔗 Vincular Canal', '❓ Ayuda']
  ]).resize();
}

// Detectar automáticamente cuando añaden el bot como administrador a un canal
bot.on('my_chat_member', async (ctx) => {
  const chat = ctx.chat;
  if (chat && (chat.type === 'channel' || chat.type === 'supergroup')) {
    config.channel_id = chat.id;
    saveConfig(config);
    console.log(`✅ Canal vinculado automáticamente: ${chat.title} (${chat.id})`);
    if (config.admin_id) {
      await ctx.telegram.sendMessage(
        config.admin_id,
        `🎉 *¡CANAL VINCULADO AUTOMÁTICAMENTE!*\n\n` +
        `📢 Canal: *${chat.title}*\n` +
        `🆔 ID: \`${chat.id}\`\n\n` +
        `¡Ya puedes publicar apuestas con tus botones! 🌯🚀`,
        { parse_mode: 'Markdown', ...getMainMenu() }
      ).catch(() => {});
    }
  }
});

// ACEPTACIÓN AUTOMÁTICA DE NUEVOS MIEMBROS ("Solicitar unirse")
bot.on('chat_join_request', async (ctx) => {
  try {
    const user = ctx.chatJoinRequest.from;
    const chatId = ctx.chatJoinRequest.chat.id;

    // Aprobar la solicitud automáticamente
    await ctx.telegram.approveChatJoinRequest(chatId, user.id);
    console.log(`👤 Miembro aprobado automáticamente: ${user.first_name} (@${user.username || 'sin_user'})`);

    // Mensaje privado de bienvenida al nuevo miembro
    await ctx.telegram.sendMessage(
      user.id,
      `👋 ¡Hola ${user.first_name}! Bienvenido a *DurumsBets* 🌯🎯\n\n` +
      `Tu solicitud ha sido aprobada con éxito. Ya estás dentro del canal oficial.\n\n` +
      `🔔 *Muy importante:* Activa las notificaciones del canal para que no te pierdas ningún pick antes de que bajen las cuotas.\n\n` +
      `🔞 +18 | Juega con responsabilidad y cabeza. ¡A ganar! 💸`,
      { parse_mode: 'Markdown' }
    ).catch(() => {
      // Si el usuario tiene bloqueados los MD de bots, no pasa nada
    });

  } catch (err) {
    console.error('Error al aprobar miembro automáticamente:', err.message);
  }
});

// Middleware de verificación de Administrador
bot.use(async (ctx, next) => {
  if (!ctx.from) return;

  // Si no hay admin configurado, el primero que inicie el bot se convierte en Admin automáticamente
  if (!config.admin_id) {
    config.admin_id = ctx.from.id;
    saveConfig(config);
    await ctx.reply(
      `👑 ¡Bienvenido, Jefe! Te he registrado automáticamente como el Administrador de DurumsBets.\nTu ID de usuario es: ${ctx.from.id}`,
      getMainMenu()
    );
  }

  // Verificar si quien habla es el administrador
  if (ctx.from.id !== config.admin_id) {
    return ctx.reply('⛔ Este bot es privado para gestionar el canal DurumsBets.');
  }

  // Interceptar mensajes reenviados desde un canal para vincularlo automáticamente
  if (ctx.message) {
    const forwardChat = ctx.message.forward_from_chat || (ctx.message.forward_origin && ctx.message.forward_origin.chat);
    if (forwardChat && (forwardChat.type === 'channel' || forwardChat.id)) {
      config.channel_id = forwardChat.id;
      saveConfig(config);
      return ctx.reply(
        `🎉 *¡CANAL VINCULADO CON ÉXITO!*\n\n` +
        `📢 Canal detectado: *${forwardChat.title || 'Tu canal'}*\n` +
        `🆔 ID del canal: \`${forwardChat.id}\`\n\n` +
        `¡El bot ya sabe exactamente a qué canal enviar los mensajes! Ahora puedes publicar lo que quieras. 🌯🚀`,
        { parse_mode: 'Markdown', ...getMainMenu() }
      );
    }
  }

  return next();
});

// Comando /start
bot.start((ctx) => {
  userSessions.delete(ctx.from.id);
  ctx.reply(
    `🌯 ¡Hola, crack! Bienvenido al panel de control de *DurumsBets*.\n\n` +
    `📢 Canal configurado actualmente: *${config.channel_id}*\n\n` +
    `Elige en el menú de abajo qué quieres hacer:`,
    { parse_mode: 'Markdown', ...getMainMenu() }
  );
});

bot.hears('🔗 Vincular Canal', (ctx) => {
  ctx.reply(
    `🔗 *CÓMO VINCULAR TU CANAL EN 10 SEGUNDOS:*\n\n` +
    `1️⃣ Ve a tu canal de Telegram y mete a *@DurumsBetsOficialBot* como *Administrador* (con permiso para publicar mensajes).\n\n` +
    `2️⃣ Escribe cualquier mensaje en tu canal (o usa uno viejo), mantén pulsado y dale a **Reenviar** (Forward).\n\n` +
    `3️⃣ Reenvíamelo aquí a este chat con el bot.\n\n` +
    `✨ En cuanto me lo reenvíes, detectaré el canal y lo vincularé solo sin que tengas que escribir ningún ID.`,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('❓ Ayuda', (ctx) => {
  ctx.reply(
    `📖 *GUÍA RÁPIDA DE USO:*\n\n` +
    `1️⃣ *🎯 Publicar Pick:* Te preguntará el partido, pronóstico, cuota y stake para crear un pick con diseño profesional.\n` +
    `2️⃣ *✅ Celebrar Verde:* Envía la foto de tu ticket ganador y la publica con mensaje de victoria.\n` +
    `3️⃣ *🔥 Aviso de Stakazo:* Mensajes de hype ("¡Atentos en 15 min!").\n` +
    `4️⃣ *📢 Envío Rápido:* Manda cualquier foto o texto al chat y el bot te preguntará si quieres enviarlo directo al canal.\n` +
    `5️⃣ *🔗 Vincular Canal:* Reenvía cualquier mensaje de tu canal aquí para conectarlo.\n\n` +
    `⚙️ *Canal actual:* ${config.channel_id}`,
    { parse_mode: 'Markdown' }
  );
});

// --- 1. FLUJO: PUBLICAR PICK ---
bot.hears('🎯 Publicar Pick', (ctx) => {
  userSessions.set(ctx.from.id, { step: 'PICK_EVENT', data: {} });
  ctx.reply(
    `🎯 *PASO 1/5: Evento o Partido*\n\n` +
    `Escribe los equipos o el evento.\n` +
    `_Ejemplo: Real Madrid vs Barcelona_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_flow')]])
    }
  );
});

// --- 2. FLUJO: CELEBRAR VERDE ---
bot.hears('✅ Celebrar Verde', (ctx) => {
  userSessions.set(ctx.from.id, { step: 'WAITING_GREEN_PHOTO' });
  ctx.reply(
    `📸 *¡A CELEBRAR EL VERDE!* 💸\n\n` +
    `Envía ahora la captura de pantalla de la apuesta ganada (ticket verde de la casa de apuestas).`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_flow')]])
    }
  );
});

// --- 3. FLUJO: AVISO DE STAKAZO / HYPE ---
bot.hears('🔥 Aviso de Stakazo', (ctx) => {
  ctx.reply(
    `🔥 *ELIGE UN MENSAJE DE HYPE PARA EL CANAL:*`,
    Markup.inlineKeyboard([
      [Markup.button.callback('💣 Bomba Europa League', 'hype_europa')],
      [Markup.button.callback('⏳ En 15 Minutos Lanzamos Pick', 'hype_15min')],
      [Markup.button.callback('🚨 Atentos al Canal (Stakazo)', 'hype_atentos')],
      [Markup.button.callback('❌ Cancelar', 'cancel_flow')]
    ])
  );
});

// Plantillas de Hype
bot.action('hype_europa', async (ctx) => {
  await ctx.answerCbQuery();
  const text = 
    `💣💥 *¡TODOS LISTOS PARA ESTA MEGA BOMBA!* 💥💣\n\n` +
    `🔥 *STAKAZO DE HOY LISTO PARA REVENTAR LA CASA*\n` +
    `📊 Cuota superior a *@2.00*\n\n` +
    `👉 Activad las notificaciones 🔔 para meterla nada más salir antes de que se desplome la cuota. ¡VAMOOOS! 🌯🚀`;
  
  await showConfirmation(ctx, text);
});

bot.action('hype_15min', async (ctx) => {
  await ctx.answerCbQuery();
  const text = 
    `⏳ *¡EN 15 MINUTOS SOLTAMOS EL PICK DEL DÍA!* 🌯🔥\n\n` +
    `Los analistas tienen los números listos. Mucho valor detectado en el mercado.\n` +
    `🔔 Revisad que tenéis el canal con sonido para pillarla a máxima cuota.`;

  await showConfirmation(ctx, text);
});

bot.action('hype_atentos', async (ctx) => {
  await ctx.answerCbQuery();
  const text = 
    `🚨 *¡MUY ATENTOS A DURUMSBETS!* 🚨\n\n` +
    `Se viene jugada fuerte hoy. No hagáis planes raros que hoy sumamos sí o sí. 💸✅\n` +
    `¿Quiénes están activos por aquí? Dejad vuestra reacción 🔥👇`;

  await showConfirmation(ctx, text);
});

// --- 4. ENVÍO RÁPIDO ---
bot.hears('📢 Envío Rápido', (ctx) => {
  userSessions.set(ctx.from.id, { step: 'QUICK_SEND' });
  ctx.reply(
    `📢 *MODO ENVÍO RÁPIDO:*\n\n` +
    `Manda ahora mismo cualquier texto, foto o captura y te pediré confirmación antes de lanzarla al canal.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancelar', 'cancel_flow')]])
    }
  );
});

// Manejo de Cancelación
bot.action('cancel_flow', async (ctx) => {
  await ctx.answerCbQuery('Cancelado');
  userSessions.delete(ctx.from.id);
  ctx.reply('❌ Operación cancelada. ¿Qué quieres hacer ahora?', getMainMenu());
});

// Confirmación y envío al canal
async function showConfirmation(ctx, text, photoId = null) {
  const session = {
    step: 'CONFIRM_POST',
    pendingPost: { text, photoId }
  };
  userSessions.set(ctx.from.id, session);

  if (photoId) {
    await ctx.replyWithPhoto(photoId, {
      caption: `👀 *VISTA PREVIA DEL MENSAJE:*\n\n${text}`,
      parse_mode: 'Markdown'
    });
  } else {
    await ctx.reply(
      `👀 *VISTA PREVIA DEL MENSAJE:*\n\n${text}`,
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply(
    `¿Quieres enviar esto ahora mismo a *${config.channel_id}*?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🚀 ¡SÍ, PUBLICAR EN EL CANAL!', 'publish_now')],
        [Markup.button.callback('❌ Cancelar', 'cancel_flow')]
      ])
    }
  );
}

bot.action('publish_now', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  if (!session || !session.pendingPost) {
    return ctx.reply('⚠️ No hay ningún mensaje pendiente de publicar.', getMainMenu());
  }

  const { text, photoId } = session.pendingPost;

  try {
    if (photoId) {
      await ctx.telegram.sendPhoto(config.channel_id, photoId, {
        caption: text,
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.telegram.sendMessage(config.channel_id, text, {
        parse_mode: 'Markdown'
      });
    }
    userSessions.delete(ctx.from.id);
    await ctx.reply(`✅ *¡PUBLICADO CON ÉXITO EN EL CANAL!* 🚀🎉`, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
  } catch (error) {
    console.error('Error al publicar en canal:', error);
    await ctx.reply(
      `❌ *Error al publicar en Telegram:*\n${error.message}\n\n` +
      `👉 Asegúrate de que el bot sea ADMINISTRADOR en tu canal con permisos para enviar mensajes.`,
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
  }
});

// Manejo de mensajes de texto en flujos
bot.on('text', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  const text = ctx.message.text.trim();

  // Si no está en ningún flujo activo pero escribe algo
  if (!session) {
    // Ofrecer envío rápido directo
    await showConfirmation(ctx, text);
    return;
  }

  // En flujo de Pick
  if (session.step === 'PICK_EVENT') {
    session.data.event = text;
    session.step = 'PICK_PREDICTION';
    return ctx.reply(
      `🎯 *PASO 2/5: Pronóstico*\n\n` +
      `¿Cuál es la apuesta?\n` +
      `_Ejemplo: Más de 2.5 goles / Gana local y marcan ambos_`,
      { parse_mode: 'Markdown' }
    );
  }

  if (session.step === 'PICK_PREDICTION') {
    session.data.prediction = text;
    session.step = 'PICK_ODDS';
    return ctx.reply(
      `📊 *PASO 3/5: Cuota*\n\n` +
      `¿Qué cuota tiene?\n` +
      `_Ejemplo: 1.85_`,
      { parse_mode: 'Markdown' }
    );
  }

  if (session.step === 'PICK_ODDS') {
    session.data.odds = text;
    session.step = 'PICK_STAKE';
    return ctx.reply(
      `💰 *PASO 4/5: Stake*\n\n` +
      `¿Qué stake le metemos (1 al 10)?\n` +
      `_Ejemplo: 2_`,
      { parse_mode: 'Markdown' }
    );
  }

  if (session.step === 'PICK_STAKE') {
    session.data.stake = text;
    session.step = 'PICK_PHOTO_OR_SKIP';

    return ctx.reply(
      `📸 *PASO 5/5: Foto o Ticket (Opcional)*\n\n` +
      `Envía una foto de la apuesta o pulsa el botón para publicarlo sin foto:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➡️ Continuar SIN FOTO', 'skip_pick_photo')],
          [Markup.button.callback('❌ Cancelar', 'cancel_flow')]
        ])
      }
    );
  }

  // En flujo de envío rápido
  if (session.step === 'QUICK_SEND') {
    await showConfirmation(ctx, text);
  }
});

// Continuar pick sin foto
bot.action('skip_pick_photo', async (ctx) => {
  await ctx.answerCbQuery();
  const session = userSessions.get(ctx.from.id);
  if (!session || !session.data) return;

  const formattedText = formatPickMessage(session.data);
  await showConfirmation(ctx, formattedText, null);
});

// Manejo de fotos recibidas
bot.on('photo', async (ctx) => {
  const session = userSessions.get(ctx.from.id);
  const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Calidad máxima
  const caption = ctx.message.caption || '';

  // 1. Si está en flujo de Pick con foto
  if (session && session.step === 'PICK_PHOTO_OR_SKIP') {
    const formattedText = formatPickMessage(session.data);
    await showConfirmation(ctx, formattedText, photo.file_id);
    return;
  }

  // 2. Si está en flujo de celebrar Verde
  if (session && session.step === 'WAITING_GREEN_PHOTO') {
    const greenText = 
      `¡¡¡OTRO VERDE MÁS PARA DURUMSBETS!!! 💸✅✅✅\n\n` +
      `Seguimos reventando a las casas de apuestas. 🌯🔥\n` +
      `¡Enhorabuena a todos los que la siguieron! 💰🥂\n\n` +
      `#DurumsBets #Verde #Picks`;
    await showConfirmation(ctx, greenText, photo.file_id);
    return;
  }

  // 3. Envío rápido o foto suelta directa
  const defaultText = caption || `🌯 *DURUMSBETS | NUEVO PICK* 🔥\n\n¡Vamos con todo equipo! 💸`;
  await showConfirmation(ctx, defaultText, photo.file_id);
});

// Formateador visual del pick
function formatPickMessage(data) {
  return (
    `🟢 *PICK DEL DÍA | DURUMSBETS* 🌯🎯\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚽ *Evento:* ${data.event}\n` +
    `🎯 *Pronóstico:* ${data.prediction}\n` +
    `📊 *Cuota:* @${data.odds}\n` +
    `💰 *Stake:* ${data.stake}/10\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🔔 Activa las notificaciones para no perderte ninguna cuota.\n` +
    `🔞 +18 | Juega con responsabilidad`
  );
}

// Iniciar bot
console.log("Conectando con Telegram...");
bot.launch().catch((err) => {
  console.error("❌ Error al iniciar el bot:", err.message);
});

console.log("==================================================================");
console.log("🤖 ¡BOT DE DURUMSBETS INICIADO CON ÉXITO!");
console.log(`📢 Canal configurado: ${config.channel_id}`);
console.log(`📱 En Telegram, busca tu bot: @DurumsBetsOficialBot`);
console.log("👉 Pulsa Iniciar o escribe /start para empezar");
console.log("==================================================================");

// Detener limpiamente
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
