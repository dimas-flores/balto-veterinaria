<?php

declare(strict_types=1);

namespace Drupal\vet_api\Service;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;

/** Fuente compartida para Twig y los futuros endpoints del chatbot. */
final class BusinessData {

  public function __construct(
    private readonly ConfigFactoryInterface $configFactory,
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {}

  public function getBusiness(): array {
    $data = $this->configFactory->get('vet_api.business')->getRawData();
    // Lista explícita: nunca se filtran claves privadas ni configuración interna.
    $public = array_intersect_key($data, array_flip([
      'name', 'slogan', 'city', 'currency', 'addresses', 'whatsapp',
      'whatsapp_url', 'phone_secondary', 'instagram_user', 'tiktok_name', 'facebook_name', 'facebook_url', 'email',
      'hospitalization', 'consultation_schedule', 'payment_methods', 'yape_number', 'service_pricing_note', 'schedule_is_example',
      'catalog_is_example', 'about_title', 'about_text',
    ]));
    $public['appointment_url'] = ($public['whatsapp_url'] ?? 'https://wa.me/51986866036')
      . '?text=' . rawurlencode('Hola, BALTO Veterinaria. Quisiera separar una cita para mi mascota.');
    $public['phone_url'] = 'tel:+51' . preg_replace('/\D/', '', $public['whatsapp'] ?? '');
    $second = preg_replace('/\D/', '', $public['phone_secondary'] ?? '');
    $public['phone_secondary_url'] = preg_match('/^9\d{8}$/', $second) ? 'tel:+51' . $second : '';
    $instagram = (string) ($public['instagram_user'] ?? '');
    $public['instagram_url'] = preg_match('/^[A-Za-z0-9._]{1,30}$/', $instagram) ? 'https://www.instagram.com/' . strtolower($instagram) . '/' : '';
    $public['map_url'] = 'https://maps.google.com/maps?q=' . rawurlencode(($public['addresses'][0] ?? '') . ', Juliaca, Puno, Perú') . '&output=embed';
    $public['maps_link'] = 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode(($public['addresses'][0] ?? '') . ', Juliaca, Puno, Perú');
    // CID identifica la ficha concreta y evita geocodificar una dirección ambigua.
    $cid = (string) ($data['maps_cid'] ?? '');
    if (preg_match('/^[0-9]{1,22}$/', $cid)) {
      $public['map_url'] = 'https://maps.google.com/maps?cid=' . $cid . '&output=embed';
      $public['maps_link'] = 'https://www.google.com/maps?cid=' . $cid;
    }
    return $public;
  }

  /** Solo servicios publicados accesibles para la persona que visita el sitio. */
  public function getServices(): array {
    $storage = $this->entityTypeManager->getStorage('node');
    $ids = $storage->getQuery()->condition('type', 'servicio')->condition('status', 1)
      ->accessCheck(TRUE)->sort('nid')->execute();
    $result = [];
    foreach ($storage->loadMultiple($ids) as $node) {
      if (!$node->access('view')) {
        continue;
      }
      $result[] = [
        'title' => $node->label(),
        'description' => trim(strip_tags($node->get('body')->value ?? '')),
        'icon' => $node->hasField('field_service_icon') ? ($node->get('field_service_icon')->value ?: 'stethoscope') : 'stethoscope',
        'url' => $node->toUrl()->toString(),
      ];
    }
    return $result;
  }

}
