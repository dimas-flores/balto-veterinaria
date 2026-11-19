<?php

declare(strict_types=1);

namespace Drupal\balto_payments\EventSubscriber;

use Drupal\balto_payments\Service\CulqiOrders;
use Drupal\commerce_payment\Event\FilterPaymentGatewaysEvent;
use Drupal\commerce_payment\Event\PaymentEvents;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/** No ofrecer al cliente un medio sin credenciales válidas o fuera de rango. */
final class GatewayAvailability implements EventSubscriberInterface {
  public function __construct(private readonly CulqiOrders $orders) {}

  public static function getSubscribedEvents(): array {
    return [PaymentEvents::FILTER_PAYMENT_GATEWAYS => 'filter'];
  }

  public function filter(FilterPaymentGatewaysEvent $event): void {
    $gateways = $event->getPaymentGateways();
    foreach ($gateways as $id => $gateway) {
      if ($gateway->getPluginId() === 'balto_mercado_pago_test' && (!getenv('BALTO_MERCADO_PAGO_TEST_TOKEN') || !getenv('BALTO_MERCADO_PAGO_TEST_BUYER_ID'))) {
        unset($gateways[$id]);
      }
      if ($gateway->getPluginId() !== 'balto_culqi_orders') {
        continue;
      }
      try {
        $this->orders->credentials($gateway->getPlugin()->getMode());
        $total = $event->getOrder()->getTotalPrice();
        if (!$total || $total->getCurrencyCode() !== 'PEN' || CulqiOrders::cents($total->getNumber()) < 600) {
          unset($gateways[$id]);
        }
      }
      catch (\Throwable) {
        unset($gateways[$id]);
      }
    }
    $event->setPaymentGateways($gateways);
  }
}
