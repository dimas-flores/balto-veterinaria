<?php

declare(strict_types=1);

namespace Drupal\vet_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;
use Drupal\vet_api\Service\BusinessData;
use Drupal\vet_api\Service\ClinicGallery;
use Symfony\Component\DependencyInjection\ContainerInterface;

/** Páginas públicas renderizadas con Twig y entidades de Drupal. */
final class HomeController extends ControllerBase {

  public function __construct(private readonly BusinessData $business, private readonly ClinicGallery $gallery) {}

  public static function create(ContainerInterface $container): static {
    return new static($container->get('vet_api.business'), $container->get('vet_api.clinic_gallery'));
  }

  public function home(): array {
    $gallery = $this->gallery->get();
    return [
      '#attached' => [
        'html_head' => [[
          ['#tag' => 'meta', '#attributes' => ['name' => 'description', 'content' => 'Veterinaria BALTO en Juliaca. Conoce nuestros servicios, consulta los horarios y separa tu cita por WhatsApp.']],
          'balto_description',
        ], ...vet_api_open_graph('BALTO Veterinaria · Medicina para tu mascota', 'Veterinaria BALTO en Juliaca. Conoce nuestros servicios, consulta los horarios y separa tu cita por WhatsApp.', '<front>')],
        'html_head_link' => [[
          ['rel' => 'canonical', 'href' => Url::fromRoute('<front>', [], ['absolute' => TRUE])->toString()],
          FALSE,
        ]],
      ],
      '#theme' => 'vet_home',
      '#business' => $this->business->getBusiness(),
      '#services' => $this->business->getServices(),
      '#clinic_gallery' => $gallery,
      '#cache' => [
        'tags' => array_merge(['config:vet_api.business', 'node_list:servicio', 'node_list'], $gallery['cache_tags']),
        'contexts' => ['user.permissions', 'user.node_grants:view', 'languages:language_interface'],
      ],
    ];
  }

}
