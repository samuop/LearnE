# LearnE

Lector de PDFs en inglés para estudiar y aprender inglés al mismo tiempo.
Abrís tu libro, hacés **doble clic en una palabra** (o seleccionás una frase u oración)
y al costado aparece la traducción al español, la pronunciación y la definición en inglés.

Funciona en el navegador, sin instalar nada. **Tu PDF no se sube a ningún lado**: se abre en tu computadora.

## Qué hace

- **Traducción al instante** de palabras, frases u oraciones seleccionadas.
- Para palabras sueltas: **significados según el tipo de palabra** (sustantivo, verbo…)
  y **pronunciación** (🔊 normal y 🐢 lenta).
- **La oración donde aparece** la palabra, traducida automáticamente: muestra qué significa la palabra en ese contexto.
  Al guardar la palabra se guarda también esa traducción, y aparece al dar vuelta la tarjeta.
- **Modo práctica**: la traducción aparece borrosa hasta que hacés clic, para que primero intentes entenderla vos.
- **Vocabulario por PDF**: guardá con ☆ las palabras que te cuestan (se guarda la oración y la página).
  Cada PDF tiene su propio vocabulario y sus propias tarjetas.
- **Palabras resaltadas**: las que ya guardaste aparecen marcadas en el PDF; tocá una para ver su traducción.
- **Repasar** con tarjetas: **este PDF**, **guardadas hoy** (de este PDF) o **todos mis PDFs**.
  Las que marcás como "no la sabía" vuelven a salir antes.
- **Exportar** el vocabulario del PDF a CSV (se puede importar en Anki).
- **Copia de seguridad**: descargá un archivo con el vocabulario y el progreso de todos tus PDFs
  y restauralo en otro navegador o dispositivo.
- **Seguir leyendo**: recuerda tus PDFs y la página donde quedaste.
  En Chrome o Edge de computadora no se copia nada: el PDF se reabre desde donde está (a lo sumo te pide permiso).
  En el celular y en otros navegadores se guarda una copia **solo del PDF abierto** para que vuelva solo al recargar;
  al abrir otro, esa copia se reemplaza. Los demás libros de la lista se abren eligiendo el archivo de nuevo.
- Zoom con dos dedos en el celular, o con Ctrl + rueda / pellizco del touchpad en la compu.

## Cómo abrirla

**Opción A: publicada automáticamente con GitHub Pages (recomendada, sirve también para el celular)**

1. Este repo incluye el workflow `.github/workflows/pages.yml`, que publica automáticamente el contenido de la raíz en cada `push` a `main`.
2. En GitHub, entrá a tu repo → **Settings** → **Pages**.
3. En *Build and deployment*, elegí **GitHub Actions** como *Source*. Guardá.
4. Después de cada push a `main`, la app se publica en `https://samuop.github.io/LearnE/`.

**Opción B: en tu computadora**

Descargá el repo (botón **Code → Download ZIP**), descomprimilo y abrí `index.html` con doble clic.

## Limitaciones

- La traducción **necesita internet**. Leer el PDF funciona sin conexión.
- Los PDFs **escaneados** (fotos de páginas) no tienen texto seleccionable, así que no se pueden traducir.
- El servicio de Google que usa no es oficial y puede limitar si hacés muchísimas consultas seguidas.
  En ese caso usa MyMemory como respaldo automático.
- El vocabulario se guarda **en el navegador** donde lo usás. Para pasarlo a otro navegador o dispositivo,
  usá **Copia de seguridad** (pestaña Vocabulario).
- Cada PDF se reconoce por su nombre y tamaño: si le cambiás el nombre al archivo, se toma como un PDF nuevo.

## Detalles técnicos

- HTML, CSS y JavaScript sin frameworks ni compilación.
- [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 (incluido en `vendor/pdfjs`, licencia Apache 2.0) para mostrar el PDF.
- Traducción: Google Translate (endpoint público) con MyMemory de respaldo.
- Voz: la síntesis de voz del navegador.
- Vocabulario: `localStorage` del navegador.

```
index.html        estructura de la página
css/styles.css    estilos (modo claro/oscuro y vista para celular)
js/util.js        utilidades (DOM, limpieza de texto, voz)
js/translator.js  traducción
js/vocab.js       vocabulario y repaso espaciado
js/library.js     PDFs recientes (sin copiar el archivo; acceso al archivo en Chrome/Edge)
js/highlight.js   resaltado de las palabras guardadas en el PDF
js/panel.js       panel lateral (traducción, vocabulario, tarjetas)
js/viewer.js      visor de PDF
js/app.js         une todo: abrir archivos, selección de texto, navegación
```
