<?php

declare(strict_types=1);

namespace Drupal\balto_automation\Service;

use Drupal\Core\Cache\CacheBackendInterface;
use Drupal\Core\Logger\LoggerChannelFactoryInterface;
use GuzzleHttp\ClientInterface;

/**
 * Comprueba con Disify que el dominio de un correo existe.
 *
 * Solo rechaza cuando Disify indica claramente que el dominio no puede recibir
 * correo. Cualquier fallo del servicio deja pasar la compra.
 */
final class EmailChecker {
  private const RESERVED = ['example.com', 'example.org', 'example.net', 'localhost'];
  private const RESERVED_TLDS = ['invalid', 'test', 'example', 'localhost', 'local'];

  public function __construct(
    private readonly ClientInterface $http,
    private readonly CacheBackendInterface $cache,
    private readonly LoggerChannelFactoryInterface $loggerFactory,
  ) {}

  /** @return bool FALSE solo si el correo es claramente inválido. */
  public function isDeliverable(string $email): bool {
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
      return FALSE;
    }
    $domain = substr(strrchr($email, '@'), 1);
    $tld = substr(strrchr($domain, '.') ?: '', 1);
    if (in_array($domain, self::RESERVED, TRUE) || in_array($tld, self::RESERVED_TLDS, TRUE)) {
      return TRUE;
    }
    $cid = 'balto_automation:email_domain:' . hash('sha256', $domain);
    if ($hit = $this->cache->get($cid)) {
      return (bool) $hit->data;
    }
    try {
      $response = $this->http->request('GET', 'https://disify.com/api/domain/' . rawurlencode($domain), ['timeout' => 2, 'connect_timeout' => 1.5]);
      $data = json_decode((string) $response->getBody(), TRUE);
      if (!is_array($data) || !array_key_exists('dns', $data)) {
        return TRUE;
      }
      $ok = $data['dns'] !== FALSE;
      $this->cache->set($cid, $ok ? 1 : 0, time() + ($ok ? 86400 : 3600));
      return $ok;
    }
    catch (\Throwable $e) {
      $this->loggerFactory->get('balto_automation')->notice('Disify no respondió (@m); se acepta el correo.', ['@m' => get_class($e)]);
      return TRUE;
    }
  }

}
