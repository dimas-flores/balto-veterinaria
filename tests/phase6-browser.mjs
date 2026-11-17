/** Widget real en Brave/Chromium; sin servicios de IA ni claves en el cliente. */
import puppeteer from 'npm:puppeteer-core@25.10.0';
const root = new URL('../', import.meta.url).pathname;
const base = Deno.env.get('BALTO_TEST_URL') || 'http://localhost:8080';
// El formulario de producto usa el carrito lateral: se espera su respuesta y se cierra el panel.
const addToCart = async (p) => {
  await p.$eval('[data-cart-status]', (el) => { el.textContent = ''; });
  await p.click('.product-cart-form input[type=submit]');
  await p.waitForFunction(() => document.querySelector('.cart-drawer.is-open') && document.querySelector('[data-cart-status]').textContent.trim() !== '', { timeout: 20000 });
  const status = await p.$eval('[data-cart-status]', (el) => el.textContent);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => document.querySelector('[data-cart-drawer]').hidden, { timeout: 5000 });
  return status;
};
const results = [], errors = [];
const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); console.log('OK:', message); };
const browser = await puppeteer.launch({ executablePath: Deno.env.get('BALTO_BROWSER') || '/opt/brave-bin/brave', headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
const visit = path => page.goto(base+path, {waitUntil:'networkidle0'});
async function send(message) {
  const before = await page.$$eval('.chat-message-assistant', els => els.length);
  await page.type('#chat-message', message);
  await page.click('.chat-form button');
  await page.waitForFunction(n => document.querySelectorAll('.chat-message-assistant').length > n && document.querySelector('.chat-typing').hidden, {}, before);
  return page.$eval('.chat-message-assistant:last-child', el => el.textContent);
}
try {
  await page.setViewport({width:1440,height:1000});
  await visit('/');
  check(await page.$eval('.chat-panel', e => e.hidden), 'Chat cerrado inicialmente');
  check(await page.$eval('.chat-launcher', e => e.getAttribute('aria-expanded') === 'false'), 'Estado accesible inicial del botón');
  await page.click('.chat-launcher');
  check(await page.$eval('#chat-message', e => e === document.activeElement), 'Abrir chat enfoca el campo de mensaje');
  check((await page.$eval('.chat-history', e => e.textContent)).includes('¡Hola!'), 'Saludo local visible');
  const text = await send('precio de Dog Chow');
  check(text.includes('S/ ') && text.includes('unidades disponibles') && text.includes('ejemplo'), 'Respuesta real n8n con precio, stock y aviso de ejemplo');
  check(await page.$eval('.chat-links a', a => a.href.startsWith(location.origin+'/product/')), 'Enlace de producto utilizable');
  await page.screenshot({path:root+'docs/capturas/fase-6-chat-escritorio.png',fullPage:false});
  await page.keyboard.press('Escape');
  check(await page.$eval('.chat-panel', e => e.hidden), 'Escape cierra el chat');
  check(await page.$eval('.chat-launcher', e => e === document.activeElement), 'Al cerrar vuelve el foco al botón');
  await visit('/tienda');
  await page.click('.chat-launcher');
  check((await page.$eval('.chat-history', e => e.textContent)).includes('Dog Chow'), 'Historial conservado al navegar dentro de la pestaña');
  await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click('.chat-links a')]);
  check(new URL(page.url()).pathname.startsWith('/product/'), 'Desde el chat se abre el detalle nativo de Commerce');
  await addToCart(page);
  await visit('/cart');
  check((await page.$eval('main',e=>e.textContent)).includes('Dog Chow'), 'Producto consultado en chat se puede agregar al carrito');
  // El carrito de esta sesión es temporal; quitar su producto no cambia stock.
  const remove = await page.$('input[name^="remove_button"]');
  if (remove) await Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),remove.click()]);
  await visit('/');
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.click('.chat-launcher');
  const messagesBeforeSchedule = await page.$$eval('.chat-message-assistant', messages => messages.length);
  await page.click('.chat-prompts button:last-child');
  await page.waitForFunction(count => document.querySelectorAll('.chat-message-assistant').length > count && document.querySelector('.chat-typing').hidden, {}, messagesBeforeSchedule);
  check(await page.$eval('.chat-panel',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}), 'Ventana de chat dentro de la pantalla móvil');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'Página móvil sin desbordamiento horizontal');
  check((await page.$eval('.chat-history',e=>e.textContent)).includes('24 horas'), 'Consulta sugerida de horarios obtiene hospitalización real');
  await page.screenshot({path:root+'docs/capturas/fase-6-chat-movil.png',fullPage:false});
  // Respuesta hostil simulada: demostrar que nunca se interpreta HTML remoto.
  await page.setRequestInterception(true);
  let mode = 'xss';
  page.on('request', async request => {
    if (!request.url().includes('/webhook/chat')) return request.continue();
    if (request.method() === 'OPTIONS') return request.respond({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type'}});
    await new Promise(resolve=>setTimeout(resolve,400));
    if (mode === 'offline') return request.abort('failed');
    return request.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':base},body:JSON.stringify({reply:'<img src=x onerror="window.BALTO_XSS=true">',links:[{label:'Enlace inseguro',url:'javascript:alert(1)'}]})});
  });
  const sending = send('prueba de seguridad');
  await page.waitForFunction(()=>!document.querySelector('.chat-typing').hidden);
  check(await page.$eval('.chat-form button',e=>e.disabled), 'Indicador de escritura y bloqueo de envíos duplicados');
  await sending;
  check(await page.evaluate(()=>!window.BALTO_XSS&&!document.querySelector('.chat-message img')), 'Respuesta remota renderizada como texto sin ejecutar HTML');
  check(await page.$$eval('.chat-links a',els=>!els.some(a=>a.href.startsWith('javascript:'))), 'Enlaces peligrosos descartados');
  mode = 'offline';
  const errorText = await send('otra consulta');
  check(errorText.includes('No pude conectar') && errorText.includes('WhatsApp'), 'Error de red con mensaje comprensible y alternativa de contacto');
  await page.click('.chat-clear');
  check(await page.$$eval('.chat-message',els=>els.length===1), 'Borrar conversación elimina el historial y deja el saludo');
  check(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('balto-chat-session-v1')).length===1), 'Borrado reflejado en almacenamiento de sesión');
  const separate = await browser.createBrowserContext();
  const fresh = await separate.newPage();
  await fresh.goto(base,{waitUntil:'networkidle0'});
  check(await fresh.evaluate(()=>JSON.parse(sessionStorage.getItem('balto-chat-session-v1')).length===1), 'Otra sesión no recibe el historial anterior');
  const html = await fresh.content();
  const localEnv = await Deno.readTextFile(root+'.env');
  const secret = localEnv.split('\n').find(line=>line.startsWith('VET_API_KEY=')).slice('VET_API_KEY='.length);
  check(!html.includes(secret), 'API key ausente del HTML y drupalSettings');
  check(errors.length===0, 'Sin errores JavaScript del widget');
  await Deno.writeTextFile(root+'docs/verificacion-fase-6-widget.json',JSON.stringify({date:new Date().toISOString(),results,errors},null,2)+'\n');
} finally { await browser.close(); }
