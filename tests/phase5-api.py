#!/usr/bin/env python3
"""Integración HTTP real. No imprime claves; restaura las ediciones temporales."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
ENV = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
BASE = os.environ.get('BALTO_TEST_URL', 'http://localhost:8080')
DOCKER = ['docker']
if not os.environ.get('DOCKER_HOST') and Path('/run/user/1000/balto-docker.sock').exists():
    DOCKER += ['--host=unix:///run/user/1000/balto-docker.sock']
results = []

def check(ok, message):
    if not ok:
        raise AssertionError(message)
    results.append(message)
    print('OK:', message)

def request(path, key=True, method='GET'):
    headers = {'X-API-KEY': ENV['VET_API_KEY']} if key is True else ({'X-API-KEY': 'incorrecta'} if key else {})
    req = urllib.request.Request(BASE + '/api/vet/' + path, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    data = json.loads(response.read())
    check('no-store' in response.headers.get('Cache-Control', ''), 'Respuesta sin almacenamiento en caché: ' + path)
    check('application/json' in response.headers.get('Content-Type', ''), 'Tipo JSON: ' + path)
    return response.status, data

def php(code):
    out = subprocess.run(DOCKER + ['compose', 'exec', '-T', 'drupal', 'drush', 'php:eval', code], cwd=ROOT, capture_output=True, text=True, check=True)
    return out.stdout.strip()

for endpoint in ['products', 'products/BAL-ALI-001', 'categories', 'services', 'schedule']:
    for key in [False, 'wrong']:
        status, body = request(endpoint, key)
        check(status == 401 and 'error' in body, 'Rechazo de clave ausente/incorrecta: ' + endpoint)
    status, body = request(endpoint)
    check(status == 200 and 'data' in body, 'Consulta autorizada: ' + endpoint)

_, products = request('products')
check(len(products['data']) >= 15 and products['meta']['page_size'] == 50, 'Catálogo completo y paginación acotada')
check(all(p['currency'] == 'PEN' and isinstance(p['stock'], int) and p['url'].startswith('/product/') for p in products['data']), 'Moneda, stock y enlaces de producto válidos')
_, sold = request('products/BAL-ALI-004')
check(sold['data']['stock'] == 0 and not sold['data']['available'], 'Producto agotado informa saldo cero')
_, found = request('products?q=Dog%20Chow')
check(any(p['sku'] == 'BAL-ALI-001' for p in found['data']), 'Búsqueda por nombre')
_, found = request('products?q=BAL-JUG-001')
stock = int(float(php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-JUG-001"]);$v=reset($v);echo \\Drupal::service("vet_api.catalog")->stock($v);')))
check(len(found['data']) == 1 and found['data'][0]['stock'] == stock, 'Consulta por SKU refleja el saldo real del libro de existencias')
_, categories = request('categories')
check(len(categories['data']) == 5, 'Cinco categorías desde taxonomía')
category = products['data'][0]['category_id']
_, filtered = request('products?category=' + category + '&species=perro')
check(all(p['category_id'] == category and 'perro' in p['species'] for p in filtered['data']), 'Filtros combinados de categoría y especie')
_, services = request('services')
check(len(services['data']) == 11, 'Once servicios publicados')
check({'Peluquería y spa', 'Desparasitación'} <= {s['title'] for s in services['data']}, 'Servicios de las redes de BALTO publicados')
_, schedule = request('schedule')
check(len(schedule['data']['addresses']) == 2 and '986' in schedule['data']['whatsapp'], 'Direcciones y contacto desde configuración')
check(schedule['data']['schedule_is_example'] is False and '24' in schedule['data']['hospitalization'], 'Hospitalización continua y horario de consultorio confirmado')
for path, expected in [('products/NO-EXISTE', 404), ('products?species=humano', 400), ('products?category=999999', 400), ('products?q%5B%5D=hola', 400), ('products?page=-1', 400), ('products?q=' + 'a'*101, 400), ('orders', 404), ('customers', 404)]:
    status, body = request(path)
    check(status == expected and 'error' in body, 'Error JSON correcto: ' + path[:60])
status, _ = request('products', method='POST')
check(status == 405, 'API de solo lectura rechaza POST')
_, empty = request('products?q=INEXISTENTEZZZZ')
check(empty['data'] == [] and empty['meta']['total'] == 0, 'Búsqueda inexistente devuelve lista vacía')
_, page = request('products?page=1')
check(page['data'] == [] and page['meta']['total'] >= 15, 'Página fuera del catálogo conserva el total')
# Se guarda el valor anterior y se restaura incluso si falla la prueba HTTP.
original = php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$v=reset($v);echo $v->getPrice()->getNumber();')
try:
    php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$v=reset($v);$v->setPrice(new \\Drupal\\commerce_price\\Price("190.50","PEN"));$v->save();')
    _, live = request('products/BAL-ALI-001')
    check(float(live['data']['price_number']) == 190.50, 'Precio editado en Drupal reflejado inmediatamente en API')
finally:
    # Valor originado en campo decimal; JSON no se usa para construir shell.
    from decimal import Decimal
    restored = str(Decimal(original))
    php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$v=reset($v);$v->setPrice(new \\Drupal\\commerce_price\\Price("' + restored + '","PEN"));$v->save();')
_, restored_product = request('products/BAL-ALI-001')
check(float(restored_product['data']['price_number']) == float(original), 'Precio original restaurado')
# Un producto retirado de publicación tampoco se revela con una clave válida.
try:
    php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$p=reset($v)->getProduct();$p->setUnpublished()->save();')
    status, _ = request('products/BAL-ALI-001')
    check(status == 404, 'Producto sin publicar oculto en consulta por SKU')
    _, unpublished = request('products?q=BAL-ALI-001')
    check(unpublished['data'] == [], 'Producto sin publicar oculto en listado')
finally:
    php('$v=\\Drupal::entityTypeManager()->getStorage("commerce_product_variation")->loadByProperties(["sku"=>"BAL-ALI-001"]);$p=reset($v)->getProduct();$p->setPublished()->save();')
status, _ = request('products/BAL-ALI-001')
check(status == 200, 'Publicación original restaurada')
status, _ = request('products/BAL-ALI-001', False)
check(status == 401, 'Una respuesta autorizada previa no permite acceso sin clave')
serialized = json.dumps([products, services, schedule])
check(ENV['VET_API_KEY'] not in serialized and 'demo-fase4@example.invalid' not in serialized and 'vet_customer' not in serialized, 'Sin secretos ni datos de compradores en las respuestas')
from datetime import datetime, timezone
(ROOT / 'docs/verificacion-fase-5.json').write_text(json.dumps({'date': datetime.now(timezone.utc).isoformat(), 'results': results, 'errors': []}, ensure_ascii=False, indent=2) + '\n')
print(f'Fase 5: {len(results)} comprobaciones correctas.')
