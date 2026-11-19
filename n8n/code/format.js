const context = $('Validar interpretación').first().json;
const contactResponse = $('Leer contacto').first().json;
const business = contactResponse.data;
const response = $('Preparar consulta').first().json.path === '/api/vet/schedule'
  ? contactResponse
  : $input.first().json;
const publicBase = 'http://localhost:8080'; // El instalador adapta esta URL.
let status = context.status;
let reply = '';
let links = [];
const contact = business?.whatsapp ? `Puedes escribirnos al WhatsApp ${business.whatsapp} para consultas o citas.` : '';
const cleanUrl = (url, allowedExternal = false) => {
  if (typeof url !== 'string') return '';
  if (url.startsWith('/') && !url.startsWith('//')) return publicBase + url;
  if (allowedExternal && /^https:\/\/wa\.me\/[0-9]+(?:\?|$)/.test(url)) return url;
  return '';
};
if (!business || !response.data) {
  status = 503;
  reply = 'No puedo consultar los datos de BALTO en este momento. Inténtalo de nuevo en unos minutos.';
}
else if (context.intent === 'greeting') reply = `¡Hola! Soy el asistente de ${business.name}. Puedo consultar productos, precios, disponibilidad, servicios, horarios y direcciones. ¿Qué necesitas?`;
else if (context.intent === 'overview') {
  const services = response.data.slice(0, 5).map(service => service.title).join(', ');
  const clinic = services ? `Servicios veterinarios: ${services}.\n` : '';
  reply = `${clinic}En la tienda encuentras alimentos, accesorios y productos de cuidado. También puedes separar una cita por WhatsApp.`;
  links = [
    { label: 'Ver servicios', url: cleanUrl('/#servicios') },
    { label: 'Ver tienda', url: cleanUrl('/tienda') },
  ];
}
else if (context.intent === 'promotions') {
  reply = 'No tengo promociones registradas para confirmar. Puedes revisar los precios en la tienda o consultar las ofertas vigentes por WhatsApp.';
  links = [{ label: 'Ver tienda', url: cleanUrl('/tienda') }];
}
else if (context.intent === 'schedule') {
  reply = `Hospitalización: ${business.hospitalization}.\nAtención en tienda/consultorio: ${business.consultation_schedule}${business.schedule_is_example && !/ejemplo/i.test(business.consultation_schedule) ? ' (horario de ejemplo, pendiente de confirmar)' : ''}\nSedes:\n${(business.addresses || []).map(a => '• ' + a).join('\n')}\n${contact}`;
}
else if (context.intent === 'services') reply = `Nuestros servicios:\n${response.data.map(s => '• ' + s.title + ': ' + s.description).join('\n')}\n${business.service_pricing_note || ''}\n${contact}`;
else if (context.intent === 'payments') reply = `Medios de pago en el local: ${business.payment_methods || 'Consulta los medios disponibles por WhatsApp'}.${business.yape_number ? '\nYape del establecimiento: ' + business.yape_number + '.' : ''}\nEl WhatsApp de atención es ${business.whatsapp}.\nEn la web puedes solicitar retiro con pago al recoger o Yape coordinado. Confirma disponibilidad y total con BALTO antes de pagar. La opción Pago simulado es solo académica y no genera cobros.`;
else if (context.intent === 'service_prices') reply = `${business.service_pricing_note || 'Solicita una cotización de servicios por WhatsApp.'}\n${contact}`;
else if (context.intent === 'categories') reply = `Categorías de la tienda:\n${response.data.map(c => '• ' + c.name).join('\n')}\nDime el nombre de una categoría o de un producto para consultar precios y existencias.`;
else if (context.intent === 'product' || context.intent === 'category') {
  const products = response.data;
  if (!products.length) reply = `No encontré productos que coincidan. Puedes consultar por nombre o SKU, o preguntar por las categorías. ${contact}`;
  else {
    reply = products.slice(0, 5).map(p => p.available ? `• ${p.name} cuesta ${p.price} y hay ${p.stock} ${p.stock === 1 ? 'unidad disponible' : 'unidades disponibles'}.` : `• ${p.name}: ese producto está agotado por ahora. Su precio de referencia es ${p.price}.`).join('\n');
    if (products.length > 5 || (response.meta?.total || 0) > 5) reply += '\nTe muestro hasta cinco opciones. Escribe un nombre más específico para afinar la búsqueda.';
    if (response.meta?.catalog_is_example) reply += '\nProductos, precios y existencias de ejemplo; pendientes del inventario real de BALTO.';
    links = products.slice(0, 5).map(p => ({ label: 'Ver ' + p.name, url: cleanUrl(p.url) })).filter(l => l.url);
  }
}
else reply = `Puedo ayudarte con productos, precios, disponibilidad, servicios y horarios. ¿Quieres consultar un producto, ver los servicios o separar una cita? ${contact}`;
if (business && status === 200) {
  const url = cleanUrl(business.appointment_url || business.whatsapp_url, true);
  if (url) links.push({ label: context.intent === 'overview' ? 'Separar cita por WhatsApp' : 'Consultar por WhatsApp', url });
}
return [{ json: { status, body: { reply, intent: context.intent, engine: context.engine, links } } }];
