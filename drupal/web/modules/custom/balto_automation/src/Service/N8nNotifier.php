<?php

declare(strict_types=1);

namespace Drupal\balto_automation\Service;

use Drupal\commerce_order\Entity\OrderInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;

/** Envía eventos de pedidos a n8n. Un fallo nunca interrumpe la compra ni el pago. */
final class N8nNotifier {
  public function __construct(
    private readonly ClientInterface $http,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  /** @param string $event 'placed' (pedido realizado) o 'paid' (pago confirmado). */
  public function order(OrderInterface $order, string $event): void {
    $secret = (string) getenv('BALTO_N8N_SECRET');
    $url = (string) (getenv('BALTO_N8N_ORDER_URL') ?: 'http://n8n:5678/webhook/balto-pedido');
    if ($secret === '') {
      return;
    }
    try {
      $items = [];
      foreach ($order->getItems() as $item) {
        $items[] = ['title' => $item->label(), 'quantity' => (string) (int) $item->getQuantity(), 'total' => $item->getTotalPrice()->getNumber()];
      }
      $total = $order->getTotalPrice();
      $this->http->request('POST', $url, [
        'json' => [
          'event' => $event,
          'order_id' => (int) $order->id(),
          'order_number' => (string) ($order->getOrderNumber() ?: $order->id()),
          'email' => (string) $order->getEmail(),
          'total' => $total ? $total->getNumber() : '0',
          'currency' => $total ? $total->getCurrencyCode() : 'PEN',
          'payment_method' => $order->get('payment_gateway')->entity?->label() ?? '',
          'items' => $items,
        ],
        'headers' => ['X-Balto-Secret' => $secret],
        'timeout' => 3,
        'connect_timeout' => 2,
      ]);
    }
    catch (\Throwable $e) {
      // No se registra el cuerpo ni el secreto, solo el tipo de error.
      $this->loggerFactory->get('balto_automation')->warning('No se pudo avisar a n8n (@e) del pedido @n: @m', ['@e' => $event, '@n' => $order->id(), '@m' => get_class($e)]);
    }
  }

}
