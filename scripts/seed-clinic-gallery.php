<?php

/** Fotos proporcionadas por el usuario, editables y persistentes en Drupal. */
use Drupal\Core\Entity\Entity\EntityFormDisplay;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\Core\File\FileExists;
use Drupal\Core\File\FileSystemInterface;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\image\Entity\ImageStyle;
use Drupal\node\Entity\Node;
use Drupal\node\Entity\NodeType;
use Drupal\user\Entity\Role;

// Derivados web nativos de Drupal: se conserva íntegro el archivo original.
foreach (['balto_photo_wide' => 1000, 'balto_photo_card' => 640, 'balto_photo_card_large' => 960, 'balto_brand' => 160] as $id => $width) {
  if (!ImageStyle::load($id)) {
    $style = ImageStyle::create(['name' => $id, 'label' => 'BALTO · ' . $width . ' px WebP']);
    $style->addImageEffect(['id' => 'image_scale', 'weight' => 0, 'data' => ['width' => $width, 'height' => NULL, 'upscale' => FALSE]]);
    $style->addImageEffect(['id' => 'image_convert', 'weight' => 1, 'data' => ['extension' => 'webp']]);
    $style->save();
  }
}

if (\Drupal::state()->get('balto.seed.clinic_gallery.v1')) {
  echo "Las fotografías de BALTO ya existen; se conservan las ediciones.\n";
  return;
}
if (!NodeType::load('historia_balto')) {
  NodeType::create(['type' => 'historia_balto', 'name' => 'Historia y foto de BALTO', 'description' => 'Fotografías de portada, presentación y momentos compartidos por la veterinaria.', 'display_submitted' => FALSE])->save();
}
$fields = [
  ['field_clinic_photo', 'image', 'Fotografía', ['uri_scheme' => 'public'], ['file_directory' => 'balto-clinic', 'file_extensions' => 'png jpg jpeg webp', 'max_filesize' => '8 MB', 'alt_field' => TRUE, 'alt_field_required' => TRUE]],
  ['field_clinic_caption', 'string_long', 'Texto de la fotografía', [], []],
  ['field_clinic_role', 'list_string', 'Ubicación en la página', ['allowed_values' => ['portada' => 'Portada', 'nosotros' => 'Quiénes somos', 'historia' => 'Historia compartida', 'logo' => 'Logo de BALTO']], []],
  ['field_clinic_order', 'integer', 'Orden de presentación', [], ['min' => 0]],
];
foreach ($fields as [$name, $type, $label, $storage_settings, $settings]) {
  if (!FieldStorageConfig::loadByName('node', $name)) {
    FieldStorageConfig::create(['field_name' => $name, 'entity_type' => 'node', 'type' => $type, 'cardinality' => 1, 'settings' => $storage_settings])->save();
  }
  if (!FieldConfig::loadByName('node', 'historia_balto', $name)) {
    FieldConfig::create(['field_name' => $name, 'entity_type' => 'node', 'bundle' => 'historia_balto', 'label' => $label, 'settings' => $settings, 'required' => $name !== 'field_clinic_order'])->save();
  }
}
$form = EntityFormDisplay::load('node.historia_balto.default') ?? EntityFormDisplay::create(['targetEntityType' => 'node', 'bundle' => 'historia_balto', 'mode' => 'default', 'status' => TRUE]);
foreach (['title' => 'string_textfield', 'field_clinic_photo' => 'image_image', 'field_clinic_caption' => 'string_textarea', 'field_clinic_role' => 'options_select', 'field_clinic_order' => 'number'] as $field => $widget) {
  $form->setComponent($field, ['type' => $widget, 'weight' => count($form->getComponents())]);
}
$form->save();
$display = EntityViewDisplay::load('node.historia_balto.default') ?? EntityViewDisplay::create(['targetEntityType' => 'node', 'bundle' => 'historia_balto', 'mode' => 'default', 'status' => TRUE]);
$display->setComponent('field_clinic_photo', ['type' => 'image', 'label' => 'hidden', 'settings' => ['image_style' => 'balto_photo_wide', 'image_link' => '']])
  ->setComponent('field_clinic_caption', ['type' => 'basic_string', 'label' => 'hidden'])
  ->removeComponent('field_clinic_role')->removeComponent('field_clinic_order')->save();

$directory = 'public://balto-clinic';
\Drupal::service('file_system')->prepareDirectory($directory, FileSystemInterface::CREATE_DIRECTORY);
$items = json_decode(file_get_contents('/opt/balto/scripts/data/clinic-gallery.json'), TRUE, 512, JSON_THROW_ON_ERROR);
foreach ($items as $item) {
  $existing = \Drupal::entityTypeManager()->getStorage('node')->loadByProperties(['type' => 'historia_balto', 'title' => $item['title']]);
  if ($existing) {
    continue;
  }
  $source = '/opt/balto/assets/clinic/' . $item['file'];
  $file = \Drupal::service('file.repository')->writeData(file_get_contents($source), $directory . '/' . $item['file'], FileExists::Replace);
  $file->setPermanent();
  $file->save();
  [$width, $height] = getimagesize($source);
  Node::create([
    'type' => 'historia_balto', 'title' => $item['title'], 'langcode' => 'es', 'uid' => 1, 'status' => 1,
    'field_clinic_photo' => ['target_id' => $file->id(), 'alt' => $item['alt'], 'width' => $width, 'height' => $height],
    'field_clinic_caption' => $item['caption'], 'field_clinic_role' => $item['role'], 'field_clinic_order' => $item['order'],
  ])->save();
}
if ($role = Role::load('administrador_tienda')) {
  foreach (['access content overview', 'create historia_balto content', 'edit any historia_balto content'] as $permission) {
    $role->grantPermission($permission);
  }
  $role->save();
}
\Drupal::state()->set('balto.seed.clinic_gallery.v1', TRUE);
echo "Fotografías, identidad e historias de BALTO cargadas en Drupal.\n";
