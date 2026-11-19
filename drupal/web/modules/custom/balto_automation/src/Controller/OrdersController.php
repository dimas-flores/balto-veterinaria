<?php

declare(strict_types=1);

namespace Drupal\balto_automation\Controller;

use Drupal\commerce_payment\Plugin\Commerce\PaymentGateway\ManualPaymentGatewayInterface;
use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;

/** Últimos pedidos para el bot del dueño. Protegido con el secreto compartido de n8n. */
final class OrdersController extends ControllerBase {

  public function latest(Request $request): JsonResponse {
    if (!$this->hasSharedSecret($request)) {
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

  public function confirmPayment(Request $request, string $order_id): JsonResponse {
    if (!$this->hasSharedSecret($request)) {
      return new JsonResponse(['error' => 'unauthorized'], 403);
    }

    $lock = \Drupal::lock();
    $lock_name = 'balto_automation.confirm_payment.' . $order_id;
    if (!$lock->acquire($lock_name)) {
      return new JsonResponse(['error' => 'busy'], 409);
    }

    try {
      $order = $this->entityTypeManager()->getStorage('commerce_order')->loadUnchanged($order_id);
      if (!$order || !$order->getPlacedTime() || in_array($order->getState()->getId(), ['draft', 'canceled'], TRUE)
          || $order->get('payment_gateway')->target_id !== 'yape_coordinado') {
        return new JsonResponse(['error' => 'ineligible'], 409);
      }

      $result = ['order_number' => (string) ($order->getOrderNumber() ?: $order->id())];
      if ($order->isPaid()) {
        return new JsonResponse($result + ['status' => 'already_paid']);
      }

      $pending = $this->entityTypeManager()->getStorage('commerce_payment')->loadByProperties([
        'order_id' => $order_id,
        'payment_gateway' => 'yape_coordinado',
        'state' => 'pending',
      ]);
      $payment = count($pending) === 1 ? reset($pending) : NULL;
      $gateway = $payment?->getPaymentGateway()?->getPlugin();
      $balance = $order->getBalance();
      if (!$gateway instanceof ManualPaymentGatewayInterface || !$balance
          || $payment->getAmount()->getCurrencyCode() !== $balance->getCurrencyCode()
          || !$payment->getAmount()->equals($balance)) {
        return new JsonResponse(['error' => 'payment_needs_review'], 409);
      }

      $gateway->receivePayment($payment);
      return new JsonResponse($result + ['status' => 'confirmed']);
    }
    finally {
      $lock->release($lock_name);
    }
  }

  private function hasSharedSecret(Request $request): bool {
    $secret = (string) getenv('BALTO_N8N_SECRET');
    return $secret !== '' && hash_equals($secret, (string) $request->headers->get('X-Balto-Secret', ''));
  }

}
