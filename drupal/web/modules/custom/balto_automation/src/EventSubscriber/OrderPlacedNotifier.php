<?php

declare(strict_types=1);

namespace Drupal\balto_automation\EventSubscriber;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\state_machine\Event\WorkflowTransitionEvent;
use GuzzleHttp\ClientInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/** Envía a n8n un resumen del pedido recién realizado. Un fallo nunca interrumpe la compra. */
final class OrderPlacedNotifier implements EventSubscriberInterface {
  public function __construct(
    private readonly ClientInterface $http,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  public static function getSubscribedEvents(): array {
    return ['commerce_order.place.post_transition' => 'onPlaced'];
  }

  public function onPlaced(WorkflowTransitionEvent $event): void {
    $secret = (string) getenv('BALTO_N8N_SECRET');
    $url = (string) (getenv('BALTO_N8N_ORDER_URL') ?: 'http://n8n:5678/webhook/balto-pedido');
    if ($secret === '') {
      return;
    }
    try {
      $order = $event->getEntity();
      $items = [];
      foreach ($order->getItems() as $item) {
        $items[] = ['title' => $item->label(), 'quantity' => (string) (int) $item->getQuantity(), 'total' => $item->getTotalPrice()->getNumber()];
      }
      $total = $order->getTotalPrice();
      $payload = [
        'order_id' => (int) $order->id(),
        'order_number' => (string) ($order->getOrderNumber() ?: $order->id()),
        'email' => (string) $order->getEmail(),
        'total' => $total ? $total->getNumber() : '0',
        'currency' => $total ? $total->getCurrencyCode() : 'PEN',
        'payment_method' => $order->get('payment_gateway')->entity?->label() ?? '',
        'items' => $items,
      ];
      $this->http->request('POST', $url, [
        'json' => $payload,
        'headers' => ['X-Balto-Secret' => $secret],
        'timeout' => 3,
        'connect_timeout' => 2,
      ]);
    }
    catch (\Throwable $e) {
      // No se registra el cuerpo ni el secreto, solo el tipo de error.
      $this->loggerFactory->get('balto_automation')->warning('No se pudo avisar a n8n del pedido: @m', ['@m' => get_class($e)]);
    }
  }

}
