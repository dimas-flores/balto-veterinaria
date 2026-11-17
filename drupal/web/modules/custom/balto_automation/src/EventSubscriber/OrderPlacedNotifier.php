<?php

declare(strict_types=1);

namespace Drupal\balto_automation\EventSubscriber;

use Drupal\balto_automation\Service\N8nNotifier;
use Drupal\state_machine\Event\WorkflowTransitionEvent;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/** Avisa a n8n cuando se realiza un pedido. */
final class OrderPlacedNotifier implements EventSubscriberInterface {
  public function __construct(private readonly N8nNotifier $notifier) {}

  public static function getSubscribedEvents(): array {
    return ['commerce_order.place.post_transition' => 'onPlaced'];
  }

  public function onPlaced(WorkflowTransitionEvent $event): void {
    $this->notifier->order($event->getEntity(), 'placed');
  }

}
