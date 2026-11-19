/** Widget sin dependencias externas. El historial se limita a la pestaña actual. */
(function (Drupal, once, drupalSettings) {
  'use strict';
  Drupal.behaviors.baltoChat = {
    attach(context) {
      once('balto-chat', '.balto-chat', context).forEach((widget) => {
        const panel = widget.querySelector('.chat-panel');
        const launcher = widget.querySelector('.chat-launcher');
        const log = widget.querySelector('.chat-history');
        const form = widget.querySelector('.chat-form');
        const input = widget.querySelector('input');
        const typing = widget.querySelector('.chat-typing');
        const key = 'balto-chat-session-v1';
        const productKey = key + '-product';
        const validSku = value => typeof value === 'string' && /^[A-Z0-9][A-Z0-9-]{0,39}$/i.test(value);
        let history = [], busy = false, productSku = null;
        const rememberProduct = (value) => {
          productSku = validSku(value) ? value : null;
          try {
            if (productSku) sessionStorage.setItem(productKey, productSku);
            else sessionStorage.removeItem(productKey);
          } catch (_) { /* La memoria también funciona en la página actual. */ }
        };
        try {
          const savedSku = sessionStorage.getItem(productKey);
          if (validSku(savedSku)) productSku = savedSku;
          const stored = JSON.parse(sessionStorage.getItem(key) || '[]');
          if (Array.isArray(stored)) history = stored.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string' && m.text.length <= 10000).slice(-40);
        } catch (_) { /* Navegar sin almacenamiento no impide usar el chat. */ }
        const save = () => {
          history = history.slice(-40);
          try { sessionStorage.setItem(key, JSON.stringify(history)); } catch (_) { /* Cuota o almacenamiento deshabilitado. */ }
        };
        const safeLink = (value) => {
          try {
            const url = new URL(value, window.location.origin);
            // Mismo sitio: fichas de producto, la tienda y la portada (con #servicios).
            if (url.origin === window.location.origin && /^\/(?:product\/\d+|tienda)?$/.test(url.pathname)) return url;
            if (url.protocol === 'https:' && url.hostname === 'wa.me' && /^\/[0-9]+$/.test(url.pathname)) return url;
          } catch (_) { /* URL no válida. */ }
          return null;
        };
        const render = (message) => {
          const bubble = document.createElement('div');
          bubble.className = 'chat-message chat-message-' + message.role;
          const label = document.createElement('strong');
          label.className = 'visually-hidden';
          label.textContent = message.role === 'user' ? 'Tú: ' : 'BALTO: ';
          const text = document.createElement('p');
          text.textContent = message.text; // No interpretar HTML ni Markdown remoto.
          bubble.append(label, text);
          if (message.role === 'assistant' && Array.isArray(message.links)) {
            const links = document.createElement('div');
            links.className = 'chat-links';
            message.links.slice(0, 6).forEach((link) => {
              const url = link && safeLink(link.url);
              if (!url || typeof link.label !== 'string') return;
              const a = document.createElement('a');
              a.href = url.href; a.textContent = link.label.slice(0, 150);
              if (url.origin !== window.location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
              links.append(a);
            });
            bubble.append(links);
          }
          log.append(bubble);
          log.scrollTop = log.scrollHeight;
        };
        const add = (role, text, links = []) => {
          const message = { role, text, links };
          history.push(message); save(); render(message);
          while (log.children.length > 40) log.firstChild.remove();
        };
        const welcome = () => add('assistant', '¡Hola! Soy el asistente de BALTO. Pregúntame por productos, disponibilidad, servicios u horarios.');
        history.forEach(render);
        if (!history.length) welcome();
        const open = (state) => {
          panel.hidden = !state; launcher.setAttribute('aria-expanded', String(state));
          if (state) { input.focus(); log.scrollTop = log.scrollHeight; }
          else launcher.focus();
        };
        launcher.addEventListener('click', () => open(panel.hidden));
        widget.querySelector('.chat-close').addEventListener('click', () => open(false));
        widget.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) open(false); });
        const send = async (value) => {
          const message = value.trim();
          if (busy || !message || message.length > 500) return;
          busy = true; add('user', message); input.value = '';
          typing.hidden = false;
          form.querySelector('button').disabled = true;
          widget.querySelectorAll('.chat-prompts button').forEach(b => { b.disabled = true; });
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 50000);
          try {
            const url = new URL(drupalSettings.baltoChat?.webhookUrl);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Configuración no válida');
            const response = await fetch(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, productSku }), credentials: 'omit', signal: controller.signal });
            const data = await response.json();
            if (!response.ok || typeof data.reply !== 'string' || data.reply.length > 10000) throw new Error('Chat no disponible');
            if (Object.hasOwn(data, 'productSku')) rememberProduct(data.productSku);
            add('assistant', data.reply, data.links);
          } catch (_) {
            add('assistant', 'No pude conectar con el asistente. Inténtalo de nuevo en unos minutos. Puedes usar el enlace de WhatsApp de la página.');
          } finally {
            window.clearTimeout(timer); busy = false; typing.hidden = true;
            form.querySelector('button').disabled = false;
            widget.querySelectorAll('.chat-prompts button').forEach(b => { b.disabled = false; });
            if (!panel.hidden) input.focus();
          }
        };
        form.addEventListener('submit', (event) => { event.preventDefault(); send(input.value); });
        widget.querySelectorAll('.chat-prompts button').forEach(button => button.addEventListener('click', () => send(button.textContent)));
        widget.querySelector('.chat-clear').addEventListener('click', () => {
          if (busy) return;
          rememberProduct(null);
          history = []; log.replaceChildren(); save(); welcome(); input.focus();
        });
      });
    },
  };
})(Drupal, once, drupalSettings);
