/** Botones −/+ para la cantidad del carrito; el campo numérico sigue siendo editable y es el que se envía. */
(function (Drupal, once) {
  'use strict';
  Drupal.behaviors.baltoQuantityStepper = {
    attach(context) {
      once('balto-qty', '.product-cart-form input[type="number"][name^="quantity"]', context).forEach((input) => {
        const min = Number(input.min || 1);
        const max = input.max ? Number(input.max) : Infinity;
        const wrap = document.createElement('div');
        wrap.className = 'qty-stepper';
        const make = (label, text, delta) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', label);
          b.textContent = text;
          b.addEventListener('click', () => {
            const current = Number(input.value) || min;
            input.value = Math.min(max, Math.max(min, current + delta));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            sync();
          });
          return b;
        };
        const less = make('Disminuir cantidad', '−', -1);
        const more = make('Aumentar cantidad', '+', 1);
        const sync = () => {
          const v = Number(input.value) || min;
          less.disabled = v <= min || input.disabled;
          more.disabled = v >= max || input.disabled;
        };
        input.parentNode.insertBefore(wrap, input);
        wrap.append(less, input, more);
        input.addEventListener('input', sync);
        sync();
      });
    },
  };
})(Drupal, once);
