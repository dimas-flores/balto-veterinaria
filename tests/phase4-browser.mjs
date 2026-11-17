/** Compra real contra Drupal/MariaDB con una pasarela exclusivamente local. */
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
const docker = ['compose'];
const socket = (Deno.env.get('XDG_RUNTIME_DIR') || '/run/user/1000') + '/balto-docker.sock';
if (Deno.env.get('DOCKER_HOST')) docker.unshift('--host=' + Deno.env.get('DOCKER_HOST'));
else if (await Deno.stat(socket).then(() => true).catch(() => false)) docker.unshift('--host=unix://' + socket);

async function snapshot(id = 0) {
  if (!Number.isSafeInteger(id) || id < 0) throw new Error('ID de prueba inválido');
  const code = `$v=\\Drupal::entityTypeManager()->getStorage('commerce_product_variation')->loadByProperties(['sku'=>'BAL-JUG-001']);$v=reset($v);$r=['stock'=>(int)\\Drupal::service('commerce_stock.service_manager')->getStockLevel($v),'unit'=>$v->getPrice()->getNumber()];if(${id}>0){$o=\\Drupal::entityTypeManager()->getStorage('commerce_order')->load(${id});$p=\\Drupal::entityTypeManager()->getStorage('commerce_payment')->loadMultipleByOrder($o);$r+=['id'=>(int)$o->id(),'number'=>$o->getOrderNumber(),'state'=>$o->getState()->getId(),'customer'=>(int)$o->getCustomerId(),'total'=>$o->getTotalPrice()->getNumber(),'currency'=>$o->getTotalPrice()->getCurrencyCode(),'paid'=>$o->isPaid(),'simulated'=>(bool)$o->getData('vet_simulated'),'payments'=>array_values(array_map(static fn($p)=>['state'=>$p->getState()->getId(),'gateway'=>$p->getPaymentGatewayId(),'amount'=>$p->getAmount()->getNumber()],$p))];}echo json_encode($r);`;
  const result = await new Deno.Command('docker', { cwd: root, args: [...docker, 'exec', '-T', 'drupal', 'drush', 'php:eval', code], stdout: 'piped', stderr: 'piped' }).output();
  if (!result.success) throw new Error('Falló la lectura de verificación Drupal: ' + new TextDecoder().decode(result.stderr));
  return JSON.parse(new TextDecoder().decode(result.stdout));
}
const profile = await Deno.makeTempDir({ prefix: 'balto-checkout-' });
const browser = await puppeteer.launch({ executablePath: Deno.env.get('BALTO_BROWSER') || '/opt/brave-bin/brave', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], userDataDir: profile });
const results = [], errors = [], orders = [];
const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); console.log('OK:', message); };
const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('response', r => { if (new URL(r.url()).origin === base && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); }); };
const visit = (p, path) => p.goto(base + path, { waitUntil: 'networkidle0' });
const submit = (p, selector) => Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click(selector)]);
async function login(p, user, password) {
  await visit(p, '/user/login');
  await p.type('#edit-name', user); await p.type('#edit-pass', password);
  await submit(p, '#edit-submit');
}
async function add(p, sku, qty = 1) {
  await visit(p, '/tienda?q=' + encodeURIComponent(sku));
  const path = new URL(await p.$eval('.product-image-link', el => el.href)).pathname;
  await visit(p, path);
  await p.$eval('input[name="quantity[0][value]"]', (el, value) => { el.value = value; }, String(qty));
  await addToCart(p);
  return path;
}
async function fillCheckout(p, name) {
  await p.$eval('[name="vet_customer[name]"]', (el, value) => { el.value = value; }, name);
  await p.$eval('[name="vet_customer[phone]"]', el => { el.value = '900000001'; });
  await p.$eval('[name="contact_information[email]"]', el => { el.value = 'demo-fase4@example.invalid'; });
  await p.$eval('input[name="payment_information[payment_method]"][value*="pago_simulado"]', el => el.click());
  // Elegir el medio de pago reconstruye el panel por AJAX; se espera antes de enviar.
  await p.waitForNetworkIdle({ idleTime: 500 });
  await submit(p, '#edit-actions-next');
}
try {
  const before = await snapshot();
  check(before.stock >= 3, 'Hay existencias suficientes para las compras de prueba');
  const guestContext = await browser.createBrowserContext();
  const guest = await guestContext.newPage(); watch(guest);
  await guest.setViewport({ width: 1440, height: 1000 });
  const productPath = await add(guest, 'BAL-JUG-001');
  await visit(guest, '/cart');
  check((await guest.$eval('main', el => el.textContent)).includes('Pelota de goma'), 'El carrito muestra el nombre del producto');
  check(!!await guest.$('.checkout-demo-notice'), 'Carrito rotulado como pago simulado');
  await guest.$eval('input[name^="edit_quantity"]', el => { el.value = '2'; });
  await submit(guest, '#edit-submit');
  check(await guest.$eval('input[name^="edit_quantity"]', el => el.value === '2'), 'Modificar la cantidad guarda el carrito');
  check((await guest.$eval('main', el => el.textContent)).includes((Number(before.unit) * 2).toFixed(2)), 'Total del carrito recalculado desde Commerce');
  await add(guest, 'BAL-HIG-001');
  await visit(guest, '/cart');
  check(await guest.$$eval('input[name^="edit_quantity"]', els => els.length === 2), 'Se pueden agregar productos distintos');
  await submit(guest, 'input[name="delete-order-item-1"]');
  check(await guest.$$eval('input[name^="edit_quantity"]', els => els.length === 1), 'Eliminar un producto actualiza el carrito');
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-carrito.png', fullPage: true });
  await guest.setViewport({ width: 390, height: 844 });
  check(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Carrito con productos sin desbordamiento en celular');
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-carrito-movil.png', fullPage: true });
  await submit(guest, '#edit-checkout');
  check(new URL(guest.url()).pathname.endsWith('/order_information'), 'Un visitante puede iniciar checkout sin crear una cuenta');
  check((await guest.$eval('body', el => el.textContent)).includes('Pago simulado – No se realiza ningún cobro real'), 'Checkout informa que no hay cobro real');
  check(await guest.$$eval('input', els => els.every(el => !/card|tarjeta|cvv|cvc/i.test(el.name))), 'No se solicitan datos de tarjeta');
  check((await guest.$eval('.checkout-summary', el => el.textContent)).includes('Pelota de goma'), 'Resumen del checkout muestra el producto');
  check(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Checkout adaptable al celular');
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-checkout-movil.png', fullPage: true });
  await guest.setViewport({ width: 1440, height: 1000 });
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-checkout.png', fullPage: true });
  await guest.$eval('[name="vet_customer[name]"]', el => { el.value = 'x'; });
  await guest.$eval('[name="vet_customer[phone]"]', el => { el.value = '123'; });
  await guest.$eval('[name="contact_information[email]"]', el => { el.value = 'demo-fase4@example.invalid'; });
  await submit(guest, '#edit-actions-next');
  check((await guest.$eval('body', el => el.textContent)).includes('nueve dígitos'), 'El servidor valida los datos de contacto');
  await fillCheckout(guest, 'Cliente de demostración BALTO');
  check(new URL(guest.url()).pathname.endsWith('/review'), 'Datos válidos llevan a revisión del pedido');
  check((await guest.$eval('#edit-actions-next', el => el.value)) === 'Confirmar pedido simulado', 'La confirmación final indica explícitamente que es simulada');
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-revision.png', fullPage: true });
  await submit(guest, '#edit-actions-next');
  check(new URL(guest.url()).pathname.endsWith('/complete'), 'Compra completa llega a pedido registrado');
  check((await guest.$eval('body', el => el.textContent)).includes('¡Pedido de demostración registrado!'), 'Se muestra confirmación y número de pedido');
  const id = Number(new URL(guest.url()).pathname.split('/')[2]);
  const order = await snapshot(id); orders.push(order);
  check(order.state === 'validation' && order.simulated, 'El pedido queda registrado para revisión en MariaDB');
  check(order.payments.length === 1 && order.payments[0].state === 'completed' && order.payments[0].gateway === 'pago_simulado', 'Un único pago ficticio completado, sin proveedor externo');
  check(order.paid && order.currency === 'PEN' && Number(order.total) === Number(before.unit) * 2, 'Importe y pago local consistentes en soles');
  check(order.stock === before.stock - 2, 'La compra descuenta exactamente dos unidades');
  await guest.screenshot({ path: root + 'docs/capturas/fase-4-confirmacion.png', fullPage: true });
  const confirmationPath = new URL(guest.url()).pathname;
  await visit(guest, confirmationPath);
  const repeated = await snapshot(id);
  check(repeated.payments.length === 1 && repeated.stock === order.stock, 'Recargar la confirmación no duplica pago ni descuento');
  await visit(guest, '/cart');
  check(await guest.$$eval('input[name^="edit_quantity"]', els => els.length === 0), 'El carrito queda vacío después del pedido');
  const outsiderContext = await browser.createBrowserContext();
  const outsider = await outsiderContext.newPage(); watch(outsider);
  const forbidden = await visit(outsider, confirmationPath);
  check(forbidden.status() === 403 || new URL(outsider.url()).pathname === '/user/login', 'Otra sesión no puede ver la confirmación privada');

  const managerContext = await browser.createBrowserContext();
  const manager = await managerContext.newPage(); watch(manager);
  await manager.setViewport({ width: 1440, height: 1000 });
  await login(manager, env.DRUPAL_STORE_MANAGER_USER, env.DRUPAL_STORE_MANAGER_PASSWORD);
  const orderList = await visit(manager, '/admin/commerce/orders');
  check(orderList.status() === 200 && (await manager.$eval('body', el => el.textContent)).includes('demo-fase4@example.invalid'), 'Administrador de tienda ve el pedido en el panel');
  await manager.screenshot({ path: root + 'docs/capturas/fase-4-pedidos-admin.png', fullPage: true });
  const orderPage = await visit(manager, '/admin/commerce/orders/' + id);
  check(orderPage.status() === 200 && (await manager.$eval('body', el => el.textContent)).includes('Cliente de demostración BALTO'), 'El panel muestra el detalle y contacto del pedido');
  await manager.screenshot({ path: root + 'docs/capturas/fase-4-pedido-admin.png', fullPage: true });
  const products = await visit(manager, '/admin/commerce/products');
  check(products.status() === 200, 'Administrador de tienda accede a productos');
  const createProduct = await visit(manager, '/product/add/vet_product');
  check(createProduct.status() === 200 && !!await manager.$('input[type=file]'), 'Administrador de tienda puede abrir creación de productos con imágenes');
  await visit(manager, '/product/1/edit');
  const adjustment = 'input[name$="[field_stock_level][0][adjustment]"]';
  check(!!await manager.$(adjustment), 'Administrador de tienda puede controlar las existencias');
  await manager.$eval(adjustment, el => { el.value = '-100000'; });
  await submit(manager, '#edit-actions-submit');
  check((await manager.$eval('body', el => el.textContent)).includes('existencias negativas'), 'El servidor rechaza ajustes que dejarían stock negativo');
  for (const path of ['/admin/people', '/admin/commerce/config/payment-gateways', '/admin/modules']) {
    const response = await visit(manager, path);
    check(response.status() === 403, 'Administrador de tienda sin acceso a ' + path);
  }

  const clientContext = await browser.createBrowserContext();
  const client = await clientContext.newPage(); watch(client);
  await login(client, env.DRUPAL_CLIENT_USER, env.DRUPAL_CLIENT_PASSWORD);
  for (const path of ['/admin/commerce/orders', '/admin/commerce/products', '/admin/config/balto/negocio']) {
    const response = await visit(client, path);
    check(response.status() === 403, 'Cliente sin acceso a ' + path);
  }
  await add(client, 'BAL-JUG-001'); await visit(client, '/cart'); await submit(client, '#edit-checkout');
  await fillCheckout(client, 'Cliente con cuenta de demostración'); await submit(client, '#edit-actions-next');
  check(new URL(client.url()).pathname.endsWith('/complete'), 'Un cliente autenticado también puede completar la compra');
  const clientOrderId = Number(new URL(client.url()).pathname.split('/')[2]);
  const clientOrder = await snapshot(clientOrderId); orders.push(clientOrder);
  check(clientOrder.customer > 0 && clientOrder.stock === before.stock - 3, 'Pedido vinculado al cliente y stock actualizado');
  const ownOrders = await visit(client, '/user/' + clientOrder.customer + '/orders');
  check(ownOrders.status() === 200 && (await client.$eval('body', el => el.textContent)).includes(clientOrder.number), 'El cliente puede consultar su historial de pedidos');
  check(errors.length === 0, 'Sin errores JavaScript ni respuestas locales HTTP 500');
  await Deno.writeTextFile(root + 'docs/verificacion-fase-4.json', JSON.stringify({ date: new Date().toISOString(), results, errors, orders }, null, 2));
}
catch (error) { console.error(error.message); Deno.exitCode = 1; }
finally { await browser.close(); await Deno.remove(profile, { recursive: true }); }
