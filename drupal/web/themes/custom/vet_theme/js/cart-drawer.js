/**
 * Carrito lateral: agregar sin recargar la página y ver el resumen.
 *
 * Sin JavaScript todo sigue funcionando con el envío normal del formulario
 * de Commerce. Con JavaScript se envía el mismo formulario por fetch y luego
 * se pide el resumen en /carrito/resumen (por sesión, sin caché).
 */
(function (Drupal) {
  'use strict';

  const SUMMARY_URL = '/carrito/resumen';
  const FORM_SELECTOR = '.product-card-cart form, .product-cart-form form';
  let lastTrigger = null;

  const drawer = () => document.querySelector('[data-cart-drawer]');
  const $ = (selector) => drawer()?.querySelector(selector);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function updateBadge(count) {
    const link = document.querySelector('.cart-link');
    if (!link) return;
    let badge = link.querySelector('.cart-count');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'cart-count';
        badge.setAttribute('aria-hidden', 'true');
        link.append(badge);
      }
      badge.textContent = count > 99 ? '99+' : String(count);
    }
    else if (badge) {
      badge.remove();
    }
  }

  function render(summary) {
    const body = $('[data-cart-body]');
    const footer = $('[data-cart-footer]');
    if (!summary.items.length) {
      body.innerHTML = '<p class="cart-drawer-empty">Tu carrito está vacío.</p>';
      footer.hidden = true;
      return;
    }
    body.innerHTML = '<ul class="cart-drawer-items">' + summary.items.map((item) => (
      '<li class="cart-drawer-item">'
      + (item.image ? '<img src="' + escapeHtml(item.image) + '" alt="" width="64" height="64" loading="lazy" />' : '<span class="cart-drawer-thumb"></span>')
      + '<div><a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.title) + '</a>'
      + '<small>' + escapeHtml(item.quantity) + ' × ' + escapeHtml(item.unit_price) + '</small></div>'
      + '<strong>' + escapeHtml(item.total) + '</strong></li>'
    )).join('') + '</ul>';
    $('[data-cart-subtotal]').textContent = summary.subtotal;
    $('[data-cart-checkout]').href = summary.checkout_url || summary.cart_url;
    $('[data-cart-page]').href = summary.cart_url;
    footer.hidden = false;
  }

  async function loadSummary() {
    const response = await fetch(SUMMARY_URL, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('summary');
    const summary = await response.json();
    updateBadge(summary.count);
    render(summary);
    return summary;
  }

  function trapFocus(event) {
    if (event.key === 'Escape') { close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...drawer().querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function open(message) {
    const el = drawer();
    if (!el) return;
    $('[data-cart-status]').textContent = message || '';
    $('[data-cart-status]').classList.toggle('is-error', false);
    el.hidden = false;
    document.documentElement.classList.add('cart-drawer-open');
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.addEventListener('keydown', trapFocus);
    $('.cart-drawer-panel').focus();
  }

  function close() {
    const el = drawer();
    if (!el || el.hidden) return;
    el.classList.remove('is-open');
    el.removeEventListener('keydown', trapFocus);
    document.documentElement.classList.remove('cart-drawer-open');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { el.hidden = true; }, reduce ? 0 : 220);
    lastTrigger?.focus?.();
  }

  function showError(text) {
    const status = $('[data-cart-status]');
    status.textContent = text;
    status.classList.add('is-error');
  }

  async function addToCart(form, submitter) {
    const button = submitter || form.querySelector('[type="submit"]');
    const original = button.value;
    button.disabled = true;
    button.value = 'Agregando…';
    try {
      const data = new FormData(form, submitter || undefined);
      const response = await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' });
      const html = await response.text();
      const page = new DOMParser().parseFromString(html, 'text/html');
      const error = page.querySelector('.messages--error');
      const name = form.closest('.product-card, .product-detail')?.querySelector('h1, h3')?.textContent.trim() || 'Producto';
      open('');
      $('[data-cart-body]').innerHTML = '<p class="cart-drawer-empty">Cargando…</p>';
      await loadSummary();
      if (!response.ok || error) {
        const parts = error ? [...error.querySelectorAll('li')].map((li) => li.textContent.trim()) : [];
        const text = parts.length ? parts.join(' ') : (error?.textContent || 'No se pudo agregar el producto.');
        showError(text.replace(/^\s*Mensaje de error\s*/i, '').replace(/\s+/g, ' ').trim());
      }
      else {
        $('[data-cart-status]').textContent = name + ' se agregó a tu carrito.';
      }
    }
    catch (e) {
      // Si algo falla, se usa el envío normal del formulario.
      form.submit();
      return;
    }
    finally {
      button.disabled = false;
      button.value = original;
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(FORM_SELECTOR) || !drawer()) return;
    event.preventDefault();
    lastTrigger = event.submitter || form.querySelector('[type="submit"]');
    addToCart(form, event.submitter);
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-cart-close]')) { close(); return; }
    const cartLink = event.target.closest('.cart-link');
    if (cartLink && drawer() && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      lastTrigger = cartLink;
      open('');
      $('[data-cart-body]').innerHTML = '<p class="cart-drawer-empty">Cargando…</p>';
      loadSummary().catch(() => { window.location.href = cartLink.href; });
    }
  });

  Drupal.baltoCartDrawer = { open, close, loadSummary };
})(Drupal);
