<?php

/** Checkout de demostración y usuarios de prueba con privilegios delimitados. */
use Drupal\commerce_checkout\Entity\CheckoutFlow;
use Drupal\commerce_payment\Entity\PaymentGateway;
use Drupal\user\Entity\Role;
use Drupal\user\Entity\User;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\Core\Field\Entity\BaseFieldOverride;

if (!BaseFieldOverride::load('commerce_product_variation.vet_variation.price')) {
  $base_fields = \Drupal::service('entity_field.manager')->getBaseFieldDefinitions('commerce_product_variation');
  BaseFieldOverride::createFromBaseFieldDefinition($base_fields['price'], 'vet_variation')
    ->setSetting('available_currencies', ['PEN'])->setSetting('allow_negative', FALSE)->save();
}

// Commerce necesita modos de presentación para el tipo de variación propio.
// Sin ellos el resumen podría mostrar cantidad/precio sin el nombre.
foreach (['cart', 'summary'] as $mode) {
  if (!\Drupal::state()->get('balto.phase4.variation_displays.v1')) {
    $display = EntityViewDisplay::load('commerce_product_variation.vet_variation.' . $mode) ?? EntityViewDisplay::create([
      'targetEntityType' => 'commerce_product_variation', 'bundle' => 'vet_variation',
      'mode' => $mode, 'status' => TRUE,
    ]);
    foreach (array_keys(\Drupal::service('entity_field.manager')->getFieldDefinitions('commerce_product_variation', 'vet_variation')) as $field) {
      if ($field !== 'product_id') {
        $display->removeComponent($field);
      }
    }
    $display->setComponent('product_id', ['type' => 'entity_reference_label', 'label' => 'hidden', 'settings' => ['link' => TRUE]])->save();
  }
}
\Drupal::state()->set('balto.phase4.variation_displays.v1', TRUE);

// Aplicar también a instalaciones con pedidos y cuentas existentes.
if (!Role::load('recepcion_tienda')) {
  Role::create([
    'id' => 'recepcion_tienda',
    'label' => 'Recepción de tienda',
    'is_admin' => FALSE,
    'permissions' => [
      'access administration pages', 'access navigation', 'view the administration theme',
      'access commerce administration pages', 'access commerce_product overview',
      'update any vet_product commerce_product', 'manage vet_variation commerce_product_variation',
      'view commerce_store', 'access commerce_order overview', 'view commerce_order',
      'view default commerce_order',
    ],
  ])->save();
}

if (\Drupal::state()->get('balto.seed.phase4.v1')) {
  echo "El checkout y los roles ya existen; se conservan pedidos y cuentas.\n";
  return;
}

$label = 'Pago simulado – No se realiza ningún cobro real';
if (!PaymentGateway::load('pago_simulado')) {
  PaymentGateway::create([
    'id' => 'pago_simulado', 'label' => $label, 'status' => TRUE, 'weight' => 0,
    'plugin' => 'vet_simulated_manual',
    'configuration' => ['display_label' => $label, 'mode' => 'n/a', 'collect_billing_information' => FALSE,
      'instructions' => ['value' => 'Pago ficticio registrado para la demostración académica. No se realizó ningún cobro ni transferencia. Coordina cualquier consulta real por WhatsApp.', 'format' => 'plain_text']],
    'conditions' => [], 'conditionOperator' => 'AND',
  ])->save();
}
$flow = CheckoutFlow::load('default');
$flow->setPluginId('vet_checkout');
$flow->set('label', 'Compra de demostración BALTO');
$flow->getPlugin()->setConfiguration([
  'display_checkout_progress' => TRUE, 'display_checkout_progress_breadcrumb_links' => FALSE,
  'display_sidebar_checkout_complete' => TRUE,
  'guest_order_assign' => FALSE, 'guest_new_account' => FALSE, 'guest_new_account_notify' => FALSE,
  'panes' => [
    'login' => ['step' => '_disabled', 'allow_guest_checkout' => TRUE, 'allow_registration' => FALSE, 'weight' => 0],
    'vet_customer' => ['step' => 'order_information', 'weight' => 0],
    'contact_information' => ['step' => 'order_information', 'weight' => 1, 'double_entry' => FALSE, 'always_display' => TRUE],
    'billing_information' => ['step' => '_disabled', 'weight' => 2],
    'payment_information' => ['step' => 'order_information', 'weight' => 3, 'always_display' => TRUE, 'require_payment_method' => FALSE],
    'review' => ['step' => 'review', 'weight' => 4],
    'payment_process' => ['step' => 'payment', 'weight' => 5, 'capture' => TRUE],
    'completion_message' => ['step' => 'complete', 'weight' => 6, 'display_pane_summaries' => TRUE,
      'message' => ['value' => "¡Pedido de demostración registrado!\nTu número de pedido es [commerce_order:order_number].\nPago simulado – No se realiza ningún cobro real.\nCoordina cualquier consulta real o retiro en tienda por WhatsApp.", 'format' => 'plain_text']],
    'order_summary' => ['step' => '_sidebar', 'weight' => 7, 'view' => 'commerce_checkout_order_summary'],
  ],
]);
$flow->save();
// Registro para revisión: se puede validar o cancelar desde administración.
// Los recibos por correo quedan desactivados en esta demo sin SMTP.
\Drupal::configFactory()->getEditable('commerce_order.commerce_order_type.default')
  ->set('workflow', 'order_default_validation')->set('sendReceipt', FALSE)->save();

$roles = [
  'administrador_tienda' => ['label' => 'Administrador de tienda', 'permissions' => [
    'access content', 'access navigation', 'access administration pages', 'view the administration theme',
    'access commerce administration pages', 'access commerce_product overview',
    'create vet_product commerce_product', 'update any vet_product commerce_product',
    'view commerce_product', 'view own unpublished commerce_product', 'manage vet_variation commerce_product_variation',
    'view commerce_store', 'access commerce_order overview', 'view commerce_order',
    'view default commerce_order', 'update default commerce_order', 'administer commerce_payment',
    'administer balto business', 'access checkout', 'view own commerce_order',
  ]],
  'cliente' => ['label' => 'Cliente', 'permissions' => ['access content', 'view commerce_product', 'access checkout', 'view own commerce_order']],
];
$available = \Drupal::service('user.permissions')->getPermissions();
foreach ($roles as $id => $definition) {
  foreach ($definition['permissions'] as $permission) {
    if (!isset($available[$permission])) {
      throw new RuntimeException('Permiso no disponible en esta versión: ' . $permission);
    }
  }
  $role = Role::load($id) ?? Role::create(['id' => $id, 'label' => $definition['label'], 'is_admin' => FALSE]);
  foreach ($definition['permissions'] as $permission) {
    $role->grantPermission($permission);
  }
  $role->save();
}
foreach ([
  ['DRUPAL_STORE_MANAGER_USER', 'DRUPAL_STORE_MANAGER_PASSWORD', 'tienda@example.invalid', 'administrador_tienda'],
  ['DRUPAL_CLIENT_USER', 'DRUPAL_CLIENT_PASSWORD', 'cliente@example.invalid', 'cliente'],
] as [$user_key, $password_key, $email, $role]) {
  $name = getenv($user_key);
  $password = getenv($password_key);
  if (!$name || !$password || $password === 'CAMBIAR') {
    throw new RuntimeException('Genera las credenciales de prueba con python3 scripts/init-env.py.');
  }
  $existing = \Drupal::entityTypeManager()->getStorage('user')->loadByProperties(['name' => $name]);
  if ($existing) {
    $account = reset($existing);
    if ($account->getEmail() !== $email || !$account->hasRole($role)) {
      throw new RuntimeException('Ya existe una cuenta distinta con el nombre ' . $name . '. Usa otro nombre de prueba en .env.');
    }
    continue;
  }
  User::create(['name' => $name, 'mail' => $email, 'pass' => $password, 'status' => 1, 'roles' => [$role], 'preferred_langcode' => 'es', 'langcode' => 'es'])->save();
}
\Drupal::state()->set('balto.seed.phase4.v1', TRUE);
echo "Fase 4: checkout, pago local simulado y cuentas de tienda/cliente configurados.\n";
