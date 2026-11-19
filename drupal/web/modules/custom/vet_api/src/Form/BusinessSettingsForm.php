<?php

declare(strict_types=1);

namespace Drupal\vet_api\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/** Formulario protegido: validación nativa y CSRF de Drupal Form API. */
final class BusinessSettingsForm extends ConfigFormBase {

  public function getFormId(): string {
    return 'vet_api_business_settings';
  }

  protected function getEditableConfigNames(): array {
    return ['vet_api.business'];
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config('vet_api.business');
    $form['identity'] = ['#type' => 'details', '#title' => $this->t('Identidad y presentación'), '#open' => TRUE];
    foreach (['name' => 'Nombre del negocio', 'slogan' => 'Lema', 'city' => 'Ciudad', 'about_title' => 'Título de quiénes somos'] as $key => $label) {
      $form['identity'][$key] = ['#type' => 'textfield', '#title' => $this->t($label), '#default_value' => $config->get($key), '#required' => TRUE, '#maxlength' => 200];
    }
    $form['identity']['about_text'] = ['#type' => 'textarea', '#title' => $this->t('Descripción de la veterinaria'), '#default_value' => $config->get('about_text'), '#required' => TRUE, '#maxlength' => 2000];
    $form['contact'] = ['#type' => 'details', '#title' => $this->t('Sedes y contacto'), '#open' => TRUE];
    $addresses = $config->get('addresses') ?? [];
    foreach ([0 => 'Dirección de la sede central', 1 => 'Dirección de la segunda sede'] as $index => $label) {
      $form['contact']['address_' . $index] = ['#type' => 'textfield', '#title' => $this->t($label), '#default_value' => $addresses[$index] ?? '', '#required' => TRUE, '#maxlength' => 250];
    }
    $form['contact']['maps_cid'] = ['#type' => 'textfield', '#title' => $this->t('Identificador CID de la ficha de Google Maps'), '#default_value' => $config->get('maps_cid'), '#maxlength' => 22, '#description' => $this->t('Identifica el punto exacto del negocio. Déjalo vacío para buscar por dirección.')];
    $form['contact']['whatsapp'] = ['#type' => 'tel', '#title' => $this->t('WhatsApp de Perú (9 dígitos)'), '#default_value' => $config->get('whatsapp'), '#required' => TRUE, '#maxlength' => 20];
    $form['contact']['phone_secondary'] = ['#type' => 'tel', '#title' => $this->t('Segundo teléfono (9 dígitos)'), '#default_value' => $config->get('phone_secondary'), '#maxlength' => 20, '#description' => $this->t('Opcional. Se muestra en el pie de página para llamar.')];
    $form['contact']['instagram_user'] = ['#type' => 'textfield', '#title' => $this->t('Usuario de Instagram (sin @)'), '#default_value' => $config->get('instagram_user'), '#maxlength' => 30];
    $form['contact']['tiktok_name'] = ['#type' => 'textfield', '#title' => $this->t('Nombre en TikTok'), '#default_value' => $config->get('tiktok_name'), '#maxlength' => 100];
    $form['contact']['email'] = ['#type' => 'email', '#title' => $this->t('Correo del negocio'), '#default_value' => $config->get('email'), '#description' => $this->t('Déjalo vacío hasta tener el correo real; no se mostrará un correo de ejemplo.')];
    $form['contact']['facebook_name'] = ['#type' => 'textfield', '#title' => $this->t('Nombre en Facebook'), '#default_value' => $config->get('facebook_name'), '#maxlength' => 150];
    $form['contact']['facebook_url'] = ['#type' => 'url', '#title' => $this->t('Enlace exacto de Facebook'), '#default_value' => $config->get('facebook_url'), '#description' => $this->t('Déjalo vacío hasta confirmar el enlace. El nombre seguirá visible.')];
    $form['schedule'] = ['#type' => 'details', '#title' => $this->t('Horarios'), '#open' => TRUE];
    $form['schedule']['hospitalization'] = ['#type' => 'textfield', '#title' => $this->t('Horario de hospitalización'), '#default_value' => $config->get('hospitalization'), '#required' => TRUE, '#maxlength' => 100];
    $form['schedule']['consultation_schedule'] = ['#type' => 'textarea', '#title' => $this->t('Horario de tienda y consultorio'), '#default_value' => $config->get('consultation_schedule'), '#required' => TRUE, '#maxlength' => 1000];
    $form['schedule']['schedule_is_example'] = ['#type' => 'checkbox', '#title' => $this->t('Este horario de tienda/consultorio es de ejemplo'), '#default_value' => $config->get('schedule_is_example'), '#description' => $this->t('Desmarca únicamente después de confirmar el horario real con BALTO.')];
    $form['payments'] = ['#type' => 'details', '#title' => $this->t('Pagos en el local y cotizaciones'), '#open' => TRUE];
    $form['payments']['payment_methods'] = ['#type' => 'textfield', '#title' => $this->t('Medios de pago en el local'), '#default_value' => $config->get('payment_methods'), '#maxlength' => 250];
    $form['payments']['yape_number'] = ['#type' => 'tel', '#title' => $this->t('Número de Yape'), '#default_value' => $config->get('yape_number'), '#maxlength' => 9, '#description' => $this->t('Este número no reemplaza al WhatsApp de atención.')];
    $form['payments']['service_pricing_note'] = ['#type' => 'textarea', '#title' => $this->t('Información sobre precios de servicios'), '#default_value' => $config->get('service_pricing_note'), '#maxlength' => 1000];
    $form['catalog_is_example'] = ['#type' => 'checkbox', '#title' => $this->t('El inventario y los precios del catálogo son de ejemplo'), '#default_value' => $config->get('catalog_is_example')];
    return parent::buildForm($form, $form_state);
  }

  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);
    $cid = trim((string) $form_state->getValue('maps_cid'));
    if ($cid !== '' && !preg_match('/^[0-9]{1,22}$/', $cid)) {
      $form_state->setErrorByName('maps_cid', $this->t('El CID solo admite números.'));
    }
    $yape = trim((string) $form_state->getValue('yape_number'));
    if ($yape !== '' && !preg_match('/^9[0-9]{8}$/', $yape)) {
      $form_state->setErrorByName('yape_number', $this->t('Ingresa nueve dígitos que comiencen con 9.'));
    }
    $phone = preg_replace('/\D/', '', $form_state->getValue('whatsapp') ?? '');
    if (!preg_match('/^9\d{8}$/', $phone)) {
      $form_state->setErrorByName('whatsapp', $this->t('Ingresa un celular peruano de nueve dígitos que comience con 9.'));
    }
    $second = preg_replace('/\D/', '', $form_state->getValue('phone_secondary') ?? '');
    if ($second !== '' && !preg_match('/^9\d{8}$/', $second)) {
      $form_state->setErrorByName('phone_secondary', $this->t('Ingresa un celular peruano de nueve dígitos que comience con 9.'));
    }
    $instagram = ltrim(trim((string) $form_state->getValue('instagram_user')), '@');
    if ($instagram !== '' && !preg_match('/^[A-Za-z0-9._]{1,30}$/', $instagram)) {
      $form_state->setErrorByName('instagram_user', $this->t('El usuario de Instagram solo admite letras, números, puntos y guiones bajos.'));
    }
    $url = trim($form_state->getValue('facebook_url') ?? '');
    if ($url !== '') {
      $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
      if (parse_url($url, PHP_URL_SCHEME) !== 'https' || !in_array($host, ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'www.fb.com'], TRUE)) {
        $form_state->setErrorByName('facebook_url', $this->t('Usa un enlace HTTPS de Facebook.'));
      }
    }
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $config = $this->config('vet_api.business');
    foreach (['name', 'slogan', 'city', 'about_title', 'about_text', 'maps_cid', 'payment_methods', 'yape_number', 'service_pricing_note', 'whatsapp', 'phone_secondary', 'tiktok_name', 'email', 'facebook_name', 'facebook_url', 'hospitalization', 'consultation_schedule'] as $key) {
      $config->set($key, trim((string) $form_state->getValue($key)));
    }
    $config->set('instagram_user', ltrim(trim((string) $form_state->getValue('instagram_user')), '@'));
    $config->set('addresses', [trim($form_state->getValue('address_0')), trim($form_state->getValue('address_1'))]);
    $config->set('whatsapp_url', 'https://wa.me/51' . preg_replace('/\D/', '', $form_state->getValue('whatsapp')));
    $config->set('schedule_is_example', (bool) $form_state->getValue('schedule_is_example'));
    $config->set('catalog_is_example', (bool) $form_state->getValue('catalog_is_example'));
    $config->save();
    // Config::save invalida sus etiquetas de caché: portada y futuro chatbot
    // comparten esta fuente y no precisan copiar datos al HTML.
    parent::submitForm($form, $form_state);
  }

}
