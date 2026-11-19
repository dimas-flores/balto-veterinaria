<?php

declare(strict_types=1);

namespace Drupal\balto_payments\Service;

use Drupal\commerce_order\Entity\OrderInterface;
use Drupal\commerce_payment\Exception\PaymentGatewayException;
use Drupal\Core\Site\Settings;
use GuzzleHttp\ClientInterface;

/** Cliente de Checkout Pro para la cuenta de prueba de BALTO. */
final class MercadoPagoClient {

  public function __construct(private readonly ClientInterface $http) {}

  public function api(string $method, string $path, array $payload = []): array {
    $token = getenv('BALTO_MERCADO_PAGO_TEST_TOKEN');
    if (!$token) {
      throw new PaymentGatewayException('Mercado Pago de prueba no está configurado.');
    }
    $options = [
      'headers' => ['Authorization' => 'Bearer ' . $token],
      'timeout' => 8,
      'allow_redirects' => FALSE,
    ];
    if ($payload) {
      $options['json'] = $payload;
    }
    try {
      $response = $this->http->request($method, 'https://api.mercadopago.com' . $path, $options);
      $data = json_decode((string) $response->getBody(), TRUE, 32, JSON_THROW_ON_ERROR);
      if (is_array($data)) {
        return $data;
      }
    }
    catch (\Exception) {
      // Avoid logging the request containing the credential.
    }
    throw new PaymentGatewayException('No se pudo verificar la operación con Mercado Pago.');
  }

  public function testSellerId(): string {
    $seller = $this->api('GET', '/users/me');
    if (!in_array('test_user', $seller['tags'] ?? [], TRUE) || ($seller['site_id'] ?? NULL) !== 'MPE' || empty($seller['id'])) {
      throw new PaymentGatewayException('Se requiere una cuenta vendedora de prueba de Perú.');
    }
    return (string) $seller['id'];
  }

  public static function reference(OrderInterface $order): string {
    return hash_hmac('sha256', 'balto-mp-test:' . $order->uuid(), Settings::getHashSalt());
  }

  /** Busca una operación aprobada si el navegador no trae el ID. */
  public function approvedPaymentId(OrderInterface $order): string {
    $query = http_build_query([
      'external_reference' => self::reference($order),
      'status' => 'approved',
      'limit' => 2,
    ]);
    $search = $this->api('GET', '/v1/payments/search?' . $query);
    $matches = $search['results'] ?? [];
    if (count($matches) !== 1) {
      throw new PaymentGatewayException('Mercado Pago aún no muestra un único pago aprobado para este pedido.');
    }
    return (string) ($matches[0]['id'] ?? '');
  }

}
