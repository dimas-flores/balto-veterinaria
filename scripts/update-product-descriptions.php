<?php

/** Actualiza únicamente las descripciones originales del catálogo inicial. */
$previous = json_decode(file_get_contents(__DIR__ . '/data/previous-product-descriptions.json'), TRUE, 512, JSON_THROW_ON_ERROR);
$products = json_decode(file_get_contents(__DIR__ . '/data/products.json'), TRUE, 512, JSON_THROW_ON_ERROR);
$variations = \Drupal::entityTypeManager()->getStorage('commerce_product_variation');

foreach ($products as $entry) {
  $sku = $entry['sku'];
  $matches = $variations->loadByProperties(['sku' => $sku]);
  $product = $matches ? reset($matches)->getProduct() : NULL;
  $description = $product?->get('field_description')->first();
  if ($description && isset($previous[$sku]) && $description->value === $previous[$sku]) {
    $description->value = $entry['description'];
    $product->save();
  }
}
