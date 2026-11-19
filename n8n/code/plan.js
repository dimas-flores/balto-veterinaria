const context = $('Validar interpretación').first().json;
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let path = '/api/vet/schedule';
if (['services', 'overview'].includes(context.intent)) path = '/api/vet/services';
else if (context.intent === 'categories') path = '/api/vet/categories';
else if (context.intent === 'category') {
  const data = $input.first().json.data;
  const categories = Array.isArray(data) ? data : [];
  // El identificador se obtiene de Drupal, nunca se presupone el ID de taxonomía.
  const category = categories.find(c => normalize(c.name).split(/[^a-z]+/).filter(w => w.length > 4).some(w => context.text.includes(w) || context.text.includes(w.replace(/s$/, ''))));
  path = category ? '/api/vet/products?category=' + encodeURIComponent(category.id) : '/api/vet/products';
}
else if (context.intent === 'product') path = '/api/vet/products?q=' + encodeURIComponent(context.q);
return [{ json: { ...context, path } }];
