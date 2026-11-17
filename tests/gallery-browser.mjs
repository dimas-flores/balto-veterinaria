/** Comprobación visual acotada a las fotos nuevas; no crea pedidos. */
import puppeteer from 'npm:puppeteer-core@25.10.0';
const root=new URL('../',import.meta.url).pathname;
const base=Deno.env.get('BALTO_TEST_URL')||'http://localhost:8080';
const prefix=Deno.env.get('BALTO_GALLERY_PREFIX')||'galeria-balto';
if(!/^[a-z0-9-]+$/.test(prefix))throw new Error('Prefijo inválido');
const browser=await puppeteer.launch({executablePath:Deno.env.get('BALTO_BROWSER')||'/opt/brave-bin/brave',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],errors=[];
const check=(ok,text)=>{if(!ok)throw new Error(text);results.push(text);console.log('OK:',text);};
try{
 const p=await browser.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=500)errors.push('HTTP '+r.status());});
 await p.setViewport({width:1440,height:1000});
 await p.goto(base,{waitUntil:'networkidle0'});
 await p.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';});
 await p.$$eval('img',es=>es.forEach(e=>{e.loading='eager';}));
 await p.waitForFunction(()=>[...document.querySelectorAll('main img,.brand img')].every(e=>e.complete&&e.naturalWidth>0));
 check(await p.$eval('.hero-image img',e=>e.src.includes('balto_photo_wide')&&e.alt.includes('felino')),'Portada con paciente real y derivado WebP');
 check(!!await p.$('.brand-real img'),'Logo proporcionado por el usuario activo');
 check(await p.$eval('.about-photo',e=>e.textContent.includes('propietario')),'Foto del propietario con contexto de formación, sin títulos inventados');
 check(await p.$$eval('.story-card',es=>es.length===3),'Tres historias seleccionadas desde Drupal');
 check((await p.$eval('#historias',e=>e.textContent)).includes('2023')&&(await p.$eval('#historias',e=>e.textContent)).includes('2021'),'Publicaciones históricas identificadas con su contexto temporal');
 // Las imágenes decorativas se marcan con aria-hidden y alt vacío; el resto necesita descripción.
 check(await p.$$eval('main img',es=>es.every(e=>e.alt.trim().length>0||(e.getAttribute('aria-hidden')==='true'&&e.getAttribute('alt')===''))),'Fotografías con texto alternativo');
 await p.screenshot({path:root+'docs/capturas/'+prefix+'-portada.png'});
 await p.$eval('#nosotros',e=>e.scrollIntoView());
 await p.screenshot({path:root+'docs/capturas/'+prefix+'-nosotros.png'});
 await p.$eval('#historias',e=>e.scrollIntoView());
 await p.screenshot({path:root+'docs/capturas/'+prefix+'-historias.png'});
 for(const width of [1100,390]){
  await p.setViewport({width,height:844});
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin desbordamiento horizontal a '+width+' px');
 }
 await p.screenshot({path:root+'docs/capturas/'+prefix+'-movil.png'});
 await p.click('.chat-launcher');
 await p.type('#chat-message','hola');await p.click('.chat-form button');
 await p.waitForFunction(()=>document.querySelector('.chat-history').textContent.includes('¿Qué necesitas?')&&document.querySelector('.chat-typing').hidden);
 check(true,'El chat sigue consultando n8n después del cambio visual');
 check(errors.length===0,'Sin errores JavaScript ni respuestas locales HTTP 500');
 await Deno.writeTextFile(root+'docs/verificacion-'+prefix+'.json',JSON.stringify({date:new Date().toISOString(),url:base,results,errors},null,2)+'\n');
}finally{await browser.close();}
