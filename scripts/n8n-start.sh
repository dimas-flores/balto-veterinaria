#!/bin/sh
# Importaciones antes del servidor: evita dos procesos escribiendo SQLite a la vez.
set -eu
umask 077
trap 'rm -f /tmp/balto-credentials.json /tmp/balto-chatbot.json /tmp/balto-pedidos.json /tmp/balto-orders-enabled /tmp/balto-workflow.sha256' EXIT INT TERM
node /opt/balto/n8n-prepare.cjs
n8n import:credentials --input=/tmp/balto-credentials.json
marker=/home/node/.n8n/balto-workflow.sha256
if [ ! -f "$marker" ] || ! cmp -s "$marker" /tmp/balto-workflow.sha256; then
  n8n import:workflow --input=/tmp/balto-chatbot.json
  n8n publish:workflow --id=baltoChatbot
  n8n import:workflow --input=/tmp/balto-pedidos.json
  if [ "$(cat /tmp/balto-orders-enabled)" = 1 ]; then n8n publish:workflow --id=baltoPedidos; else n8n unpublish:workflow --id=baltoPedidos || true; fi
  cp /tmp/balto-workflow.sha256 "$marker"
fi
rm -f /tmp/balto-credentials.json /tmp/balto-chatbot.json /tmp/balto-pedidos.json /tmp/balto-orders-enabled /tmp/balto-workflow.sha256
trap - EXIT INT TERM
exec n8n start
