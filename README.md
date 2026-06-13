# DanHoot 🚀 - Clon Funcional de Kahoot en Tiempo Real

DanHoot es una aplicación web interactiva en tiempo real para crear y jugar trivias en grupo, inspirada en Kahoot. Está construida usando **Node.js, Express y Socket.io** en el backend, y un frontend moderno con **HTML5, JavaScript Vanilla y CSS3 esmerilado (Glassmorphism)**.

---

## 🎨 Identidad Visual y Diseño Premium
- **Paleta de Colores:** Basada en Azules profundos (`#0A1128`, `#1E3A8A`, `#3B82F6`), Rojos intensos (`#DC2626`, `#EF4444`) y Blancos/Grises (`#FFFFFF`, `#F3F4F6`).
- **Estilo:** Bordes súper redondeados (`border-radius: 24px`), transparencias y desenfoques tipo cristal (Glassmorphism), sombras fluidas y tipografía moderna cargada desde Google Fonts (Inter y Montserrat).
- **Responsividad:** Diseñada con flexbox y CSS Grid fluido para verse espectacular tanto en un proyector (pantalla del anfitrión) como en teléfonos móviles (controles del jugador).

---

## ⚡ Funcionalidades Principales

### 👨‍🏫 Modo Anfitrión (Profesor / Creador)
1. **Creador de Quizzes:** Formulario dinámico para ingresar el título y añadir múltiples preguntas. Permite editar el enunciado, las 4 opciones, seleccionar la correcta mediante un botón radial y definir el límite de tiempo (5-60s) usando un slider interactivo.
2. **Lobby en Tiempo Real:** Al guardar la trivia, el servidor genera un código PIN único de 6 dígitos y un código QR que codifica el enlace directo de acceso. Los jugadores conectados se listan dinámicamente.
3. **Control de la Partida:** Botón para iniciar el juego cuando haya participantes conectados.
4. **Pantalla de Estadísticas:** Muestra en tiempo real cuántas respuestas se han recibido y, al finalizar el tiempo, revela la respuesta correcta junto con un gráfico de barras animado que muestra la distribución de respuestas.
5. **Podio Final:** Renderiza un podio tridimensional interactivo para el Top 3 y una tabla con los puntajes generales de todos los participantes. Permite reiniciar la partida con el mismo código.

### 📱 Modo Jugador
1. **Acceso Ágil (QR):** Permite ingresar manualmente el PIN o cargar la URL con el parámetro `?code=XXXXXX` provisto por el QR, el cual auto-completa el PIN y enfoca el campo de apodo.
2. **Control Remoto Táctil:** Presenta botones responsivos adaptados al tamaño de los dedos, cada uno con los colores institucionales y símbolos de Kahoot (Triángulo, Diamante, Círculo, Cuadrado).
3. **Puntuación Inteligente por Velocidad:** Calcula los puntos en base al tiempo de reacción:
   $$\text{Puntaje} = \max\left(500, \text{Redondeo}\left(1000 - \frac{\text{Tiempo Empleado}}{\text{Límite de Tiempo}} \times 500\right)\right)$$
   *Una respuesta incorrecta otorga 0 puntos.*
4. **Retroalimentación Inmediata:** Pantallas a pantalla completa con colores e iconos animados que informan si la respuesta fue correcta o incorrecta, los puntos obtenidos, la posición actual y la cantidad total de jugadores en juego.

---

## 📁 Estructura del Proyecto

```text
DanHoot/
├── server.js            # Servidor Express, Socket.io y generación de códigos QR.
├── package.json         # Dependencias del proyecto.
├── .gitignore           # Archivos omitidos en Git.
└── public/              # Directorio de recursos estáticos del cliente.
    ├── index.html       # Portal único del jugador (acceso, lobby, juego y feedback).
    ├── host.html        # Dashboard administrativo del anfitrión (creador, lobby, estadísticas y podio).
    ├── style.css        # Hoja de estilos compartida (diseño, efectos y animaciones).
    └── script.js        # Utilidades compartidas del lado del cliente.
```

---

## 📡 Protocolo de Mensajería en Tiempo Real

El flujo del juego se gestiona mediante eventos bidireccionales de Socket.io:

| Evento | Origen ➡️ Destino | Payload | Descripción |
| :--- | :--- | :--- | :--- |
| `createGame` | Host $\rightarrow$ Servidor | `{ title, questions }` | Crea la partida en memoria con la lista de preguntas. |
| `gameCreated` | Servidor $\rightarrow$ Host | `{ roomCode, qrCodeDataUrl }` | Envía el PIN de la sala y el QR en base64. |
| `joinGame` | Jugador $\rightarrow$ Servidor | `{ roomCode, nickname }` | Petición para ingresar a un lobby. |
| `updateLobby` | Servidor $\rightarrow$ Host | `{ players: [...] }` | Actualiza la lista de jugadores conectados. |
| `startGame` | Host $\rightarrow$ Servidor | `{ roomCode }` | Da inicio formal a la partida. |
| `gameStarted` | Servidor $\rightarrow$ Todos | *Ninguno* | Informa que el juego ha salido del lobby de espera. |
| `sendQuestion` | Servidor $\rightarrow$ Todos | `{ questionIndex, ... }` | Envía la pregunta actual y sus opciones (sin la respuesta correcta). |
| `submitAnswer` | Jugador $\rightarrow$ Servidor | `{ roomCode, answerIndex, ... }` | Registra la elección del jugador y el tiempo restante. |
| `updateStats` | Servidor $\rightarrow$ Host | `{ answeredCount, totalPlayers }` | Actualiza el contador de personas que han respondido. |
| `questionResults` | Servidor $\rightarrow$ Host | `{ correctOptionIndex, distribution }` | Envía la distribución de elecciones y el ranking acumulado. |
| `questionFeedback` | Servidor $\rightarrow$ Jugador | `{ isCorrect, pointsEarned, rank }` | Notifica al jugador el resultado individual de su respuesta. |
| `nextQuestion` | Host $\rightarrow$ Servidor | `{ roomCode }` | Solicita el envío de la siguiente pregunta o el fin del juego. |
| `endGame` | Servidor $\rightarrow$ Todos | `{ podium, fullLeaderboard }` | Envía las puntuaciones finales de los ganadores al concluir el quiz. |
| `restartGame` | Host $\rightarrow$ Servidor | `{ roomCode }` | Reinicia los marcadores a cero y vuelve al lobby de espera. |
| `gameRestarted` | Servidor $\rightarrow$ Todos | *Ninguno* | Devuelve a los jugadores a la pantalla del lobby. |

---

## 🚀 Instalación y Ejecución

### Requisitos Previos
Tener instalado **Node.js** (versión 18 o superior recomendada).

### Paso 1: Instalar Dependencias
Instala los módulos necesarios del servidor (`express`, `socket.io`, `qrcode`):
```bash
npm install
```

### Paso 2: Iniciar el Servidor
Ejecuta el script principal:
```bash
node server.js
```
El servidor arrancará por defecto en el puerto `3000` y mostrará el siguiente mensaje:
> `DanHoot server running on http://localhost:3000`

### Paso 3: ¡A Jugar!
- Para el **Anfitrión (profesor o presentador):** Abre en tu navegador [http://localhost:3000/host.html](http://localhost:3000/host.html).
- Para los **Jugadores:** Abre [http://localhost:3000/index.html](http://localhost:3000/index.html) o simplemente escanea el código QR que se muestra en la pantalla del anfitrión.

---

## 📶 Jugando en una Red Local (Múltiples Dispositivos)

Si deseas jugar con amigos o alumnos conectando sus teléfonos móviles reales en la misma red Wi-Fi:

1. Busca la IP local de tu ordenador (en macOS, puedes abrir la terminal y escribir `ifconfig | grep inet` o mirarlo en *Ajustes del Sistema > Red*). Ejemplo: `192.168.1.50`.
2. En lugar de localhost, abre la pantalla del host usando esa IP: `http://192.168.1.50:3000/host.html`.
3. Al crear la sala, **el servidor autodetectará la IP y generará un QR configurado automáticamente con la dirección correcta** para que cualquier dispositivo conectado al mismo Wi-Fi pueda entrar de inmediato con solo escanear la pantalla.
