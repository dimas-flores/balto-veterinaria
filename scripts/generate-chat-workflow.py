#!/usr/bin/env python3
"""Genera el export importable; los secretos se asignan como credencial al arrancar."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
nodes = []
def node(name, kind, parameters, version=1, **extra):
    nodes.append(dict(id=name, name=name, type='n8n-nodes-base.'+kind, typeVersion=version, position=[len(nodes)*260, 300], parameters=parameters, **extra))
node('Recibir chat', 'webhook', {'httpMethod': 'POST', 'path': 'chat', 'responseMode': 'responseNode', 'options': {'allowedOrigins': 'http://localhost:8080'}}, 2.1, webhookId='balto-chat-webhook')
node('Detectar intención', 'code', {'jsCode': (ROOT/'n8n/code/detect.js').read_text()}, 2)
# Gemini interpreta la pregunta; Drupal conserva la autoridad sobre los datos.
node('Preparar Gemini', 'code', {'jsCode': 'return [{json: {...$input.first().json, geminiRequest: ' + (ROOT/'n8n/code/gemini-request.js').read_text().strip() + '}}];'}, 2)
node('Usar Gemini', 'if', {'conditions': {'options': {'caseSensitive': True, 'typeValidation': 'strict', 'version': 2}, 'conditions': [{'id': 'valid-message', 'leftValue': '={{ $json.status === 200 && !$json.followUp }}', 'rightValue': True, 'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}], 'combinator': 'and'}, 'options': {}}, 2.2)
node('Interpretar con Gemini', 'httpRequest', {
    'method': 'POST', 'url': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
    'sendBody': True, 'specifyBody': 'json',
    'jsonBody': '={{ $json.geminiRequest }}',
    'options': {'timeout': 10000, 'response': {'response': {'responseFormat': 'json'}}}
}, 4.2, credentials={'httpHeaderAuth': {'id': 'baltoGeminiApi', 'name': 'BALTO Gemini'}}, onError='continueRegularOutput')
node('Validar interpretación', 'code', {'jsCode': (ROOT/'n8n/code/gemini-validate.js').read_text()}, 2)
def http(name, url):
    node(name, 'httpRequest', {'url': url, 'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'options': {'timeout': 8000, 'response': {'response': {'responseFormat': 'json'}}}}, 4.2, credentials={'httpHeaderAuth': {'id': 'baltoDrupalApi', 'name': 'BALTO API interna'}}, onError='continueRegularOutput')
def condition(name, expression):
    node(name, 'if', {'conditions': {
        'options': {'typeValidation': 'strict', 'version': 2},
        'conditions': [{'id': name, 'leftValue': expression,
                        'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}],
        'combinator': 'and',
    }, 'options': {}}, 2.2)

condition('¿Mensaje válido?', '={{ $json.status === 200 }}')
node('Responder error de entrada', 'code', {'jsCode': '''
const { status } = $input.first().json;
const reply = status === 403
  ? 'Este chat solo está habilitado desde la página de BALTO.'
  : 'Escribe un mensaje de entre 1 y 500 caracteres.';
return [{ json: { status, body: { reply, intent: 'unknown', engine: 'rules', links: [] } } }];
'''.strip()}, 2)

http('Leer contacto', 'http://drupal/api/vet/schedule')
condition('¿Buscar por categoría?', '={{ $("Validar interpretación").first().json.intent === "category" }}')
http('Leer categorías', 'http://drupal/api/vet/categories')
node('Preparar consulta', 'code', {'jsCode': (ROOT/'n8n/code/plan.js').read_text()}, 2)
condition('¿Hace falta otra consulta?', '={{ $json.path !== "/api/vet/schedule" }}')
http('Consultar Drupal', "={{ 'http://drupal' + $json.path }}")
node('Responder en español', 'code', {'jsCode': (ROOT/'n8n/code/format.js').read_text()}, 2)
node('Redactar con Gemini', 'if', {'conditions': {'options': {'caseSensitive': True, 'typeValidation': 'strict', 'version': 2}, 'conditions': [{'id': 'grounded-reply', 'leftValue': '={{ $json.status === 200 && $json.body.engine === "gemini" }}', 'rightValue': True, 'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}], 'combinator': 'and'}, 'options': {}}, 2.2)
node('Preparar redacción', 'code', {'jsCode': (ROOT/'n8n/code/reply-request.js').read_text()}, 2)
node('Crear respuesta Gemini', 'httpRequest', {
    'method': 'POST', 'url': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
    'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ $json.geminiRequest }}',
    'options': {'timeout': 10000, 'response': {'response': {'responseFormat': 'json'}}}
}, 4.2, credentials={'httpHeaderAuth': {'id': 'baltoGeminiApi', 'name': 'BALTO Gemini'}}, onError='continueRegularOutput')
node('Validar respuesta', 'code', {'jsCode': (ROOT/'n8n/code/reply-validate.js').read_text()}, 2)
response_parameters = {'respondWith': 'json', 'responseBody': '={{ $json.body }}', 'options': {'responseCode': '={{ $json.status }}', 'responseHeaders': {'entries': [{'name': 'Cache-Control', 'value': 'no-store'}, {'name': 'X-Content-Type-Options', 'value': 'nosniff'}]}}}
node('Enviar respuesta', 'respondToWebhook', response_parameters, 1.4)
node('Enviar error', 'respondToWebhook', response_parameters, 1.4)
def routes(*targets):
    return {'main': [[{'node': target, 'type': 'main', 'index': 0}] for target in targets]}

main_path = [
    'Recibir chat', 'Detectar intención', '¿Mensaje válido?', 'Usar Gemini', 'Validar interpretación',
    'Leer contacto', '¿Buscar por categoría?', 'Preparar consulta',
    '¿Hace falta otra consulta?', 'Responder en español', 'Redactar con Gemini',
    'Enviar respuesta',
]
connections = {source: routes(target) for source, target in zip(main_path, main_path[1:])}
connections.update({
    '¿Mensaje válido?': routes('Usar Gemini', 'Responder error de entrada'),
    'Responder error de entrada': routes('Enviar error'),
    'Usar Gemini': routes('Preparar Gemini', 'Validar interpretación'),
    'Preparar Gemini': routes('Interpretar con Gemini'),
    'Interpretar con Gemini': routes('Validar interpretación'),
    '¿Buscar por categoría?': routes('Leer categorías', 'Preparar consulta'),
    'Leer categorías': routes('Preparar consulta'),
    '¿Hace falta otra consulta?': routes('Consultar Drupal', 'Responder en español'),
    'Consultar Drupal': routes('Responder en español'),
    'Redactar con Gemini': routes('Preparar redacción', 'Enviar respuesta'),
    'Preparar redacción': routes('Crear respuesta Gemini'),
    'Crear respuesta Gemini': routes('Validar respuesta'),
    'Validar respuesta': routes('Enviar respuesta'),
})

positions = {name: [index * 220, 300] for index, name in enumerate(main_path)}
positions.update({
    'Responder error de entrada': [440, 80],
    'Enviar error': [660, 80],
    'Preparar Gemini': [660, 540],
    'Interpretar con Gemini': [880, 540],
    'Leer categorías': [1430, 80],
    'Consultar Drupal': [1870, 80],
    'Preparar redacción': [2200, 540],
    'Crear respuesta Gemini': [2400, 540],
    'Validar respuesta': [2600, 540],
})
for item in nodes:
    item['position'] = positions[item['name']]

for title, description, x, y, width, color in [
    ('Entrada', 'Recibe, clasifica y valida el mensaje.', -40, -100, 800, 4),
    ('Datos de Drupal', 'Consulta el contacto y los datos que necesita la respuesta.', 1060, -100, 880, 5),
    ('Respuesta', 'Devuelve el texto y los enlaces al chat.', 1940, -100, 750, 6),
    ('Gemini opcional', 'Interpretación del mensaje cuando está habilitado.', 600, 680, 430, 7),
    ('Redacción opcional', 'Reformula la respuesta cuando interviene Gemini.', 2150, 680, 550, 7),
]:
    node(title, 'stickyNote', {
        'content': f'## {title}\n{description}', 'width': width, 'height': 100, 'color': color,
    })
    nodes[-1]['position'] = [x, y]

workflow = {'id': 'baltoChatbot', 'name': 'BALTO · Chatbot web', 'active': False, 'nodes': nodes, 'connections': connections, 'settings': {'executionOrder': 'v1', 'saveDataSuccessExecution': 'none', 'saveDataErrorExecution': 'none', 'saveManualExecutions': False, 'executionTimeout': 55}, 'tags': []}
(ROOT/'n8n/workflows/chatbot.json').write_text(json.dumps(workflow, ensure_ascii=False, indent=2)+'\n')
