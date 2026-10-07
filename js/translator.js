/*
 * Translation (English -> Spanish) and English dictionary lookups.
 * Uses free services that need no API key:
 *   - Google Translate public endpoint (with dictionary alternatives for single words)
 *   - MyMemory as a fallback when Google fails or rate-limits
 *   - dictionaryapi.dev for English definitions, IPA and pronunciation audio
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

  /* Naive English lemmatizer: candidates to try when the exact form is not in the dictionary. */
  function lemmaCandidates(word) {
    const w = word.toLowerCase();
    const out = [w];
    const add = (c) => c.length > 2 && !out.includes(c) && out.push(c);
    if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
    if (w.endsWith('es')) add(w.slice(0, -2));
    if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
    if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
    if (w.endsWith('ed')) {
      add(w.slice(0, -2));
      add(w.slice(0, -1));
      if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
    }
    if (w.endsWith('ing')) {
      add(w.slice(0, -3));
      add(w.slice(0, -3) + 'e');
      if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
    }
    if (w.endsWith('ly')) add(w.slice(0, -2));
    return out.slice(0, 5);
  }

  async function define(word) {
    const key = 'def:' + word.toLowerCase();
    if (cache.has(key)) return cache.get(key);

    for (const candidate of lemmaCandidates(word)) {
      try {
        const entries = await fetchJSON(
          'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(candidate),
          7000
        );
        if (!Array.isArray(entries) || !entries.length) continue;
        const phonetics = entries.flatMap((e) => e.phonetics || []);
        const result = {
          word: entries[0].word,
          phonetic: entries[0].phonetic || (phonetics.find((p) => p.text) || {}).text || '',
          audio: (phonetics.find((p) => p.audio) || {}).audio || '',
          meanings: entries
            .flatMap((e) => e.meanings || [])
            .map((m) => ({
              pos: POS_ES[m.partOfSpeech] || m.partOfSpeech,
              definitions: (m.definitions || []).slice(0, 3).map((d) => ({
                definition: d.definition,
                example: d.example || '',
              })),
            }))
            .slice(0, 4),
        };
        cache.set(key, result);
        return result;
      } catch (error) {
        if (error.status !== 404) break;
      }
    }
    cache.set(key, null);
    return null;
  }

  return { translate, define };
})();
