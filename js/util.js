/* Small DOM and text helpers shared by the other scripts. */
window.LE = window.LE || {};

LE.el = function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children || [])) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

/* Joins words broken across lines ("statis- tics") and collapses whitespace. */
LE.cleanText = function cleanText(text) {
  return text
    .replace(/­/g, '')
    .replace(/([a-z])-\s+([a-z])/g, '$1$2')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
};

/* A single English word (letters, apostrophes and inner hyphens only). */
LE.isSingleWord = function isSingleWord(text) {
  return /^[A-Za-z][A-Za-z'-]*$/.test(text) && text.length <= 40;
};

/* Strips punctuation that double-click or drag selection tends to grab. */
LE.trimPunctuation = function trimPunctuation(text) {
  return text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
};

LE.storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Storage full or blocked: the app still works, it just won't remember. */
    }
  },
};

/* Text-to-speech with the browser's built-in English voice. */
LE.speak = function speak(text, rate) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate || 0.95;
  const voices = speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang === 'en-US' && /Google|Natural|Samantha/i.test(v.name)) ||
    voices.find((v) => v.lang === 'en-US') ||
    voices.find((v) => v.lang && v.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
};
