<?php

declare(strict_types=1);

namespace Drupal\balto_automation\EventSubscriber;

use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use Drupal\state_machine\Event\WorkflowTransitionEvent;
use GuzzleHttp\ClientInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/** Envía la confirmación de recepción de un pedido por Brevo. */
final class OrderConfirmationMailer implements EventSubscriberInterface {

  public function __construct(
    private readonly ClientInterface $http,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  public static function getSubscribedEvents(): array {
    return ['commerce_order.place.post_transition' => 'onPlaced'];
  }

  public function onPlaced(WorkflowTransitionEvent $event): void {
    $key = trim((string) getenv('BALTO_BREVO_API_KEY'));
    $sender = trim((string) getenv('BALTO_BREVO_SENDER_EMAIL'));
    if ($key === '' || !filter_var($sender, FILTER_VALIDATE_EMAIL)) {
      return;
    }

    $order = $event->getEntity();
    $recipient = $order->getEmail();
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
      return;
    }

    try {
      $number = $order->getOrderNumber() ?: $order->id();
      $lines = [
        "Hola, recibimos tu pedido #{$number} en BALTO Veterinaria.",
        '',
        'Productos',
      ];
      foreach ($order->getItems() as $item) {
        $quantity = $item->getQuantity();
        if (str_contains($quantity, '.')) {
          $quantity = rtrim(rtrim($quantity, '0'), '.');
        }
        $lines[] = "- {$item->label()} × {$quantity}";
      }
      $total = $order->getTotalPrice();
      if ($total) {
        $amount = number_format((float) $total->getNumber(), 2, '.', '');
        $lines[] = "Total del pedido: {$total->getCurrencyCode()} {$amount}";
      }
      $lines[] = '';
      $lines[] = 'Te contactaremos si necesitamos coordinar la entrega o el recojo.';

      $this->http->request('POST', 'https://api.brevo.com/v3/smtp/email', [
        'headers' => ['api-key' => $key],
        'json' => [
          'sender' => ['email' => $sender, 'name' => 'BALTO Veterinaria'],
          'to' => [['email' => $recipient]],
          'subject' => "Recibimos tu pedido #{$number} | BALTO Veterinaria",
          'textContent' => implode("\n", $lines),
        ],
        'connect_timeout' => 2,
        'timeout' => 3,
        'allow_redirects' => FALSE,
      ]);
    }
    catch (\Throwable $exception) {
      $this->loggerFactory->get('balto_automation')->warning(
        'No se pudo enviar la confirmación del pedido @id por Brevo (@type).',
        ['@id' => $order->id(), '@type' => get_class($exception)],
      );
    }
  }

}
