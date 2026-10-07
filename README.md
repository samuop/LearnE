# LearnE

Lector de PDFs en inglés para estudiar y aprender inglés al mismo tiempo.
Abrís tu libro, hacés **doble clic en una palabra** (o seleccionás una frase u oración)
y al costado aparece la traducción al español, la pronunciación y la definición en inglés.

Funciona en el navegador, sin instalar nada. **Tu PDF no se sube a ningún lado**: se abre en tu computadora.

## Qué hace

- **Traducción al instante** de palabras, frases u oraciones seleccionadas.
- Para palabras sueltas: **significados según el tipo de palabra** (sustantivo, verbo…),
  **pronunciación** (🔊 normal y 🐢 lenta), símbolo fonético y **definición en inglés**.
- **La oración donde aparece** la palabra, con botón para traducirla entera.
- **Modo práctica**: la traducción aparece borrosa hasta que hacés clic, para que primero intentes entenderla vos.
- **Vocabulario**: guardá con ☆ las palabras que te cuestan (se guarda la oración y la página).
- **Repasar** con tarjetas: elegís repasar las palabras **de este PDF**, **guardadas hoy** o **todas**.
  Las que marcás como "no la sabía" vuelven a salir antes.
- **Exportar** el vocabulario a CSV (se puede importar en Anki).
- Recuerda en qué página te quedaste en cada PDF.

## Cómo abrirla

**Opción A: publicada automáticamente con GitHub Pages (recomendada, sirve también para el celular)**

1. Este repo incluye el workflow `.github/workflows/pages.yml`, que publica automáticamente el contenido de la raíz en cada `push` a `main`.
2. En GitHub, entrá a tu repo → **Settings** → **Pages**.
3. En *Build and deployment*, elegí **GitHub Actions** como *Source*. Guardá.
4. Después de cada push a `main`, la app se publica en `https://samuop.github.io/LearnE/`.

**Opción B: en tu computadora**

Descargá el repo (botón **Code → Download ZIP**), descomprimilo y abrí `index.html` con doble clic.

## Limitaciones

- La traducción y el diccionario **necesitan internet**. Leer el PDF funciona sin conexión.
- Los PDFs **escaneados** (fotos de páginas) no tienen texto seleccionable, así que no se pueden traducir.
- El servicio de Google que usa no es oficial y puede limitar si hacés muchísimas consultas seguidas.
  En ese caso usa MyMemory como respaldo automático.
- El vocabulario se guarda **en el navegador** donde lo usás. Si cambiás de navegador o de dispositivo,
  no se pasa solo (podés exportarlo a CSV).

## Detalles técnicos

- HTML, CSS y JavaScript sin frameworks ni compilación.
- [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 (incluido en `vendor/pdfjs`, licencia Apache 2.0) para mostrar el PDF.
- Traducción: Google Translate (endpoint público) con MyMemory de respaldo.
- Definiciones y fonética: [Free Dictionary API](https://dictionaryapi.dev/).
- Voz: la síntesis de voz del navegador.
- Vocabulario: `localStorage` del navegador.

```
index.html        estructura de la página
css/styles.css    estilos (modo claro/oscuro y vista para celular)
js/util.js        utilidades (DOM, limpieza de texto, voz)
js/translator.js  traducción y diccionario
js/vocab.js       vocabulario y repaso espaciado
js/panel.js       panel lateral (traducción, vocabulario, tarjetas)
js/viewer.js      visor de PDF
js/app.js         une todo: abrir archivos, selección de texto, navegación
```
