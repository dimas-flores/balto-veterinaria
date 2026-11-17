<?php

declare(strict_types=1);

namespace Drupal\balto_automation\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/** Últimos pedidos para el bot del dueño. Protegido con el secreto compartido de n8n. */
final class OrdersController extends ControllerBase {

  public function latest(Request $request): JsonResponse {
    $secret = (string) getenv('BALTO_N8N_SECRET');
    $given = (string) $request->headers->get('X-Balto-Secret', '');
    if ($secret === '' || !hash_equals($secret, $given)) {
      return new JsonResponse(['error' => 'unauthorized'], 403);
    }
    $storage = $this->entityTypeManager()->getStorage('commerce_order');
    $ids = $storage->getQuery()->accessCheck(FALSE)
      ->condition('state', 'draft', '<>')
      ->sort('placed', 'DESC')->range(0, 5)->execute();
    $rows = [];
    foreach ($storage->loadMultiple($ids) as $order) {
      $total = $order->getTotalPrice();
      $rows[] = [
        'order_number' => (string) ($order->getOrderNumber() ?: $order->id()),
        'placed' => $order->getPlacedTime() ? date('Y-m-d H:i', $order->getPlacedTime()) : '',
        'state' => (string) $order->getState()->getLabel(),
        'total' => $total ? $total->getNumber() : '0',
        'currency' => $total ? $total->getCurrencyCode() : 'PEN',
        'items' => count($order->getItems()),
      ];
    }
    $response = new JsonResponse(['data' => $rows]);
    $response->headers->set('Cache-Control', 'no-store');
    return $response;
  }

}
