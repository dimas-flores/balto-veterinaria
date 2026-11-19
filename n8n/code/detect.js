// Reglas deterministas: no se envían mensajes a proveedores externos.
const input = $input.first().json;
const allowedOrigin = 'http://localhost:8080'; // El instalador adapta esta URL.
const origin = input.headers?.origin;
const message = input.body?.message;
const normalize = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let status = 200;
if (origin && origin !== allowedOrigin) status = 403;
else if (typeof message !== 'string' || !message.trim() || message.length > 500) status = 400;
const text = status === 200 ? normalize(message.trim()) : '';
let intent = 'unknown';
const mentionsParasites = /\b(?:e?gar{2,}apat(?:as?)?|e?gar{2,}apast|pulgas?)\b/.test(text);
const asksForCare = /\b(?:tien?e+|tienen|trae|encontre|que hago|que sug(?:u?ieres|ueires)|que recomiendas|que (?:le )?compro)\b/.test(text);
if (mentionsParasites && asksForCare) intent = 'parasite_care';
else if (/\b(pago|pagos|pagar|yape|tarjeta|transferencia|efectivo)\b/.test(text)) intent = 'payments';
else if (/\b(precio|precios|cuesta|cuestan|vale|costo|cotizacion|cobran)\b/.test(text) && /\b(servicio|consulta|cirugia|esterilizacion|traumatologia|curacion|vacuna|vacunacion|tratamiento|internamiento|ecografia|radiografia|laboratorio|hemograma|bioquimica|microscopia|oftalmologia)\b/.test(text)) intent = 'service_prices';
else if (/\b(horario|horarios|ubicacion|direccion|direcciones|donde|contacto|telefono|whatsapp|cita|citas|atienden|atencion|abren|cierran|hospitalizacion|24 horas)\b/.test(text)) intent = 'schedule';
else if (/\b(servicio|servicios|rayos|ecografia|ecografias|cirugia|cirugias|laboratorio|hemograma|bioquimica|microscopia|oftalmologia|esterilizacion|traumatologicas|curaciones|vacunas|vacunacion|tratamiento|tratamientos|internamiento|medicina veterinaria)\b/.test(text)) intent = 'services';
else if (/\b(oferta|ofertas|promocion|promociones|descuento|descuentos)\b/.test(text)) intent = 'promotions';
else if (/^(?:(?:hola|buenas)[,\s]+)?[¿¡]?que\s+(?:nos\s+)?ofrece(?:n)?(?:\s+balto(?:\s+veterinaria)?)?[?!.\s]*$/.test(text)) intent = 'overview';
else if (/\b(categoria|categorias)\b/.test(text)) intent = 'categories';
else if (/\b(alimento|alimentos|accesorio|accesorios|higiene|juguete|juguetes|salud|medicamento|medicamentos)\b/.test(text) && !/\b(precio|cuesta|cuestan|stock|disponible|disponibilidad)\b/.test(text)) intent = 'category';
else if (/\b(precio|precios|cuesta|cuestan|vale|valen|stock|disponible|disponibles|disponibilidad|producto|productos|tienen|venden|busco|quiero|chow|whiskas|purina|pelota|collar|correa|shampoo|heno|arena|rascador|comedero|cepillo|suplemento|bal-)\b/.test(text)) intent = 'product';
else if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hola balto|gracias)[!?.\s]*$/.test(text)) intent = 'greeting';
// Solo se reutiliza el SKU ante una pregunta explícita de seguimiento.
const followUp = intent !== 'parasite_care' && /^(?:[¿¡]\s*)?(?:y\s+)?(?:cuanto (?:cuesta|vale|esta)|cual es (?:el|su) precio|que precio tiene|(?:cuantas?|cuantos?) (?:bolsas?|unidades?) (?:quedan|hay|tienen)|(?:hay|queda) stock|(?:esta|sigue) disponible)[?!.,\s]*$/.test(text);
const previousSku = input.body?.productSku;
const rememberedSku = typeof previousSku === 'string' && /^[A-Z0-9][A-Z0-9-]{0,39}$/i.test(previousSku) ? previousSku : '';
if (followUp) intent = rememberedSku ? 'product' : 'product_clarification';
const stop = new Set('hola por favor cuanto cuesta cuestan vale valen precio precios del de la el los las un una unos unas para y o hay tienen teneis venden disponible disponibles disponibilidad stock producto productos busco quiero saber me puedes decir cual es son en balto veterinaria perro perros gato gatos alimento alimentos'.split(' '));
const q = followUp ? rememberedSku : text.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w && !stop.has(w)).join(' ').slice(0, 100);
return [{ json: { intent, text, q, status, followUp } }];
