<?php

/** Confirmación explícita del propietario del proyecto; no repetir en reinicios. */
if (!\Drupal::state()->get('balto.schedule.confirmed.v2')) {
  \Drupal::configFactory()->getEditable('vet_api.business')
    ->set('consultation_schedule', 'Lunes a sábado de 9:00 a. m. a 7:00 p. m.')
    ->set('schedule_is_example', FALSE)->save();
  \Drupal::state()->set('balto.schedule.confirmed.v2', TRUE);
  echo "Horario confirmado de BALTO guardado.\n";
}

$config = \Drupal::configFactory()->getEditable('vet_api.business');
if ($config->get('consultation_schedule') === 'Lunes a sábado de 09:00 a 19:00') {
  $config->set('consultation_schedule', 'Lunes a sábado de 9:00 a. m. a 7:00 p. m.')->save();
}
