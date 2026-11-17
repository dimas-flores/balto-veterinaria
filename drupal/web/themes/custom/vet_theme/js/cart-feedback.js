/**
 * Muestra los avisos de estado de Drupal como notificación flotante que se
 * puede cerrar. La compra desde tarjetas usa el carrito lateral (cart-drawer.js).
 */
(function (Drupal, once) {
  'use strict';
  Drupal.behaviors.baltoCartFeedback = {
    attach(context) {
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
