<?php

declare(strict_types=1);

namespace Drupal\balto_payments\PluginForm;

use Drupal\balto_payments\Service\MercadoPagoClient;
use Drupal\commerce_payment\Exception\PaymentGatewayException;
use Drupal\commerce_payment\PluginForm\PaymentOffsiteForm;
use Drupal\Core\Form\FormStateInterface;
use Drupal\vet_api\Response\OffsitePaymentRedirect;

final class MercadoPagoTestForm extends PaymentOffsiteForm {

  public function buildConfigurationForm(array $form, FormStateInterface $form_state) {
    $form = parent::buildConfigurationForm($form, $form_state);
    $order = $this->entity->getOrder();
    $total = $order->getTotalPrice();
    if (!$total || $total->getCurrencyCode() !== 'PEN') {
      throw new PaymentGatewayException('El pago de prueba requiere un total en soles.');
    }
    $client = \Drupal::service('balto_payments.mercado_pago');
    $client->testSellerId();
    $preference = $client->api('POST', '/checkout/preferences', [
      'items' => [[
        'title' => 'BALTO · Pedido de prueba',
        'quantity' => 1,
        'currency_id' => 'PEN',
        'unit_price' => (float) $total->getNumber(),
      ]],
      'external_reference' => MercadoPagoClient::reference($order),
      'back_urls' => [
        'success' => $form['#return_url'],
        'failure' => $form['#cancel_url'],
        'pending' => $form['#return_url'],
      ],
      'payment_methods' => ['excluded_payment_types' => [['id' => 'ticket'], ['id' => 'bank_transfer'], ['id' => 'atm']]],
    ]);
    $url = (string) ($preference['init_point'] ?? '');
    if (parse_url($url, PHP_URL_SCHEME) !== 'https'
        || parse_url($url, PHP_URL_HOST) !== 'www.mercadopago.com.pe') {
      throw new PaymentGatewayException('Mercado Pago no devolvió un enlace de pruebas válido.');
    }
    throw new OffsitePaymentRedirect($url);
  }

}
