<?php

declare(strict_types=1);

namespace Drupal\vet_api\Service;

use Drupal\Core\Database\Connection;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Lock\LockBackendInterface;
use Drupal\Core\Messenger\MessengerInterface;
use Drupal\Core\Url;
use Drupal\commerce\Response\NeedsRedirectException;
use Drupal\commerce_order\Entity\OrderInterface;
use Drupal\vet_api\Response\OffsitePaymentRedirect;

/** Serializa la confirmación de pedidos que compiten por las mismas unidades. */
final class CheckoutStockGuard {

  public function __construct(
    private readonly LockBackendInterface $lock,
    private readonly Connection $database,
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly ProductCatalog $catalog,
    private readonly MessengerInterface $messenger,
  ) {}

  public function complete(OrderInterface $order, callable $checkout): array {
    $quantities = [];
    foreach ($order->getItems() as $item) {
      $variation = $item->getPurchasedEntity();
      if (!$variation || !$variation->isPublished()) {
        $this->reject('Uno de los productos ya no está disponible. Revisa tu carrito.');
      }
      $quantities[$variation->id()] = ($quantities[$variation->id()] ?? 0) + (float) $item->getQuantity();
    }
    ksort($quantities, SORT_NUMERIC);
    $keys = ['balto.checkout.order.' . $order->id()];
    foreach (array_keys($quantities) as $id) {
      $keys[] = 'balto.checkout.stock.' . $id;
    }
    $acquired = [];
    try {
      foreach ($keys as $key) {
        if (!$this->lock->acquire($key, 60.0)) {
          $this->reject('Se está confirmando otra compra de estos productos. Revisa tu carrito e inténtalo de nuevo.');
        }
        $acquired[] = $key;
      }
      $stored = $this->entityTypeManager->getStorage('commerce_order')->loadUnchanged($order->id());
      if ($stored->getState()->getId() !== 'draft') {
        throw new NeedsRedirectException(Url::fromRoute('commerce_checkout.form', ['commerce_order' => $order->id(), 'step' => 'complete'])->toString());
      }
      $transaction = $this->database->startTransaction();
      try {
        foreach ($quantities as $id => $quantity) {
          $variation = $this->entityTypeManager->getStorage('commerce_product_variation')->load($id);
          if ($quantity <= 0 || $quantity > $this->catalog->stock($variation)) {
            $this->reject('Las existencias cambiaron antes de confirmar. Revisa las cantidades de tu carrito.');
          }
        }
        $result = $checkout();
        $transaction->commitOrRelease();
        return $result;
      }
      catch (OffsitePaymentRedirect $exception) {
        $transaction->commitOrRelease();
        throw $exception;
      }
      catch (NeedsRedirectException $exception) {
        // La redirección normal ocurre después de guardar pago y pedido.
        // Si sigue en borrador, es una salida de error: deshacer el pago local.
        if ($order->getState()->getId() === 'draft') {
          $transaction->rollBack();
        }
        else {
          $transaction->commitOrRelease();
        }
        throw $exception;
      }
      catch (\Throwable $exception) {
        $transaction->rollBack();
        throw $exception;
      }
    }
    catch (NeedsRedirectException $exception) {
      if (!$exception instanceof OffsitePaymentRedirect && $acquired && $order->getState()->getId() === 'draft') {
        $order->unlock();
        $order->set('checkout_step', 'order_information');
        $order->save();
      }
      throw $exception;
    }
    finally {
      foreach (array_reverse($acquired) as $key) {
        $this->lock->release($key);
      }
    }
  }

  private function reject(string $message): never {
    $this->messenger->addError($message);
    throw new NeedsRedirectException(Url::fromRoute('commerce_cart.page')->toString());
  }

}
