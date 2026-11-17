/** Una sola demo integrada: chat → Commerce → administración → chat actualizado. */
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
const sshHost = Deno.env.get('BALTO_SSH_HOST');
const sshKey = Deno.env.get('BALTO_SSH_KEY');
const reportPrefix = Deno.env.get('BALTO_REPORT_PREFIX') || 'fase-7-demo';
if (!/^[a-z0-9-]+$/.test(reportPrefix)) throw new Error('Nombre de informe inválido');
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const sshArgs = sshHost ? ['-i', sshKey, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', sshHost] : [];
if (sshHost && !sshKey) throw new Error('Falta BALTO_SSH_KEY');
let envText;
if (sshHost) {
  const result = await new Deno.Command('ssh', {args:[...sshArgs, 'cat /opt/balto-veterinaria/.env'],stdout:'piped',stderr:'piped'}).output();
  if (!result.success) throw new Error('No se pudo leer el entorno remoto');
  envText = new TextDecoder().decode(result.stdout);
} else envText = await Deno.readTextFile(Deno.env.get('BALTO_TEST_ENV_FILE') || root+'.env');
const env = Object.fromEntries(envText.split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));
const docker = ['compose'];
if (Deno.env.get('DOCKER_HOST')) docker.unshift('--host='+Deno.env.get('DOCKER_HOST'));
else if (await Deno.stat('/run/user/1000/balto-docker.sock').then(()=>true).catch(()=>false)) docker.unshift('--host=unix:///run/user/1000/balto-docker.sock');
async function php(code) {
  const command = sshHost ? 'ssh' : 'docker';
  const args = sshHost ? [...sshArgs, 'sudo docker compose --project-directory /opt/balto-veterinaria -f /opt/balto-veterinaria/docker-compose.yml -f /opt/balto-veterinaria/docker-compose.override.yml exec -T drupal drush php:eval ' + quote(code)] : [...docker,'exec','-T','drupal','drush','php:eval',code];
  const out=await new Deno.Command(command,{cwd:root,args,stdout:'piped',stderr:'piped'}).output();
  if(!out.success) throw new Error('No se pudo verificar el estado de Drupal.');
  return JSON.parse(new TextDecoder().decode(out.stdout));
}
const lookup='$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-JUG-001"]);$v=reset($v);';
const snapshot=()=>php(lookup+'echo json_encode(["stock"=>\\Drupal::service("vet_api.catalog")->stock($v),"price"=>$v->getPrice()->getNumber(),"product_id"=>$v->getProductId()]);');
const results=[],errors=[];
const check=(ok,message)=>{if(!ok)throw new Error(message);results.push(message);console.log('OK:',message);};
const browser=await puppeteer.launch({executablePath:Deno.env.get('BALTO_BROWSER')||'/opt/brave-bin/brave',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const guest=await browser.newPage();
const managerContext=await browser.createBrowserContext();
const manager=await managerContext.newPage();
for(const page of [guest,manager]){page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(new URL(r.url()).origin===base&&r.status()>=500)errors.push('HTTP '+r.status());});}
const visit=(page,path)=>page.goto(base+path,{waitUntil:'networkidle0'});
const submit=(page,selector)=>Promise.all([page.waitForNavigation({waitUntil:'networkidle0'}),page.click(selector)]);
async function chat(message){
  if(await guest.$eval('.chat-panel',e=>e.hidden))await guest.click('.chat-launcher');
  const count=await guest.$$eval('.chat-message-assistant',es=>es.length);
  await guest.type('#chat-message',message);await guest.click('.chat-form button');
  await guest.waitForFunction(n=>document.querySelectorAll('.chat-message-assistant').length>n&&document.querySelector('.chat-typing').hidden,{},count);
  return guest.$eval('.chat-message-assistant:last-child',e=>e.textContent);
}
const started=Date.now();
let changedPrice=false,originalPrice,before,after,orderId,order;
const priceSelector='input[name$="[price][0][number]"]';
try{
  before=await snapshot(); originalPrice=before.price;
  check(before.stock>0,'Producto de la demo con existencias disponibles');
  await guest.setViewport({width:1440,height:1000});
  await visit(guest,'/');
  const initial=await chat('precio de BAL-JUG-001');
  check(initial.includes('S/ '+Number(before.price).toFixed(2))&&initial.includes(String(before.stock)+' unidades'),'Chat informa precio y stock reales antes de comprar');
  const productLink=await guest.$eval('.chat-message-assistant:last-child .chat-links a',a=>a.href);
  await guest.goto(productLink,{waitUntil:'networkidle0'});
  check(new URL(guest.url()).pathname==='/product/'+before.product_id,'Enlace del chat abre el producto consultado');
  await addToCart(guest);
  await visit(guest,'/cart');
  check((await guest.$eval('main',e=>e.textContent)).includes('Pelota de goma'),'Carrito contiene el producto elegido desde el chat');
  await submit(guest,'#edit-checkout');
  await guest.type('[name="vet_customer[name]"]','Demo integrada BALTO');
  await guest.type('[name="vet_customer[phone]"]','900000002');
  await guest.type('[name="contact_information[email]"]','demo-fase7@example.invalid');
  await guest.$eval('input[name="payment_information[payment_method]"][value*="pago_simulado"]', e=>e.click());
  // Elegir el medio de pago reconstruye el panel por AJAX; se espera antes de enviar.
  await guest.waitForNetworkIdle({idleTime:500});
  await submit(guest,'#edit-actions-next');
  check((await guest.$eval('main',e=>e.textContent)).includes('No se realiza ningún cobro real'),'Revisión indica que el pago es simulado');
  await submit(guest,'#edit-actions-next');
  check(new URL(guest.url()).pathname.endsWith('/complete'),'Compra desde el chat termina con pedido registrado');
  orderId=Number(new URL(guest.url()).pathname.split('/')[2]);
  if(!Number.isSafeInteger(orderId))throw new Error('ID de pedido inválido');
  await guest.screenshot({path:root+'docs/capturas/'+reportPrefix+'-confirmacion.png',fullPage:true});
  order=await php('$o=\\Drupal::entityTypeManager()->getStorage("commerce_order")->load('+orderId+');$p=\\Drupal::entityTypeManager()->getStorage("commerce_payment")->loadMultipleByOrder($o);echo json_encode(["id"=>(int)$o->id(),"number"=>$o->getOrderNumber(),"state"=>$o->getState()->getId(),"paid"=>$o->isPaid(),"currency"=>$o->getTotalPrice()->getCurrencyCode(),"total"=>$o->getTotalPrice()->getNumber(),"payments"=>count($p),"simulated"=>(bool)$o->getData("vet_simulated")]);');
  check(order.state==='validation'&&order.paid&&order.simulated&&order.payments===1,'Pedido persistido con un solo pago local ficticio');
  check(order.currency==='PEN'&&Number(order.total)===Number(before.price),'Total del pedido correcto en soles');
  after=await snapshot();
  check(after.stock===before.stock-1,'Compra descuenta exactamente una unidad');
  await visit(manager,'/user/login');
  await manager.type('#edit-name',env.DRUPAL_STORE_MANAGER_USER);await manager.type('#edit-pass',env.DRUPAL_STORE_MANAGER_PASSWORD);await submit(manager,'#edit-submit');
  const adminPage=await visit(manager,'/admin/commerce/orders/'+orderId);
  check(adminPage.status()===200&&(await manager.$eval('body',e=>e.textContent)).includes('Demo integrada BALTO'),'Administrador de tienda consulta el pedido de esta demo');
  await manager.screenshot({path:root+'docs/capturas/'+reportPrefix+'-administracion.png',fullPage:true});
  await visit(guest,'/tienda');
  const afterPurchase=await chat('stock de BAL-JUG-001');
  check(afterPurchase.includes(String(after.stock)+' unidades'),'Chat refleja el stock tras comprar sin reiniciar servicios');
  await visit(manager,'/product/'+before.product_id+'/edit');
  const updated=(Number(originalPrice)+0.50).toFixed(2);
  await manager.$eval(priceSelector,(el,value)=>{el.value=value;},updated);
  changedPrice=true;
  await submit(manager,'#edit-actions-submit');
  check(Number((await snapshot()).price)===Number(updated),'Administrador de tienda guarda un precio nuevo desde el formulario');
  const afterEdit=await chat('precio de BAL-JUG-001');
  check(afterEdit.includes('S/ '+updated),'Precio editado desde administración aparece inmediatamente en el chat');
  await guest.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  check(await guest.$eval('.chat-panel',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'Demo del chat usable dentro de la pantalla móvil');
  await guest.screenshot({path:root+'docs/capturas/'+reportPrefix+'-chat-movil.png',fullPage:false});
  await visit(manager,'/product/'+before.product_id+'/edit');
  await manager.$eval(priceSelector,(el,value)=>{el.value=value;},originalPrice);
  await submit(manager,'#edit-actions-submit');
  check(Number((await snapshot()).price)===Number(originalPrice),'Precio original restaurado desde administración');
  changedPrice=false;
  const restored=await chat('precio de BAL-JUG-001');
  check(restored.includes('S/ '+Number(originalPrice).toFixed(2)),'Chat vuelve a mostrar el precio original');
  check(errors.length===0,'Recorrido completo sin errores JavaScript ni respuestas Drupal HTTP 500');
  await Deno.writeTextFile(root+'docs/verificacion-'+(sshHost ? reportPrefix : 'fase-7')+'.json',JSON.stringify({date:new Date().toISOString(),environment:sshHost ? 'AWS EC2' : 'Docker local',url:base,elapsed_seconds:Math.round((Date.now()-started)/1000),results,errors,order,stock:{before:before.stock,after:after.stock},price_restored:true},null,2)+'\n');
}finally{
  if(changedPrice&&originalPrice&&/^\d+(\.\d+)?$/.test(originalPrice)){
    await php(lookup+'$v->setPrice(new \\Drupal\\commerce_price\\Price("'+originalPrice+'","PEN"));$v->save();echo "true";');
  }
  await browser.close();
}
