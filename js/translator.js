/*
 * Translation (English -> Spanish), using free services that need no API key:
 *   - Google Translate public endpoint (with dictionary alternatives for single words)
 *   - MyMemory as a fallback when Google fails or rate-limits
 */
LE.Translator = (() => {
  const SOURCE = 'en';
  const TARGET = 'es';
  const cache = new Map();

  const POS_ES = {
    noun: 'sustantivo',
    verb: 'verbo',
    adjective: 'adjetivo',
    adverb: 'adverbio',
    pronoun: 'pronombre',
    preposition: 'preposición',
    conjunction: 'conjunción',
    interjection: 'interjección',
    article: 'artículo',
    abbreviation: 'abreviatura',
    prefix: 'prefijo',
    suffix: 'sufijo',
    phrase: 'frase',
  };

  async function fetchJSON(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        const error = new Error('HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function viaGoogle(text) {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&dt=bd' +
      `&sl=${SOURCE}&tl=${TARGET}&q=${encodeURIComponent(text)}`;
    const data = await fetchJSON(url);
    const translated = (data.sentences || []).map((s) => s.trans || '').join('').trim();
    if (!translated) throw new Error('Respuesta vacía');
    const alternatives = (data.dict || []).map((d) => ({
      pos: POS_ES[d.pos] || d.pos || '',
      terms: (d.terms || []).slice(0, 6),
    }));
    return { text: translated, alternatives, provider: 'Google Translate' };
  }

  async function viaMyMemory(text) {
    const url =
      'https://api.mymemory.translated.net/get?' +
      `langpair=${SOURCE}|${TARGET}&q=${encodeURIComponent(text.slice(0, 500))}`;
    const data = await fetchJSON(url);
    const status = Number(data.responseStatus);
    const translated = data.responseData && data.responseData.translatedText;
    if (status !== 200 || !translated) {
      throw new Error((translated || data.responseDetails || 'Error de MyMemory').toString());
    }
    return { text: translated, alternatives: [], provider: 'MyMemory' };
  }

  async function translate(text) {
    const key = text.toLowerCase();
    if (cache.has(key)) return cache.get(key);

    const errors = [];
    for (const provider of [viaGoogle, viaMyMemory]) {
      try {
        const result = await provider(text);
        cache.set(key, result);
        return result;
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error('No se pudo traducir (' + errors.join(' · ') + '). ¿Tenés conexión a internet?');
  }

  return { translate };
})();
