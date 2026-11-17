/**
 * Compra directa desde tarjetas: vuelve a la tarjeta tras agregar y muestra
 * la confirmación como notificación flotante que se puede cerrar.
 */
(function (Drupal, once) {
  'use strict';
  const KEY = 'balto-return-sku';
  const storage = {
    get() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem(KEY, v); } catch (e) { /* sin almacenamiento: no se restaura */ } },
    clear() { try { sessionStorage.removeItem(KEY); } catch (e) { /* nada */ } },
  };

  Drupal.behaviors.baltoCartFeedback = {
    attach(context) {
      once('balto-card-cart', '.product-card-cart form', context).forEach((form) => {
        form.addEventListener('submit', () => {
          const card = form.closest('.product-card');
          if (card && card.dataset.sku) storage.set(card.dataset.sku);
        });
      });

      once('balto-return', 'body', context).forEach(() => {
        const sku = storage.get();
        storage.clear();
        if (!sku) return;
        const card = document.querySelector('.product-card[data-sku="' + CSS.escape(sku) + '"]');
        if (!card) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'instant' });
        card.querySelector('input[type="submit"], a')?.focus({ preventScroll: true });
      });

      once('balto-toast', '.notices .messages--status', context).forEach((message) => {
        message.classList.add('is-toast');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'toast-close';
        close.setAttribute('aria-label', 'Cerrar aviso');
        close.textContent = '×';
        close.addEventListener('click', () => message.remove());
        message.append(close);
        let timer;
        const start = () => { timer = setTimeout(() => message.remove(), 7000); };
        const stop = () => clearTimeout(timer);
        message.addEventListener('mouseenter', stop);
        message.addEventListener('focusin', stop);
        message.addEventListener('mouseleave', start);
        start();
      });
    },
  };
})(Drupal, once);
