<?php

namespace Drupal\vet_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Resumen del carrito del visitante para el panel lateral.
 *
 * Es por sesión: se desactiva la caché de página y la respuesta lleva
 * Cache-Control: no-store para que nunca se comparta entre visitantes.
 */
final class CartSummaryController extends ControllerBase {

  public function summary(): JsonResponse {
    \Drupal::service('page_cache_kill_switch')->trigger();
    $items = [];
    $count = 0;
    $subtotal = 0.0;
    $checkout = NULL;
    $catalog = \Drupal::service('vet_api.catalog');
    foreach (\Drupal::service('commerce_cart.cart_provider')->getCarts() as $cart) {
      foreach ($cart->getItems() as $item) {
        $variation = $item->getPurchasedEntity();
        $product = $variation?->getProduct();
        $quantity = (int) $item->getQuantity();
        $total = (float) ($item->getTotalPrice()?->getNumber() ?? 0);
        $count += $quantity;
        $subtotal += $total;
        $card = $product ? $catalog->present($product, $variation) : [];
        $items[] = [
          'title' => $card['name'] ?? $item->label(),
          'quantity' => $quantity,
          'unit_price' => $card['price'] ?? '',
          'total' => self::money($total),
          'url' => $card['url'] ?? '',
          'image' => $card['image_url'] ?? '',
          'image_alt' => $card['image_alt'] ?? '',
        ];
      }
      if ($cart->hasItems() && !$checkout) {
        $checkout = Url::fromRoute('commerce_checkout.form', ['commerce_order' => $cart->id()])->toString();
      }
    }
    $response = new JsonResponse([
      'count' => $count,
      'items' => $items,
      'subtotal' => self::money($subtotal),
      'cart_url' => Url::fromRoute('commerce_cart.page')->toString(),
      'checkout_url' => $checkout,
    ]);
    $response->headers->set('Cache-Control', 'no-store, private');
    return $response;
  }

  private static function money(float $amount): string {
    return 'S/ ' . number_format($amount, 2, '.', ',');
  }

}
