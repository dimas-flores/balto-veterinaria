<?php

declare(strict_types=1);

namespace Drupal\vet_api\Response;

use Drupal\commerce\Response\NeedsRedirectException;

/** Continúa un pago externo con el pedido aún en el paso de pago. */
final class OffsitePaymentRedirect extends NeedsRedirectException {}
