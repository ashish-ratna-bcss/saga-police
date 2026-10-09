/**
 * Which evidence posts belong to the event's own region.
 * A post is "outside the region" only when it names places and every one of them lies outside the region.
 * A post that names no place, or any place inside the region, stays in the region's evidence.
 * In a location report (strict) a post that names no place also stays out unless its words mention the region.
 * Shared by the PDF template and the quality check, so both count the same posts.
 */
const foldGeo = (t) => String(t || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

const classifyEvidence = (ev = [], analysis = null, event = {}, { strict = false } = {}) => {
  const facts = analysis?.facts || null;
  const regionWords = foldGeo(event?.location).split(' ').filter((w) => w.length > 2);
  const factPlaces = facts?.places || [];
  const reliable = Boolean(facts);
  const insideByName = new Map(factPlaces.map((p) => {
    const hay = ` ${foldGeo(`${p.name} ${p.region}`)} `;
    return [foldGeo(p.name), !regionWords.length || regionWords.some((w) => hay.includes(` ${w} `))];
  }));
  const outsideNs = new Set();
  if (reliable) {
    ev.forEach((e) => {
      const names = facts.byPost?.[e.n]?.places || [];
      if (names.length && names.every((nm) => insideByName.get(foldGeo(nm)) === false)) outsideNs.add(e.n);
    });
  }
  // A location report keeps a post that names no place only when its own words mention the region; otherwise it is not about this location.
  if (reliable && strict && regionWords.length) {
    const phrase = foldGeo(event?.location);
    const mentions = (e) => ` ${foldGeo(`${e.text || ''} ${e.english_text || e.englishText || ''}`)} `.includes(` ${phrase} `)
      || regionWords.some((w) => ` ${foldGeo(`${e.text || ''} ${e.english_text || e.englishText || ''}`)} `.includes(` ${w} `));
    ev.forEach((e) => {
      const names = facts.byPost?.[e.n]?.places || [];
      if (!outsideNs.has(e.n) && !names.length && !mentions(e)) outsideNs.add(e.n);
    });
  }
  const outsideNames = factPlaces.filter((p) => insideByName.get(foldGeo(p.name)) === false).map((p) => p.name);
  return {
    reliable,
    outsideNs,
    outsideNames,
    inEv: ev.filter((e) => !outsideNs.has(e.n)),
    outEv: ev.filter((e) => outsideNs.has(e.n)),
  };
};

module.exports = { classifyEvidence, foldGeo };
