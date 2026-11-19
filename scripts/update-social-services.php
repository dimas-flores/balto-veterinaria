<?php

/**
 * Datos que BALTO publica en sus redes (Facebook, 2026): segundo teléfono,
 * Instagram, TikTok y los servicios de peluquería y desparasitación.
 *
 * Migración única: solo completa campos vacíos y crea servicios que no
 * existen, así conserva lo que el personal edite desde la administración.
 */
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\node\Entity\Node;

if (\Drupal::state()->get('balto.social_services.v1')) {
  return;
}
$config = \Drupal::configFactory()->getEditable('vet_api.business');
foreach (['phone_secondary' => '982 183 032', 'instagram_user' => 'vet_balto', 'tiktok_name' => 'Veterinaria Balto Juliaca'] as $key => $value) {
  if (trim((string) $config->get($key)) === '') {
    $config->set($key, $value);
  }
}
$config->save();

$storage = FieldStorageConfig::loadByName('node', 'field_service_icon');
if ($storage) {
  $allowed = $storage->getSetting('allowed_values');
  $allowed += ['grooming' => 'Peluquería', 'deworming' => 'Desparasitación'];
  $storage->setSetting('allowed_values', $allowed)->save();
}

$services = [
  ['Peluquería y spa', 'grooming', 'Baño y baño médico, secado, corte y cepillado, corte de uñas y limpieza de oídos. Consulta los turnos por WhatsApp.'],
  ['Desparasitación', 'deworming', 'Desparasitación para proteger a tu mascota y a tu familia de lombrices, pulgas y garrapatas.'],
];
$nodes = \Drupal::entityTypeManager()->getStorage('node');
foreach ($services as [$title, $icon, $description]) {
  if ($nodes->loadByProperties(['type' => 'servicio', 'title' => $title])) {
    continue;
  }
  Node::create(['type' => 'servicio', 'langcode' => 'es', 'uid' => 1, 'title' => $title, 'status' => 1])
    ->set('body', ['value' => $description, 'format' => 'plain_text'])
    ->set('field_service_icon', $icon)->save();
}
\Drupal::state()->set('balto.social_services.v1', TRUE);
echo "Contactos de redes y servicios de peluquería y desparasitación incorporados.\n";
