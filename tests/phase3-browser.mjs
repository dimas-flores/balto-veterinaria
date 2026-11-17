/** Catálogo, stock y formularios reales de Commerce; restaura las ediciones. */
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
const env = Object.fromEntries((await Deno.readTextFile(root + '.env')).split('\n').filter(l => l && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const profile = await Deno.makeTempDir({ prefix: 'balto-catalog-' });
const browser = await puppeteer.launch({ executablePath: Deno.env.get('BALTO_BROWSER') || '/opt/brave-bin/brave', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], userDataDir: profile });
const results = [], errors = [];
const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); console.log('OK:', message); };
let restore = null;
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (new URL(r.url()).origin === base && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const visit = path => page.goto(base + path, { waitUntil: 'networkidle0' });
  const readyImages = () => page.evaluate(async () => { await Promise.all([...document.images].map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); })); });
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
    const response = await visit('/tienda');
    await readyImages();
    const audit = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, cards: document.querySelectorAll('.product-card').length, h1: document.querySelectorAll('h1').length, images: [...document.images].filter(i => !i.complete || !i.naturalWidth).length, demo: document.querySelector('.catalog-demo-notice')?.textContent }));
    check(response.status() === 200, `Catálogo HTTP 200 a ${width}px`);
    check(audit.overflow <= 1, `Catálogo sin desbordamiento a ${width}px`);
    check(audit.cards === 12 && audit.h1 === 1, `Doce productos por página y un título principal a ${width}px`);
    check(audit.images === 0 && audit.demo.includes('ejemplo'), `Imágenes locales y aviso de demo a ${width}px`);
    if (width === 1440) {
      await page.screenshot({ path: root + 'docs/capturas/fase-3-catalogo.png', fullPage: true });
      await page.screenshot({ path: root + 'docs/capturas/fase-3-portada-tienda.png' });
    }
    if (width === 390) await page.screenshot({ path: root + 'docs/capturas/fase-3-catalogo-movil.png', fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await visit('/tienda?page=1');
  check(await page.$$eval('.product-card', els => els.length === 3), 'La segunda página contiene los tres productos restantes');
  await visit('/tienda?q=Dog%20Chow');
  check(await page.$$eval('.product-card', els => els.length === 1 && els[0].dataset.sku === 'BAL-ALI-001'), 'Búsqueda por nombre consulta Drupal');
  const detail = new URL(await page.$eval('.product-image-link', el => el.href)).pathname;
  await visit('/tienda?q=BAL-SAL-002');
  check(await page.$$eval('.product-card', els => els.length === 1 && els[0].dataset.sku === 'BAL-SAL-002'), 'Búsqueda por SKU');
  await visit('/tienda');
  const categories = await page.$$eval('#catalog-category option', els => Object.fromEntries(els.map(el => [el.textContent, el.value])));
  check(Object.keys(categories).length === 6, 'Cinco categorías disponibles además de Todas');
  await page.select('#catalog-category', categories.Alimentos);
  await page.select('#catalog-species', 'gato');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('.catalog-filters button')]);
  check(await page.$$eval('.product-card', els => els.length === 2 && els.every(el => el.querySelector('.product-species').textContent.includes('Gato'))), 'Categoría y especie se combinan mediante el formulario GET');
  check(new URL(page.url()).searchParams.get('species') === 'gato', 'Los filtros quedan en la URL para compartirlos');
  await visit('/tienda?q=producto-inexistente-123');
  check(!!await page.$('.catalog-empty') && await page.$$eval('.product-card', els => els.length === 0), 'Búsqueda sin coincidencias muestra alternativas');
  await visit('/tienda?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  check(await page.$$eval('#results-title script', els => els.length === 0), 'La búsqueda se escapa y no inserta HTML');
  for (const invalid of ['species=dragon', 'category=999999', 'q%5B%5D=x']) {
    const response = await visit('/tienda?' + invalid);
    check(response.status() === 400, `Filtro inválido rechazado: ${invalid}`);
  }
  // El saldo cambia con cada pedido de prueba: se compara con el que muestra el catálogo.
  await visit('/tienda?q=BAL-ALI-001');
  const listedStock = await page.$eval('.product-card[data-sku="BAL-ALI-001"] .stock-label', el => el.textContent.match(/\d+/)?.[0]);
  await visit(detail);
  check((await page.$eval('.product-detail-price', el => el.textContent)).includes('S/ 189.90'), 'Detalle muestra precio en soles');
  check(!!listedStock && (await page.$eval('.product-detail-price', el => el.textContent)).includes(listedStock + ' unidades'), 'Detalle muestra stock real de Commerce Stock');
  check(await page.$$eval('h1', els => els.length === 1), 'Detalle sin título duplicado');
  await readyImages();
  await page.screenshot({ path: root + 'docs/capturas/fase-3-producto.png', fullPage: true });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: root + 'docs/capturas/fase-3-producto-movil.png', fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Detalle adaptable al celular');
  await visit('/tienda?q=Ricocat');
  const soldOut = new URL(await page.$eval('.product-image-link', el => el.href)).pathname;
  check(!!await page.$('.product-status.is-sold-out'), 'Tarjeta de producto sin stock marcada Agotado');
  await visit(soldOut);
  check(await page.$eval('.product-cart-form input[type=submit]', el => el.disabled), 'Producto agotado tiene compra deshabilitada');
  // Se quita el bloqueo HTML para demostrar que la protección está en servidor.
  await page.evaluate(() => { const form = document.querySelector('.product-cart-form form'); form.noValidate = true; form.querySelectorAll('[disabled]').forEach(el => { el.disabled = false; }); });
  await addToCart(page);
  await visit('/cart');
  check(await page.$$eval('input[name^="edit_quantity"]', els => els.length === 0), 'Un POST manipulado no agrega el producto agotado');
  await visit(detail);
  const setQuantity = async quantity => page.$eval('input[name="quantity[0][value]"]', (el, value) => { el.value = value; el.removeAttribute('max'); el.removeAttribute('min'); el.removeAttribute('step'); el.closest('form').noValidate = true; }, String(quantity));
  const submitProduct = () => addToCart(page);
  await setQuantity(Number(listedStock) + 1);
  await submitProduct();
  check((await page.$eval('body', el => el.textContent)).includes('Solo hay ' + listedStock), 'El servidor rechaza agregar más unidades que el stock');
  await setQuantity(1);
  await submitProduct();
  await visit('/cart');
  check(await page.$$eval('input[name^="edit_quantity"]', els => els.length === 1 && Number(els[0].value) === 1), 'Una unidad disponible se agrega al carrito real');
  await visit(detail);
  check((await page.$eval('.product-detail-price', el => el.textContent)).includes(listedStock + ' unidades'), 'Agregar al carrito no descuenta ni reserva stock');
  await setQuantity(Number(listedStock));
  await submitProduct();
  check((await page.$eval('body', el => el.textContent)).includes('ya tienes'), 'La validación incluye unidades ya presentes en el carrito');
  await visit('/cart');
  check(await page.$$eval('input[name^="edit_quantity"]', els => els.length === 1 && Number(els[0].value) === 1), 'El carrito conserva su cantidad tras rechazar el exceso');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('input[name^="delete-order-item-"]')]);

  // Edición administrativa; los valores se restauran al finalizar.
  const admin = await browser.newPage();
  await admin.goto(base + '/user/login', { waitUntil: 'networkidle0' });
  await admin.type('#edit-name', env.DRUPAL_ADMIN_USER);
  await admin.type('#edit-pass', env.DRUPAL_ADMIN_PASSWORD);
  await Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle0' }), admin.click('#edit-submit')]);
  const edit = base + detail + '/edit';
  const priceSelector = 'input[name$="[price][0][number]"]';
  const stockSelector = 'input[name$="[field_stock_level][0][adjustment]"]';
  await admin.goto(edit, { waitUntil: 'networkidle0' });
  check(!!await admin.$(priceSelector) && !!await admin.$(stockSelector), 'El panel permite editar precio y movimientos de stock');
  const savedPrice = await admin.$eval(priceSelector, el => el.value);
  let adjustmentMade = false;
  const save = () => Promise.all([admin.waitForNavigation({ waitUntil: 'networkidle0' }), admin.click('#edit-actions-submit')]);
  restore = async () => {
    await admin.goto(edit, { waitUntil: 'networkidle0' });
    await admin.$eval(priceSelector, (el, value) => { el.value = value; }, savedPrice);
    if (adjustmentMade) await admin.$eval(stockSelector, el => { el.value = '-2'; });
    await save();
    adjustmentMade = false;
  };
  await admin.$eval(priceSelector, el => { el.value = '190.90'; });
  await admin.$eval(stockSelector, el => { el.value = '2'; });
  await save();
  adjustmentMade = true;
  // Otra sesión pública comprueba invalidación de las páginas cacheadas.
  const publicContext = await browser.createBrowserContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(base + detail, { waitUntil: 'networkidle0' });
  check((await publicPage.$eval('.product-detail-price', el => el.textContent)).includes('S/ 190.90'), 'Precio editado desde administración reflejado en detalle público');
  check((await publicPage.$eval('.product-detail-price', el => el.textContent)).includes((Number(listedStock) + 2) + ' unidades'), 'Movimiento de stock reflejado en detalle público');
  await publicPage.goto(base + '/tienda?q=Dog%20Chow', { waitUntil: 'networkidle0' });
  check((await publicPage.$eval('.product-price-row', el => el.textContent)).includes('190.90') && (await publicPage.$eval('.product-price-row', el => el.textContent)).includes((Number(listedStock) + 2) + ' disponibles'), 'Precio y stock nuevos invalidan también la caché del catálogo');
  await restore();
  restore = null;
  await publicContext.close();
  await page.goto(base + detail, { waitUntil: 'networkidle0' });
  check((await page.$eval('.product-detail-price', el => el.textContent)).includes('189.90') && (await page.$eval('.product-detail-price', el => el.textContent)).includes(listedStock + ' unidades'), 'Precio y existencias originales restaurados después de las pruebas');
  check(errors.length === 0, 'Sin errores JavaScript ni respuestas locales HTTP 500');
  await Deno.writeTextFile(root + 'docs/verificacion-fase-3.json', JSON.stringify({ date: new Date().toISOString(), results, errors }, null, 2));
}
catch (error) { console.error(error.message); Deno.exitCode = 1; }
finally {
  if (restore) await restore().catch(error => console.error('Restauración pendiente:', error.message));
  await browser.close();
  await Deno.remove(profile, { recursive: true });
}
