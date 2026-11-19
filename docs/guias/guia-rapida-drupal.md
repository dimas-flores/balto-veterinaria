# Actualizar BALTO desde Drupal

Guía rápida · 17 de noviembre de 2026.
Los datos confirmados por el doctor ya están cargados. Estos pasos sirven para modificarlos después.

## Entrar

1. Abre https://balto-veterinaria.3-211-103-160.sslip.io/user/login.
2. Introduce usuario y contraseña.
3. Pulsa **Iniciar sesión**.

Resultado: tendrás acceso a las funciones permitidas para tu cuenta.
Usa **admin_balto** para todos los contenidos; **tienda_balto** permite productos, pedidos y datos del negocio.
Las contraseñas están en el archivo privado de accesos de tu computadora.

## Cambiar datos, horarios y pagos

1. Abre https://balto-veterinaria.3-211-103-160.sslip.io/admin/config/balto/negocio.
2. Modifica el campo correspondiente.
3. Pulsa **Guardar configuración**.

Resultado: la página y las nuevas consultas del chatbot utilizarán esos datos.

- **Nombre del negocio:** Veterinaria BALTO Juliaca.
- **Horario de tienda y consultorio:** de 9:00 a. m. a 7:00 p. m.; días pendientes de confirmar.
- **Horario de hospitalización:** 24 horas.
- **WhatsApp de Perú (9 dígitos):** 986866036.
- **Número de Yape:** 982183032.
- **Medios de pago en el local:** los confirmados por el propietario.
- **Información sobre precios de servicios:** dependen de especie, edad, raza, peso y condición del paciente.

Mostrar tarjeta o transferencia en esta información no habilita esos cobros en el checkout.

## Agregar servicios

Usa **admin_balto**. Revisa primero los existentes para evitar duplicados.

1. Abre https://balto-veterinaria.3-211-103-160.sslip.io/node/add/servicio.
2. Completa el título.
3. Completa la descripción.
4. Selecciona **Ícono del servicio**.
5. Mantén **Publicado** marcado.
6. Pulsa **Guardar**.

Resultado: el servicio aparecerá en la portada y podrá consultarlo el chatbot.
Ejemplo: «Oftalmología» y «Atención oftalmológica veterinaria. Coordina una evaluación con el equipo».
Para editar, abre https://balto-veterinaria.3-211-103-160.sslip.io/admin/content y selecciona **Editar** en el servicio.

## Agregar productos

Usa **tienda_balto** o **admin_balto**.
El stock funciona mediante ajustes: en un producto existente, escribir 5 suma cinco unidades al saldo actual.

1. Abre https://balto-veterinaria.3-211-103-160.sslip.io/admin/commerce/products.
2. Pulsa **Añadir producto**.
3. Completa nombre, descripción, categoría y especie.
4. Carga la foto y su texto alternativo.
5. Completa la variación: SKU único, precio en PEN y ajuste de stock.
6. Mantén el producto publicado.
7. Pulsa **Guardar**.

Resultado: el producto aparecerá en la tienda y el chatbot podrá consultar sus datos.
**Variación:** presentación vendida, como bolsa de 15 kg. **SKU:** código único del producto.
Mantén el aviso de catálogo de ejemplo hasta revisar y sustituir todo el inventario.

## Confirmar pagos de pedidos

Usa **tienda_balto** o **admin_balto**.
Verifica el ingreso en Yape o el efectivo recibido antes de registrar el pago. Una captura no confirma el ingreso.

1. Abre https://balto-veterinaria.3-211-103-160.sslip.io/admin/commerce/orders.
2. Abre el pedido.
3. Entra en **Pagos**.
4. Pulsa **Recibir** en el pago pendiente.
5. Revisa el importe.
6. Pulsa **Recibir** para confirmar.

Resultado: el pago quedará registrado sin volver a descontar stock.
Cancelar un pedido devuelve las unidades apartadas. Revisa y cancela solicitudes abandonadas; no vencen automáticamente.
**Pago simulado** solo registra una operación ficticia para la tarea.

## Si algo falla

- Acceso denegado: revisa la cuenta; para servicios, utiliza admin_balto.
- Cambio no visible: guarda, recarga y envía una pregunta nueva al chat.
- Producto ausente: verifica que esté publicado y revisa los filtros.

Fuentes: código y configuración de BALTO e informe de pagos manuales comprobados en AWS.
Revisión documental, sin repetir compras. Pendiente: días de atención. No se incluyen capturas.
