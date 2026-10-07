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

  /*
   * Translates a sentence and tells which part of the translation corresponds to `part`
   * (the selected words). The part is wrapped in [brackets] before translating; Google
   * usually keeps them around the translated words. Returns { text, span, provider },
   * with span = the translated part, or null when the brackets didn't survive.
   */
  async function translateInContext(sentence, part) {
    const index = sentence.toLowerCase().indexOf(part.toLowerCase());
    if (index < 0 || /[[\]]/.test(sentence)) return { ...(await translate(sentence)), span: null };

    const marked =
      sentence.slice(0, index) + '[' + sentence.slice(index, index + part.length) + ']' +
      sentence.slice(index + part.length);
    const result = await translate(marked);
    const match = result.text.match(/^([^[\]]*)\[\s*([^[\]]+?)\s*\]([^[\]]*)$/);
    if (match) {
      const text = (match[1] + match[2] + match[3]).replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
      return { text, span: match[2].trim(), provider: result.provider };
    }
    // The markers moved or got lost: keep the translation without them (no extra request).
    const text = result.text.replace(/[[\]]/g, '').replace(/\s{2,}/g, ' ').trim();
    return { text, span: null, provider: result.provider };
  }

  const normalize = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /*
   * Two Spanish words match if equal, if they share a stem of 5+ letters
   * (relacionarse ~ relacionan) or if one is the other plus an ending (base ~ bases).
   */
  function sameWord(a, b) {
    if (a === b) return true;
    const shorter = Math.min(a.length, b.length);
    if (shorter < 4) return false;
    let common = 0;
    while (common < shorter && a[common] === b[common]) common++;
    return common >= 5 || common === shorter;
  }

  /*
   * Finds, inside a translated sentence, the stretch that best matches one of the
   * candidate translations of the selected words. Returns that stretch of the
   * sentence, or null when nothing matches well enough to be sure.
   */
  function locate(sentence, candidates) {
    const words = [...sentence.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
      norm: normalize(m[0]),
      start: m.index,
      end: m.index + m[0].length,
    }));
    let best = null;
    for (const candidate of candidates) {
      const query = (normalize(candidate).match(/[\p{L}\p{N}]+/gu) || []);
      if (!query.length || query.length > 8) continue;
      for (let i = 0; i < words.length; i++) {
        // Walk the sentence from word i, matching the query words in order (one gap allowed).
        let q = 0;
        let first = -1;
        let last = -1;
        let gaps = 0;
        let content = 0;
        for (let j = i; j < words.length && q < query.length && gaps <= 1; j++) {
          if (sameWord(words[j].norm, query[q])) {
            if (first < 0) first = j;
            last = j;
            if (query[q].length >= 4) content++;
            q++;
          } else if (first >= 0) {
            gaps++;
          } else {
            break;
          }
        }
        if (first < 0 || !content) continue;
        const score = q / query.length;
        if (score >= 0.6 && (!best || score > best.score || (score === best.score && last - first < best.last - best.first))) {
          best = { score, first, last };
        }
      }
    }
    return best ? sentence.slice(words[best.first].start, words[best.last].end) : null;
  }

  return { translate, translateInContext, locate };
})();
