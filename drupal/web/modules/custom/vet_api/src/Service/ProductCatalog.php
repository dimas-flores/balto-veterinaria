<?php

declare(strict_types=1);

namespace Drupal\vet_api\Service;

use Drupal\Component\Utility\Html;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\File\FileUrlGeneratorInterface;
use Drupal\Core\Pager\PagerManagerInterface;
use Drupal\commerce_product\Entity\ProductInterface;
use Drupal\commerce_product\Entity\ProductVariationInterface;
use Drupal\commerce_stock\StockServiceManagerInterface;
use Drupal\image\Entity\ImageStyle;

/** Proyección pública de productos reales; compartida por Twig y la futura API. */
final class ProductCatalog {

  public const SPECIES = ['perro' => 'Perro', 'gato' => 'Gato', 'otros' => 'Otros'];

  public const SORTS = ['' => 'Recomendados', 'precio_asc' => 'Menor precio', 'precio_desc' => 'Mayor precio', 'nombre' => 'Nombre (A–Z)'];

  private const PAGE_SIZE = 12;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly StockServiceManagerInterface $stockManager,
    private readonly FileUrlGeneratorInterface $fileUrlGenerator,
    private readonly PagerManagerInterface $pagerManager,
  ) {}

  public function categories(): array {
    $storage = $this->entityTypeManager->getStorage('taxonomy_term');
    $ids = $storage->getQuery()->condition('vid', 'categorias_productos')->accessCheck(TRUE)->sort('tid')->execute();
    $categories = [];
    foreach ($storage->loadMultiple($ids) as $term) {
      $categories[(string) $term->id()] = $term->label();
    }
    return $categories;
  }

  public function search(string $q, string $category, string $species, string $sort = '', bool $onlyAvailable = FALSE): array {
    $storage = $this->entityTypeManager->getStorage('commerce_product');
    $query = $storage->getQuery()->condition('type', 'vet_product')->condition('status', 1)
      ->condition('variations.entity.status', 1)->accessCheck(TRUE)->sort('product_id');
    if ($q !== '') {
      $group = $query->orConditionGroup()->condition('title', $q, 'CONTAINS')
        ->condition('variations.entity.sku', $q, 'CONTAINS');
      $query->condition($group);
    }
    if ($category !== '') {
      $query->condition('field_category.target_id', $category);
    }
    if ($species !== '') {
      $query->condition('field_species.value', $species);
    }
    // Las existencias salen del libro de Commerce Stock y no se pueden filtrar
    // en la consulta; con un catálogo de tienda pequeña se ordena y pagina aquí.
    $rows = [];
    $tags = ['commerce_product_list', 'commerce_product_variation_list', 'taxonomy_term_list', 'config:vet_api.business'];
    foreach ($storage->loadMultiple($query->execute()) as $product) {
      if ($product->access('view') && $product->getDefaultVariation()?->isPublished()) {
        $row = $this->present($product);
        $tags = array_merge($tags, $product->getCacheTags(), $product->getDefaultVariation()->getCacheTags());
        if (!$onlyAvailable || $row['available']) {
          $rows[] = $row;
        }
      }
    }
    usort($rows, match ($sort) {
      'precio_asc' => fn ($a, $b) => (float) $a['price_number'] <=> (float) $b['price_number'],
      'precio_desc' => fn ($a, $b) => (float) $b['price_number'] <=> (float) $a['price_number'],
      'nombre' => fn ($a, $b) => strcasecmp($a['name'], $b['name']),
      default => fn ($a, $b) => (int) $b['available'] <=> (int) $a['available'],
    });
    $total = count($rows);
    $page = $this->pagerManager->createPager($total, self::PAGE_SIZE)->getCurrentPage();
    $rows = array_slice($rows, $page * self::PAGE_SIZE, self::PAGE_SIZE);
    return ['products' => $rows, 'total' => $total, 'cache_tags' => array_unique($tags)];
  }

  /**
   * Productos de la misma categoría para "También te puede gustar".
   *
   * Primero los que tienen existencias; nunca incluye el producto actual.
   */
  public function related(ProductInterface $product, int $limit = 4): array {
    $category = $product->get('field_category')->target_id;
    $storage = $this->entityTypeManager->getStorage('commerce_product');
    $query = $storage->getQuery()->condition('type', 'vet_product')->condition('status', 1)
      ->condition('variations.entity.status', 1)->condition('product_id', $product->id(), '<>')
      ->accessCheck(TRUE)->sort('product_id');
    if ($category) {
      $query->condition('field_category.target_id', $category);
    }
    $rows = [];
    $tags = ['commerce_product_list', 'commerce_product_variation_list'];
    foreach ($storage->loadMultiple($query->range(0, 12)->execute()) as $candidate) {
      if ($candidate->access('view') && $candidate->getDefaultVariation()?->isPublished()) {
        $rows[] = $this->present($candidate);
        $tags = array_merge($tags, $candidate->getCacheTags(), $candidate->getDefaultVariation()->getCacheTags());
      }
    }
    usort($rows, fn ($a, $b) => (int) $b['available'] <=> (int) $a['available']);
    return ['products' => array_slice($rows, 0, $limit), 'cache_tags' => array_unique($tags)];
  }

  public function stock(ProductVariationInterface $variation): int {
    // Una sola tienda y un almacén: Commerce Stock calcula el saldo del libro
    // de movimientos. Nunca se usa el valor inicial del campo como saldo.
    return max(0, (int) floor((float) $this->stockManager->getStockLevel($variation)));
  }

  public function present(ProductInterface $product, ?ProductVariationInterface $variation = NULL): array {
    $variation ??= $product->getDefaultVariation();
    $price = $variation?->getPrice();
    $photo = $product->get('field_photo')->first();
    $photoUri = $photo?->entity?->getFileUri();
    $imageUrl = $photoUri ? $this->fileUrlGenerator->generateString($photoUri) : '';
    $cardStyle = $photoUri ? ImageStyle::load('balto_photo_card') : NULL;
    $photoWidth = (int) ($photo?->width ?? 0);
    $photoHeight = (int) ($photo?->height ?? 0);
    $cardImageUrl = $cardStyle ? $cardStyle->buildUrl($photoUri) : $imageUrl;
    $cardImageSrcset = '';
    if ($cardStyle && $photoWidth > 640 && ($largeStyle = ImageStyle::load('balto_photo_card_large'))) {
      $cardImageSrcset = $cardImageUrl . ' 640w, ' . $largeStyle->buildUrl($photoUri) . ' ' . min(960, $photoWidth) . 'w';
    }
    $category = $product->get('field_category')->entity;
    $species = [];
    foreach ($product->get('field_species')->getValue() as $item) {
      $species[$item['value']] = self::SPECIES[$item['value']] ?? $item['value'];
    }
    $stock = $variation ? $this->stock($variation) : 0;
    return [
      'id' => (string) $product->id(), 'name' => $product->label(),
      'sku' => $variation?->getSku() ?? '',
      'description' => trim(Html::decodeEntities(strip_tags($product->get('field_description')->value ?? ''))),
      'image_url' => $imageUrl,
      'card_image_url' => $cardImageUrl,
      'card_image_srcset' => $cardImageSrcset,
      'image_width' => $photoWidth ?: 720,
      'image_height' => $photoHeight ?: 660,
      'image_alt' => $photo?->alt ?? $product->label(),
      'price' => 'S/ ' . number_format((float) ($price?->getNumber() ?? '0'), 2, '.', ','),
      'price_number' => $price?->getNumber() ?? '0.00', 'currency' => $price?->getCurrencyCode() ?? 'PEN',
      'stock' => $stock, 'available' => $stock > 0 && $variation?->isPublished(),
      'category_id' => $category ? (string) $category->id() : '',
      'category' => $category?->label() ?? '', 'species' => $species,
      'url' => $product->toUrl()->toString(),
    ];
  }

}
