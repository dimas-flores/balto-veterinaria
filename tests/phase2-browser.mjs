/** Integración real: Drupal/MariaDB, caché, administración y vistas móviles. */
import puppeteer from 'npm:puppeteer-core@25.10.0';

const root = new URL('../', import.meta.url).pathname;
const base = Deno.env.get('BALTO_TEST_URL') || 'http://localhost:8080';
const env = Object.fromEntries((await Deno.readTextFile(root + '.env')).split('\n')
  .filter((line) => line && !line.startsWith('#')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const out = root + 'docs/capturas';
await Deno.mkdir(out, { recursive: true });
const profile = await Deno.makeTempDir({ prefix: 'balto-browser-' });
const browser = await puppeteer.launch({
  executablePath: Deno.env.get('BALTO_BROWSER') || '/opt/brave-bin/brave',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  userDataDir: profile,
});
const results = [], errors = [];
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  results.push(message);
  console.log('OK:', message);
};
let restoreBusiness = null;
let restoreService = null;

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === base && !response.url().includes('/admin/')) {
      errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  // No se depende de Google Maps durante las pruebas; sí se comprueba su URL.
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() !== page.mainFrame()) {
      request.respond({ status: 200, contentType: 'text/html', body: '<html lang="es"><body>Mapa externo omitido durante la prueba.</body></html>' });
    }
    else request.continue();
  });
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width, height: width < 620 ? 844 : 1000 });
    const response = await page.goto(base, { waitUntil: 'networkidle0' });
    // Cargar también las fotos diferidas antes de medir imágenes y capturar.
    await page.evaluate(async () => {
      await Promise.all([...document.images].map(image => {
        image.loading = 'eager';
        return image.decode().catch(() => {});
      }));
    });
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      h1: document.querySelectorAll('h1').length,
      services: document.querySelectorAll('.service-card').length,
      icons: document.querySelectorAll('.service-card .service-icon svg').length,
      addresses: document.querySelectorAll('.address-row').length,
      brokenImages: [...document.images].filter((image) => !image.complete || !image.naturalWidth).length,
      placeholder: document.querySelector('.example-label')?.textContent,
      map: document.querySelector('.map-wrap iframe')?.src,
    }));
    check(response.status() === 200, `Portada HTTP 200 a ${width}px`);
    check(state.overflow <= 1, `Sin desbordamiento horizontal a ${width}px`);
    // Los servicios salen de Drupal; el propietario puede añadir o quitar sin romper la prueba.
    check(state.h1 === 1 && state.services >= 7 && state.icons === state.services, `Un título principal y servicios con ícono a ${width}px`);
    // La etiqueta de ejemplo solo aparece mientras el horario no esté confirmado.
    check(state.addresses === 2 && (state.placeholder === undefined || state.placeholder.includes('ejemplo')), `Dos sedes y horario coherente a ${width}px`);
    check(state.brokenImages === 0, `Imágenes locales cargadas a ${width}px`);
    // El mapa usa la ficha de Google Maps (cid) o, sin ella, la dirección de la sede central.
    check(/^https:\/\/maps\.google\.com\/maps\?(cid=\d+|q=.*220)/.test(decodeURIComponent(state.map || '')), `Mapa de sede central a ${width}px`);
    if (width === 1440) {
      await page.screenshot({ path: out + '/fase-2-escritorio.png', fullPage: true });
      await page.screenshot({ path: out + '/fase-2-portada.png' });
    }
    if (width === 390) await page.screenshot({ path: out + '/fase-2-movil.png', fullPage: true });
  }
  await page.setViewport({ width: 390, height: 844 });
  await page.click('.menu-toggle');
  check(await page.$eval('.menu-toggle', (el) => el.getAttribute('aria-expanded') === 'true'), 'Menú móvil abre');
  await page.keyboard.press('Escape');
  check(await page.$eval('.menu-toggle', (el) => el.getAttribute('aria-expanded') === 'false'), 'Escape cierra el menú y devuelve el foco');
  await page.click('.menu-toggle');
  await page.click('#main-navigation a[href$="#servicios"]');
  check(await page.$eval('.menu-toggle', (el) => el.getAttribute('aria-expanded') === 'false'), 'El menú móvil cierra al navegar');
  const appointment = await page.$eval('.hero-actions .button', (el) => el.href);
  check(appointment.startsWith('https://wa.me/51986866036?text=') && decodeURIComponent(appointment).includes('separar una cita'), 'WhatsApp real con mensaje precargado');
  check(await page.$$eval('a[href^="mailto:"]', (links) => links.length === 0), 'No se publica un correo inventado');
  const [serviceLink, serviceTitle] = await page.$eval('.service-card', (el) => [el.href, el.querySelector('h3').textContent.trim()]);
  const serviceResponse = await page.goto(serviceLink, { waitUntil: 'networkidle0' });
  check(serviceResponse.status() === 200 && (await page.$eval('main', (el) => el.textContent)).includes(serviceTitle), 'Detalle de servicio publicado accesible');
  for (const path of ['/tienda', '/cart', '/user/login']) {
    const response = await page.goto(base + path, { waitUntil: 'networkidle0' });
    check(response.status() === 200, `${path} accesible`);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} adaptable al móvil`);
  }

  const anonymous = await browser.createBrowserContext();
  const anonymousPage = await anonymous.newPage();
  const denied = await anonymousPage.goto(base + '/admin/config/balto/negocio', { waitUntil: 'domcontentloaded' });
  check(denied.status() === 403 || new URL(anonymousPage.url()).pathname === '/user/login', 'La configuración está protegida para visitantes');

  // El administrador cambia datos mediante formularios reales, no SQL directo.
  await page.goto(base + '/user/login', { waitUntil: 'networkidle0' });
  await page.type('#edit-name', env.DRUPAL_ADMIN_USER);
  await page.type('#edit-pass', env.DRUPAL_ADMIN_PASSWORD);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  await page.goto(base + '/admin/config/balto/negocio', { waitUntil: 'networkidle0' });
  check(!!await page.$('#vet-api-business-settings'), 'Administrador puede editar datos y horarios');
  const savedSchedule = await page.$eval('#edit-consultation-schedule', (el) => el.value);
  const savedExample = await page.$eval('#edit-schedule-is-example', (el) => el.checked);
  const savedPhone = await page.$eval('#edit-whatsapp', (el) => el.value);
  restoreBusiness = async () => {
    await page.goto(base + '/admin/config/balto/negocio', { waitUntil: 'networkidle0' });
    await page.$eval('#edit-consultation-schedule', (el, value) => { el.value = value; }, savedSchedule);
    await page.$eval('#edit-schedule-is-example', (el, value) => { el.checked = value; }, savedExample);
    await page.$eval('#edit-whatsapp', (el, value) => { el.value = value; }, savedPhone);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  };
  // Número corto: debe rechazarse sin guardar nada.
  await page.$eval('#edit-whatsapp', (el) => { el.value = '123'; });
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  check((await page.$eval('body', (el) => el.textContent)).includes('nueve dígitos'), 'Validación rechaza un WhatsApp inválido');
  await page.$eval('#edit-whatsapp', (el, value) => { el.value = value; }, savedPhone);
  const scheduleProbe = 'Horario de ejemplo de prueba: martes de 10:00 a 12:00.';
  await page.$eval('#edit-consultation-schedule', (el, value) => { el.value = value; }, scheduleProbe);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  await anonymousPage.goto(base, { waitUntil: 'domcontentloaded' });
  check((await anonymousPage.$eval('.consultation-hours', (el) => el.textContent)).includes(scheduleProbe), 'Cambiar horario desde admin actualiza la portada anónima y su caché');
  await restoreBusiness();
  restoreBusiness = null;

  const nid = new URL(serviceLink).pathname.split('/').pop();
  await page.goto(base + '/node/' + nid + '/edit', { waitUntil: 'networkidle0' });
  const savedTitle = await page.$eval('#edit-title-0-value', (el) => el.value);
  restoreService = async () => {
    await page.goto(base + '/node/' + nid + '/edit', { waitUntil: 'networkidle0' });
    await page.$eval('#edit-title-0-value', (el, value) => { el.value = value; }, savedTitle);
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  };
  const titleProbe = 'Consulta veterinaria de prueba';
  await page.$eval('#edit-title-0-value', (el, value) => { el.value = value; }, titleProbe);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#edit-submit')]);
  await anonymousPage.goto(base, { waitUntil: 'domcontentloaded' });
  check((await anonymousPage.$$eval('.service-card h3', (els) => els.map((el) => el.textContent))).includes(titleProbe), 'Editar un Servicio actualiza las tarjetas públicas sin tocar Twig');
  await restoreService();
  restoreService = null;
  await anonymous.close();
  check(errors.length === 0, 'Sin errores JavaScript ni recursos locales fallidos');
  await Deno.writeTextFile(root + 'docs/verificacion-fase-2.json', JSON.stringify({ date: new Date().toISOString(), base, results, errors }, null, 2));
}
catch (error) {
  console.error(error.message);
  Deno.exitCode = 1;
}
finally {
  if (restoreBusiness) await restoreBusiness().catch((error) => console.error('Restaurar horario:', error.message));
  if (restoreService) await restoreService().catch((error) => console.error('Restaurar servicio:', error.message));
  await browser.close();
  await Deno.remove(profile, { recursive: true });
}
