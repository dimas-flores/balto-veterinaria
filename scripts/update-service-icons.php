<?php

/**
 * Un ícono propio por servicio: antes curaciones, vacunación y oftalmología
 * compartían el estetoscopio, y las dos cirugías las tijeras.
 *
 * Migración única: agrega las opciones al campo y solo cambia los servicios
 * que todavía tienen el ícono genérico anterior, así respeta lo que el
 * personal haya elegido después desde la administración.
 */
use Drupal\field\Entity\FieldStorageConfig;

if (\Drupal::state()->get('balto.service_icons.v1')) {
  return;
}
$storage = FieldStorageConfig::loadByName('node', 'field_service_icon');
if (!$storage) {
  return;
}
$allowed = $storage->getSetting('allowed_values');
$allowed += [
  'bandage' => 'Curaciones',
  'vaccine' => 'Vacunación',
  'eye' => 'Oftalmología',
  'bone' => 'Traumatología',
];
$storage->setSetting('allowed_values', $allowed)->save();

$changes = [
  'Curaciones y tratamientos' => ['stethoscope', 'bandage'],
  'Vacunación' => ['stethoscope', 'vaccine'],
  'Oftalmología' => ['stethoscope', 'eye'],
  'Cirugías traumatológicas' => ['surgery', 'bone'],
];
$nodes = \Drupal::entityTypeManager()->getStorage('node');
foreach ($changes as $title => [$previous, $icon]) {
  foreach ($nodes->loadByProperties(['type' => 'servicio', 'title' => $title]) as $node) {
    if ($node->get('field_service_icon')->value === $previous) {
      $node->set('field_service_icon', $icon)->save();
    }
  }
}
\Drupal::state()->set('balto.service_icons.v1', TRUE);
echo "Íconos propios asignados a los servicios.\n";
