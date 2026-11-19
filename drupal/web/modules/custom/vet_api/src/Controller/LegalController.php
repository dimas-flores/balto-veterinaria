<?php

declare(strict_types=1);

namespace Drupal\vet_api\Controller;

use Drupal\Core\Controller\ControllerBase;

/** Información de privacidad y compras de BALTO. */
final class LegalController extends ControllerBase {

  public function privacy(): array {
    $config = $this->config('vet_api.business');
    return $this->legalPage('privacy_policy', [
      'Datos que solicita la tienda' => 'Al hacer un pedido, BALTO solicita tu nombre, celular y correo electrónico.',
      'Para qué usamos tus datos' => 'Usamos estos datos para gestionar tu pedido, coordinar su retiro y responder consultas relacionadas con tu compra.',
      'Chat y WhatsApp' => 'Puedes usar el chat para consultar productos, precios, horarios y servicios. Evita compartir datos personales en el chat. Si eliges contactarnos por WhatsApp, la conversación continúa en ese servicio.',
      'Consultas sobre tus datos' => sprintf(
        'Para consultar sobre el uso de tus datos, pedir una corrección o ejercer tus derechos, comunícate con %s al %s o acércate a %s.',
        $config->get('name'),
        $config->get('whatsapp'),
        $config->get('addresses.0'),
      ),
    ], $config->get('privacy_policy'));
  }

  public function purchaseTerms(): array {
    $config = $this->config('vet_api.business');
    return $this->legalPage('purchase_terms', [
      'Resumen del pedido' => 'Antes de registrar el pedido, revisa los productos, cantidades y el total en soles.',
      'Pago y retiro' => 'Puedes elegir pagar al recoger o coordinar el pago por Yape. Confirma el monto, la disponibilidad y el horario de retiro con BALTO antes de transferir.',
      'Consultas sobre tu pedido' => 'Si necesitas solicitar un cambio, una devolución o una cancelación, contacta a BALTO e indica tu número de pedido.',
    ], $config->get('purchase_terms'));
  }

  private function legalPage(string $key, array $sections, ?string $approved): array {
    $approved = trim($approved ?? '');
    $build = [
      '#type' => 'container',
      '#attributes' => ['class' => ['balto-legal-page']],
      '#cache' => ['tags' => ['config:vet_api.business']],
    ];
    if ($approved === '') {
      $build['#attached']['html_head'][] = [
        ['#tag' => 'meta', '#attributes' => ['name' => 'robots', 'content' => 'noindex']],
        'balto_legal_draft_' . $key,
      ];
    }

    $paragraphs = $approved === '' ? $sections : preg_split('/\R+/', $approved, -1, PREG_SPLIT_NO_EMPTY);
    foreach ($paragraphs as $heading => $paragraph) {
      if (is_string($heading)) {
        $build[] = ['#type' => 'html_tag', '#tag' => 'h2', 'text' => ['#plain_text' => $heading]];
      }
      $build[] = ['#type' => 'html_tag', '#tag' => 'p', 'text' => ['#plain_text' => $paragraph]];
    }
    return $build;
  }

}
