<?php

declare(strict_types=1);

namespace Drupal\balto_payments\Plugin\Commerce\PaymentGateway;

use Drupal\balto_payments\PluginForm\MercadoPagoTestForm;
use Drupal\commerce_order\Entity\OrderInterface;
use Drupal\commerce_payment\Attribute\CommercePaymentGateway;
use Drupal\commerce_payment\Exception\PaymentGatewayException;
use Drupal\commerce_payment\Plugin\Commerce\PaymentGateway\OffsitePaymentGatewayBase;
use Drupal\commerce_price\Price;
use Drupal\Core\StringTranslation\TranslatableMarkup;
use Symfony\Component\HttpFoundation\Request;

#[CommercePaymentGateway(
  id: 'balto_mercado_pago_test',
  label: new TranslatableMarkup('Mercado Pago Checkout Pro de prueba'),
  display_label: new TranslatableMarkup('Tarjeta (simulado)'),
  modes: ['test' => new TranslatableMarkup('Prueba')],
  forms: ['offsite-payment' => MercadoPagoTestForm::class],
  requires_billing_information: FALSE,
)]
final class MercadoPagoTest extends OffsitePaymentGatewayBase {

  public static function api(string $method, string $path, array $payload = []): array {
    $token = getenv('BALTO_MERCADO_PAGO_TEST_TOKEN');
    if (!$token) {
      throw new PaymentGatewayException('Mercado Pago de prueba no está configurado.');
    }
    $options = [
      'headers' => ['Authorization' => 'Bearer ' . $token],
      'timeout' => 8,
      'allow_redirects' => FALSE,
    ];
    if ($payload) {
      $options['json'] = $payload;
    }
    try {
      $response = \Drupal::httpClient()->request($method, 'https://api.mercadopago.com' . $path, $options);
      $data = json_decode((string) $response->getBody(), TRUE, 32, JSON_THROW_ON_ERROR);
      if (is_array($data)) {
        return $data;
      }
    }
    catch (\Exception) {
      // Avoid logging the request containing the credential.
    }
    throw new PaymentGatewayException('No se pudo verificar la operación con Mercado Pago.');
  }

  public function onReturn(OrderInterface $order, Request $request) {
    $id = (string) $request->query->get('payment_id', '');
    if (!preg_match('/^[1-9][0-9]{0,19}$/D', $id)) {
      throw new PaymentGatewayException('Mercado Pago todavía no confirmó el pago.');
    }
    $remote = self::api('GET', '/v1/payments/' . $id);
    $total = $order->getTotalPrice();
    $amount = $remote['transaction_amount'] ?? NULL;
    $reference = $order->getData('balto_mp_test_reference');
    if (!$total || !$reference || ($remote['external_reference'] ?? NULL) !== $reference
        || ($remote['live_mode'] ?? NULL) !== FALSE || ($remote['status'] ?? NULL) !== 'approved'
        || (string) ($remote['id'] ?? '') !== $id || ($remote['currency_id'] ?? NULL) !== $total->getCurrencyCode()
        || !is_numeric($amount) || !$total->equals(new Price((string) $amount, $total->getCurrencyCode()))) {
      throw new PaymentGatewayException('El pago de prueba no se pudo confirmar para este pedido.');
    }

    $lock = \Drupal::lock();
    $name = 'balto_mp_test_' . $order->id();
    if (!$lock->acquire($name)) {
      throw new PaymentGatewayException('El pago se está verificando. Inténtalo nuevamente.');
    }
    try {
      $storage = $this->entityTypeManager->getStorage('commerce_payment');
      $payments = $storage->loadByProperties([
        'order_id' => $order->id(),
        'payment_gateway' => $this->parentEntity->id(),
        'state' => 'completed',
      ]);
      if (!$payments) {
        $storage->create([
          'order_id' => $order->id(),
          'payment_gateway' => $this->parentEntity->id(),
          'payment_gateway_mode' => 'test',
          'test' => TRUE,
          'remote_id' => $id,
          'state' => 'completed',
          'amount' => $total,
        ])->save();
      }
    }
    finally {
      $lock->release($name);
    }
  }

}
