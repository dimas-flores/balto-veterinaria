# Recursos visuales

## Fotografía de portada

- Archivo local: `drupal/web/themes/custom/vet_theme/images/companeros.jpg`.
- Autor: Alvan Nee.
- Fuente: [Two brown and white dogs running dirt road during daytime — Unsplash](https://unsplash.com/photos/two-brown-and-white-dogs-running-dirt-road-during-daytime-T-0EW-SEbsE).
- Licencia indicada en la ficha: Unsplash License.
- Uso: imagen ilustrativa de mascotas. No representa pacientes, personal ni instalaciones de BALTO.
- Se descarga y sirve desde el propio proyecto para evitar solicitudes a un CDN durante la demo.

## Marca e íconos

`logo-placeholder.svg` es una marca provisional creada para el proyecto; no pretende ser el logo oficial. Se reemplaza automáticamente por `images/logo.png` si el usuario aporta ese archivo y se reconstruye la imagen Docker.

Los íconos lineales son SVG propios del tema. Cada servicio guarda la elección del ícono en su entidad Drupal. La marca BALTO y sus datos fueron proporcionados por el usuario.

## Mapa

El iframe consulta Google Maps con la dirección central almacenada en Drupal. Necesita conexión a internet. La dirección textual y el enlace para abrir Maps permanecen disponibles aunque no cargue el iframe.

## Productos de ejemplo

Los quince productos usan ilustraciones SVG originales del proyecto, con su PNG correspondiente en `drupal/assets/products/`. Se generan con `scripts/generate-product-placeholders.py` y `rsvg-convert`, y se cargan como archivos permanentes de Drupal al instalar el catálogo.

Son representaciones genéricas de bolsas, accesorios y recipientes; no reproducen empaques ni logotipos de fabricantes. Cada ilustración lleva el texto **IMAGEN REFERENCIAL · DEMO**. El catálogo y el detalle informan que los productos, precios y existencias son de ejemplo. No se usó una fotografía de otro artículo para presentarla como el producto real.

## Fotografías reales aportadas por el usuario

Se seleccionaron seis de las imágenes enviadas en la conversación. Los originales se conservan sin retoques en `drupal/assets/clinic/`; no se presentan como recursos de licencia libre. Se usan como material de BALTO proporcionado por el usuario para esta web.

| Archivo | Origen aportado | Uso |
| --- | --- | --- |
| `paciente-felino.png` | Fotografía del gato, imagen 12 | Portada |
| `encuentro-profesional.png` | Fotografía del encuentro profesional, imagen 17 | Quiénes somos; el usuario identifica al propietario en el centro |
| `bethoven.png` | Fotografía limpia, imagen 11, con contexto de publicación en imagen 10 | Historia publicada por BALTO en julio de 2023 |
| `recuperacion.png` | Fotografía del cachorro con cartel de recuperación, imagen 13 | Historia compartida, sin añadir nombre o fecha no proporcionados |
| `adopcion.png` | Fotografía limpia, imagen 20, con contexto de publicación en imagen 19 | Seguimiento posterior a una adopción, publicado en abril de 2021 |
| `identidad-balto.png` | Imagen de marca, imagen 18 | Logo de BALTO como avatar de marca |

Las capturas con comentarios y controles de Facebook no se incorporaron: se eligieron sus fotografías limpias. Tampoco se publican los afiches que muestran direcciones distintas o números de contacto pendientes de confirmar. No se añadieron nombres de personas, especialidades, premios ni grados académicos a partir de las fotografías. Las publicaciones de recuperación se presentan como historias históricas de BALTO, sin prometer resultados futuros.

Las fotos y sus pies están en Drupal, tipo de contenido **Historia y foto de BALTO**. Un administrador o encargado de tienda puede editarlos desde `/admin/content`; las semillas se ejecutan una sola vez y conservan las ediciones posteriores. El logo limpio de `images/logo.png`, si se proporciona, tiene prioridad sobre el avatar de la galería.

Los estilos de imagen nativos generan versiones WebP de hasta 1000, 640 y 160 píxeles para la web. Los archivos originales siguen disponibles completos al pulsar las fotos de las historias. Se revisaron escritorio, pantalla móvil, carga de imágenes y funcionamiento del chat; no se volvieron a ejecutar las compras por tratarse de esta actualización visual.

La dirección principal sigue siendo Jr. Ignacio Miranda N.º 220, según los datos confirmados previamente por el usuario. El usuario confirmó el horario del afiche: lunes a domingo de 09:00 a 20:00. Se guarda como horario confirmado en Drupal; hospitalización permanece en 24 horas.

La selección está publicada en la instancia AWS con HTTPS. [Comprobación visual en AWS](verificacion-galeria-balto-aws.json): fotos, logo, escritorio y móvil, chat funcionando y datos comerciales conservados.

La diapositiva de hospitalización utiliza una sola foto original de un paciente,
publicada en Drupal. Se retiraron los recortes del afiche por su baja resolución.
No se presenta esa fotografía como una imagen de las instalaciones. Las fotos
reales del inventario siguen pendientes; el catálogo conserva sus ilustraciones
referenciales identificadas.

El propietario confirmó el nombre «Veterinaria BALTO Juliaca», atención de
9:00 a. m. a 7:00 p. m. (días pendientes), internamiento 24 horas y la lista de
servicios. La información se aplica una sola vez mediante
`update-owner-business.php` y luego se administra desde Drupal. Los medios de
pago del local son tarjeta, Yape, transferencia y efectivo; Yape 982183032 es
independiente del WhatsApp de atención 986866036. La demo conserva pago simulado.

## Fotografía de la tienda en "Para tu gato"

`images/para-gato-balto.jpg` es una foto real publicada por BALTO en su Facebook: un gatito negro con chompa sobre el mostrador de la tienda. La aportó el usuario el 19 de noviembre de 2026 junto con otras publicaciones de la veterinaria. Se recortó a 900 × 700 px sin retoques. Reemplaza a la foto de banco anterior (`para-gato.jpg`, que se conserva en el repositorio).

## Fotos de "Así trabajamos"

`images/clinica-cirugia.jpg`, `clinica-monitoreo.jpg`, `clinica-ecografia.jpg` y `clinica-rayosx.jpg` son fotos reales del equipo de BALTO. Se recortaron de sus publicaciones de Facebook (campaña de esterilización, "Esterilizar" y "Cirugía general"), que aportó el usuario el 19 de noviembre de 2026. Solo se tomó el centro de cada foto, sin los aros, textos ni promociones del afiche. Como vienen de piezas para redes, su resolución es baja (de 160 a 460 px de origen); se ampliaron ×4 con [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) v0.2.5.0 (modelo `realesrgan-x4plus`, licencia BSD-3-Clause) y se guardaron a 960 × 720 px. La IA reconstruye textura (ladrillos, gorros, pantallas) y puede suavizar los rostros; el programa se usó solo en la computadora de desarrollo y no forma parte del sitio. Conviene reemplazarlas por las fotos originales cuando estén disponibles.
