<?php

/** Datos confirmados por el propietario; migración única que conserva ediciones posteriores. */
use Drupal\node\Entity\Node;
if (\Drupal::state()->get('balto.owner.business.v1')) {
  return;
}
$config = \Drupal::configFactory()->getEditable('vet_api.business');
$config->set('name', 'Veterinaria BALTO Juliaca')
  ->set('consultation_schedule', 'Lunes a sábado de 9:00 a. m. a 7:00 p. m.')
  ->set('schedule_is_example', FALSE)
  ->set('hospitalization', '24 horas')
  ->set('payment_methods', 'Tarjeta, Yape, transferencia bancaria y efectivo')
  ->set('yape_number', '982183032')
  ->set('service_pricing_note', 'Los precios de los servicios varían según la especie, edad, raza, peso y condición del paciente. Solicita una cotización por WhatsApp.')
  ->save();
\Drupal::configFactory()->getEditable('system.site')->set('name', 'Veterinaria BALTO Juliaca')->save();
$services = [
  ['Cirugías de esterilización', 'Cirugías', 'surgery', 'Servicio de esterilización. Consulta con el equipo para coordinar la evaluación de tu mascota.'],
  ['Cirugías traumatológicas', '', 'surgery', 'Atención quirúrgica traumatológica, según la evaluación y las necesidades del paciente.'],
  ['Curaciones y tratamientos', 'Medicina veterinaria en general', 'stethoscope', 'Curaciones y tratamientos indicados por el equipo veterinario después de evaluar al paciente.'],
  ['Vacunación', '', 'stethoscope', 'Vacunación para mascotas. Consulta al equipo para coordinar su atención.'],
  ['Internamiento 24 horas', 'Hospitalización veterinaria las 24 horas', 'moon', 'Internamiento y hospitalización veterinaria durante las 24 horas.'],
  ['Ecografía', 'Ecografías', 'ultrasound', 'Servicio de ecografía veterinaria. Consulta la disponibilidad para tu mascota.'],
  ['Rayos X', 'Rayos X digital', 'xray', 'Servicio de radiografías veterinarias para apoyar la evaluación del paciente.'],
  ['Laboratorio clínico', 'Laboratorio', 'lab', 'Hemograma, bioquímica sanguínea y microscopía. Consulta los análisis que necesita tu mascota.'],
  ['Oftalmología', '', 'stethoscope', 'Atención oftalmológica veterinaria. Coordina una evaluación con el equipo.'],
];
$storage = \Drupal::entityTypeManager()->getStorage('node');
foreach ($services as [$title, $previous, $icon, $description]) {
  $found = $storage->loadByProperties(['type' => 'servicio', 'title' => $title]);
  if (!$found && $previous !== '') {
    $found = $storage->loadByProperties(['type' => 'servicio', 'title' => $previous]);
  }
  $node = $found ? reset($found) : Node::create(['type' => 'servicio', 'langcode' => 'es', 'uid' => 1]);
  $node->setTitle($title)->setPublished()
    ->set('body', ['value' => $description, 'format' => 'plain_text'])
    ->set('field_service_icon', $icon)->save();
}
// Retirar el duplicado de internamiento de la semilla original sin borrar contenido.
foreach ($storage->loadByProperties(['type' => 'servicio', 'title' => 'Internamiento']) as $duplicate) {
  $duplicate->setUnpublished()->save();
}
\Drupal::state()->set('balto.owner.business.v1', TRUE);
echo "Información confirmada del propietario de BALTO incorporada.\n";
