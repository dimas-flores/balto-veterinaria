<?php

/** Recupera un pago de prueba aprobado usando el identificador interno del pedido. */
use Drupal\commerce\Response\NeedsRedirectException;
use Symfony\Component\HttpFoundation\Request;

$id = $extra[0] ?? '';
if (!preg_match('/^[1-9][0-9]*$/D', $id)) {
  throw new InvalidArgumentException('Indica el ID interno del pedido de prueba.');
}
$storage = \Drupal::entityTypeManager()->getStorage('commerce_order');
$order = $storage->loadForUpdate($id);
try {
  if (!$order || $order->get('payment_gateway')->target_id !== 'mercado_pago_test') {
    throw new RuntimeException('El pedido no usa Mercado Pago de prueba.');
  }
  if ($order->getState()->getId() === 'canceled') {
    throw new RuntimeException('El pedido está cancelado.');
  }
  if (!$order->isPaid()) {
    $order->get('payment_gateway')->entity->getPlugin()->onReturn($order, new Request());
    \Drupal::service('commerce_payment.order_updater')->updateOrders();
    $order = $storage->loadUnchanged($id);
  }
  if (!$order->isPaid()) {
    throw new RuntimeException('El pago todavía no figura completado.');
  }
  if ($order->getState()->getId() === 'draft') {
    $flow = \Drupal::service('commerce_checkout.checkout_order_manager')->getCheckoutFlow($order)->getPlugin();
    try {
      $flow->redirectToStep('complete');
    }
    catch (NeedsRedirectException) {
      // El checkout ya guardó la transición. Drush no necesita redireccionar.
    }
  }
  echo 'Pedido #' . $order->getOrderNumber() . ' verificado y pagado.' . PHP_EOL;
}
finally {
  $storage->releaseLock($id);
}
