# Batalla linfática

Juego de patología para teléfonos, con 30 preguntas adaptadas del material de clase.

## Jugar

El anfitrión crea una sala de 10, 15 o 30 preguntas y comparte el enlace de invitación.
Cada compañero entra con un apodo, sin registrarse. El anfitrión inicia y avanza las rondas.

- 30 segundos por ronda.
- Acierto: 500 puntos más hasta 500 por rapidez.
- Rachas: desde el segundo acierto seguido, +100, +200 y hasta +300 puntos extra.
- Los errores no restan puntos.
- Explicación y clasificación después de cada pregunta.
- Podio y repaso personal de preguntas falladas, sin reloj ni puntos.

## Ejecutar localmente

Python 3.10 o superior: `python servidor.py`.
Sin DATABASE_URL, las salas viven en memoria y los teléfonos necesitan acceso a la red local.

## Alojamiento público

Instalar `pip install -r requirements.txt` y ejecutar `python servidor.py --no-browser`.
El servidor escucha en `0.0.0.0` y utiliza la variable `PORT` del proveedor.
Configurar DATABASE_URL como secreto del alojamiento y aplicar migration.sql a una base PostgreSQL nueva.
En Render se utiliza el plan Free, una sola instancia y región Virginia.

Con DATABASE_URL, las salas se conservan en PostgreSQL durante 24 horas. Las operaciones
de una sala se serializan con bloqueo de fila; las respuestas correctas se envían al cliente
solo después de cerrar la ronda. El anfitrión y cada jugador tienen tokens independientes.
El repaso personal se conserva en la misma pestaña mediante sessionStorage.
No hay cuentas ni datos personales requeridos: usar apodos.

El alojamiento gratuito puede tardar en activarse tras un periodo de inactividad.

## Material

Claves y explicaciones adaptadas del PDF «linfatico preguntas.pdf» proporcionado por el usuario.
Las preguntas directas, enumeraciones y pareamientos se presentan como opciones tocables.
