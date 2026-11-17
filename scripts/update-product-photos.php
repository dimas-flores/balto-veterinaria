<?php

/**
 * Sustituye las ilustraciones de los productos de ejemplo por fotos de stock.
 *
 * Fotos CC0 / dominio público (ver drupal/assets/product-photos/CREDITOS.json).
 * Solo reemplaza la ilustración original ({SKU}.png): si el negocio ya subió su
 * propia foto, no se toca. Es idempotente.
 */

use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;

$alts = [
  'BAL-ALI-001' => 'Croquetas secas para perro',
  'BAL-ALI-002' => 'Cachorros comiendo de un plato',
  'BAL-ALI-003' => 'Gatito junto a un plato de croquetas',
  'BAL-ALI-004' => 'Dos gatitos comiendo croquetas',
  'BAL-ALI-005' => 'Conejos sobre heno',
  'BAL-ACC-001' => 'Perro con collar ajustable',
  'BAL-ACC-002' => 'Gato con arnés rojo',
  'BAL-ACC-003' => 'Plato de acero inoxidable con croquetas',
  'BAL-HIG-001' => 'Perro durante un baño',
  'BAL-HIG-002' => 'Gatito dentro de un arenero',
  'BAL-HIG-003' => 'Perro de pelo largo durante el cepillado',
  'BAL-JUG-001' => 'Perro corriendo hacia una pelota',
  'BAL-JUG-002' => 'Gatito jugando con una caña de juguete',
  'BAL-SAL-001' => 'Rollos de gasa y venda',
  'BAL-SAL-002' => 'Perro descansando con collar isabelino',
];

$directory = 'public://products';
\Drupal::service('file_system')->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY);
$variations = \Drupal::entityTypeManager()->getStorage('commerce_product_variation');
$updated = 0;
foreach ($alts as $sku => $alt) {
  $source = '/opt/balto/assets/product-photos/' . $sku . '.jpg';
  $found = $variations->loadByProperties(['sku' => $sku]);
  $product = $found ? reset($found)->getProduct() : NULL;
  if (!$product || !is_file($source)) {
    continue;
  }
  $current = $product->get('field_photo')->entity;
  if ($current && basename($current->getFileUri()) !== $sku . '.png') {
    // Ya tiene una foto distinta de la ilustración original.
    continue;
  }
  $file = \Drupal::service('file.repository')->writeData(file_get_contents($source), $directory . '/' . $sku . '-foto.jpg', FileExists::Replace);
  $file->setPermanent();
  $file->save();
  $product->set('field_photo', ['target_id' => $file->id(), 'alt' => $alt . ' (foto referencial)']);
  $product->save();
  $updated++;
}
echo "Fotos de productos actualizadas: {$updated}.\n";
