<?php

/** Prepara la pasarela desactivada. No crea cuentas ni transacciones remotas. */
use Drupal\commerce_payment\Entity\PaymentGateway;

$id = 'culqi_automatico';
if (!PaymentGateway::load($id)) {
  PaymentGateway::create([
    'id' => $id, 'label' => 'Culqi automático — configurar antes de activar',
    'status' => FALSE, 'weight' => -30, 'plugin' => 'balto_culqi_orders',
    'configuration' => ['mode' => 'test', 'display_label' => 'Yape / Plin por QR o banca móvil — Culqi', 'collect_billing_information' => FALSE],
    'conditions' => [], 'conditionOperator' => 'AND',
  ])->save();
}
echo "Pasarela Culqi preparada en pruebas. Sigue desactivada hasta configurar credenciales.\n";

if (getenv('BALTO_MERCADO_PAGO_TEST_TOKEN')) {
  $test_id = 'mercado_pago_test';
  if (!PaymentGateway::load($test_id)) {
    PaymentGateway::create([
      'id' => $test_id,
      'label' => 'Mercado Pago Checkout Pro de prueba',
      'plugin' => 'balto_mercado_pago_test',
      'status' => TRUE,
      'weight' => 0,
      'configuration' => ['mode' => 'test', 'display_label' => 'Tarjeta (simulado)', 'collect_billing_information' => FALSE],
      'conditions' => [],
      'conditionOperator' => 'AND',
    ])->save();
  }
  $manual_demo = PaymentGateway::load('pago_simulado');
  if ($manual_demo && $manual_demo->status()) {
    $manual_demo->disable()->save();
  }
}
