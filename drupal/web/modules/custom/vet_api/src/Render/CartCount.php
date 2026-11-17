<?php

namespace Drupal\vet_api\Render;

use Drupal\Core\Cache\CacheableMetadata;
use Drupal\Core\Security\TrustedCallbackInterface;

/**
 * Contador del carrito para el encabezado.
 *
 * Se usa como lazy builder: la página puede guardarse en caché para todos
 * y el número se calcula aparte para cada visitante.
 */
final class CartCount implements TrustedCallbackInterface {

  public static function trustedCallbacks(): array {
    return ['build'];
  }

  public static function build(): array {
    $count = 0;
    $cache = new CacheableMetadata();
    $cache->addCacheContexts(['cart']);
    foreach (\Drupal::service('commerce_cart.cart_provider')->getCarts() as $cart) {
      $cache->addCacheableDependency($cart);
      foreach ($cart->getItems() as $item) {
        $count += (int) $item->getQuantity();
      }
    }
    $build = $count > 0
      ? ['#markup' => '<span class="cart-count" aria-hidden="true">' . ($count > 99 ? '99+' : $count) . '</span>']
      : ['#markup' => ''];
    $cache->applyTo($build);
    return $build;
  }

}
