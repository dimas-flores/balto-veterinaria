// Este proceso se ejecuta antes de n8n. Ningún secreto se añade al workflow.
const fs = require('node:fs');
const crypto = require('node:crypto');
const origin = new URL(process.env.CHAT_ALLOWED_ORIGIN).origin;
const base = new URL(process.env.DRUPAL_BASE_URL).origin;
const workflow = JSON.parse(fs.readFileSync('/workflows/chatbot.json', 'utf8'));
workflow.nodes.find(n => n.name === 'Recibir chat').parameters.options.allowedOrigins = origin;
workflow.nodes.find(n => n.name === 'Detectar intención').parameters.jsCode = workflow.nodes.find(n => n.name === 'Detectar intención').parameters.jsCode.replace("const allowedOrigin = 'http://localhost:8080';", `const allowedOrigin = ${JSON.stringify(origin)};`);
workflow.nodes.find(n => n.name === 'Responder en español').parameters.jsCode = workflow.nodes.find(n => n.name === 'Responder en español').parameters.jsCode.replace("const publicBase = 'http://localhost:8080';", `const publicBase = ${JSON.stringify(base)};`);
const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
const geminiEnabled = process.env.GEMINI_ENABLED === 'true' && !!geminiKey;
const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
if (!/^[a-z0-9.-]+$/.test(model)) throw new Error('GEMINI_MODEL inválido');
if (geminiEnabled) {
  for (const name of ['Interpretar con Gemini', 'Crear respuesta Gemini']) {
    workflow.nodes.find(n => n.name === name).parameters.url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  }
} else {
  const optionalNodes = [
    'Usar Gemini', 'Preparar Gemini', 'Interpretar con Gemini',
    'Redactar con Gemini', 'Preparar redacción', 'Crear respuesta Gemini', 'Validar respuesta',
    'Gemini opcional', 'Redacción opcional',
  ];
  workflow.nodes = workflow.nodes.filter(node => !optionalNodes.includes(node.name));
  workflow.connections['¿Mensaje válido?'].main[0] = workflow.connections['Usar Gemini'].main[1];
  workflow.connections['Responder en español'] = {main: [workflow.connections['Redactar con Gemini'].main[1]]};
  for (const name of optionalNodes) delete workflow.connections[name];

  const positions = {
    'Entrada': [0, 0],
    'Datos de Drupal': [640, 0],
    'Respuesta': [1550, 0],
    'Recibir chat': [40, 310],
    'Detectar intención': [220, 310],
    '¿Mensaje válido?': [400, 310],
    'Validar interpretación': [580, 310],
    'Leer contacto': [760, 310],
    '¿Buscar por categoría?': [940, 310],
    'Leer categorías': [1040, 145],
    'Preparar consulta': [1140, 310],
    '¿Hace falta otra consulta?': [1340, 310],
    'Consultar Drupal': [1440, 145],
    'Responder en español': [1560, 310],
    'Enviar respuesta': [1760, 310],
    'Responder error de entrada': [490, 510],
    'Enviar error': [690, 510],
  };
  const widths = {'Entrada': 620, 'Datos de Drupal': 890, 'Respuesta': 340};
  for (const node of workflow.nodes) {
    node.position = positions[node.name] ?? node.position;
    if (widths[node.name]) node.parameters.width = widths[node.name];
  }
}
const serialized = JSON.stringify(workflow);
fs.writeFileSync('/tmp/balto-chatbot.json', serialized, { mode: 0o600 });
const orderSecret = (process.env.BALTO_N8N_SECRET || '').trim();
const telegramToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const telegramChat = (process.env.TELEGRAM_CHAT_ID || '').trim();
if (telegramChat && !/^-?\d+$/.test(telegramChat)) throw new Error('TELEGRAM_CHAT_ID inválido');
const stockThreshold = Number.parseInt(process.env.STOCK_ALERT_THRESHOLD || '5', 10);
if (!Number.isInteger(stockThreshold) || stockThreshold < 0 || stockThreshold > 100000) throw new Error('STOCK_ALERT_THRESHOLD inválido');
const ordersEnabled = orderSecret.length >= 32 && !!telegramToken && !!telegramChat;
// El Telegram Trigger solo funciona con una URL pública HTTPS.
const botEnabled = ordersEnabled && /^https:\/\//.test(process.env.WEBHOOK_URL || '');
const fill = f => fs.readFileSync(f, 'utf8')
  .replaceAll('__TELEGRAM_CHAT_ID__', telegramChat || '0')
  .replaceAll('__STOCK_THRESHOLD__', String(stockThreshold))
  .replaceAll('__TELEGRAM_PAYMENT_BUTTON__', botEnabled ? 'enabled' : 'disabled');
const orders = fill('/workflows/pedidos.json');
const bot = fill('/workflows/bot.json');
fs.writeFileSync('/tmp/balto-pedidos.json', orders, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot.json', bot, { mode: 0o600 });
fs.writeFileSync('/tmp/balto-orders-enabled', ordersEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-bot-enabled', botEnabled ? '1' : '0', { mode: 0o600 });
fs.writeFileSync('/tmp/balto-workflow.sha256', crypto.createHash('sha256').update(serialized + orders + bot + ordersEnabled + botEnabled + (process.env.WEBHOOK_URL || '')).digest('hex'));
const key = process.env.VET_API_KEY;
if (!key || key.length < 32) throw new Error('Falta configurar VET_API_KEY.');
const credentials = [{ id: 'baltoDrupalApi', name: 'BALTO API interna', type: 'httpHeaderAuth', data: { name: 'X-API-KEY', value: key } }];
credentials.push({id: 'baltoGeminiApi', name: 'BALTO Gemini', type: 'httpHeaderAuth', data: {name: 'x-goog-api-key', value: geminiEnabled ? geminiKey : 'disabled'}});
credentials.push({ id: 'baltoPedidoSecret', name: 'BALTO secreto de pedidos', type: 'httpHeaderAuth', data: { name: 'X-Balto-Secret', value: ordersEnabled ? orderSecret : crypto.randomBytes(32).toString('hex') } });
credentials.push({ id: 'baltoTelegram', name: 'BALTO Telegram', type: 'telegramApi', data: { accessToken: telegramToken || 'disabled', baseUrl: 'https://api.telegram.org' } });
fs.writeFileSync('/tmp/balto-credentials.json', JSON.stringify(credentials), {mode: 0o600});
