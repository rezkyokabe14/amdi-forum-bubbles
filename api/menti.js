// GET /api/menti?q=<slide admin key>  ->  { q, type, participants, results:[{text,count}] }
// Reads the same public results that Mentimeter's own "embed live results" page uses.
const SLIDES = {
  '6337g1vhi9mr': { ic: '01a1e260-b7d9-72f8-93c8-3b8ea8988aaa', type: 'word-cloud' },
  '6dyvusju8vm5': { ic: '01a1e260-b833-72d9-a5cb-b4b10b4b052e', type: 'open-ended' },
  'bra3a99sumne': { ic: '01a1e260-b887-77d1-b250-d158e11bb640', type: 'open-ended' },
  'iyq7buw4s9i5': { ic: '01a1e260-b8dc-7701-bb18-de08342de1aa', type: 'open-ended' },
};
const BASE = 'https://www.mentimeter.com/core/presentation/interactive-content/';
const H = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (amdi-forum-bubbles)' };

function pickText(o) {
  if (typeof o === 'string') return o;
  if (!o || typeof o !== 'object') return '';
  for (const k of ['response_text', 'text', 'word', 'value', 'answer', 'label', 'title', 'response']) {
    if (typeof o[k] === 'string' && o[k].trim()) return o[k];
  }
  for (const v of Object.values(o)) if (typeof v === 'string' && v.trim() && !/^[0-9a-f-]{20,}$/i.test(v)) return v;
  return '';
}
function pickCount(o) {
  if (!o || typeof o !== 'object') return 1;
  for (const k of ['response_count', 'count', 'score', 'occurrences', 'votes', 'amount']) if (typeof o[k] === 'number') return o[k];
  return 1;
}
function normalise(j) {
  let arr = Array.isArray(j) ? j : (j && (j.results || j.words || j.responses || j.data)) || [];
  if (!Array.isArray(arr) && typeof arr === 'object') arr = Object.entries(arr).map(([text, count]) => ({ text, count }));
  const out = [];
  for (const it of arr) {
    if (Array.isArray(it)) { out.push({ text: String(it[0] ?? ''), count: Number(it[1]) || 1 }); continue; }
    const text = pickText(it).trim();
    if (text) out.push({ text, count: pickCount(it) });
  }
  return out;
}

module.exports = async (req, res) => {
  const q = String((req.query && req.query.q) || '');
  const s = SLIDES[q];
  if (!s) return res.status(400).json({ error: 'unknown-slide' });
  try {
    const [r1, r2] = await Promise.all([
      fetch(BASE + s.ic + '/text-results', { headers: H }),
      fetch(BASE + s.ic + '/participant-count', { headers: H }),
    ]);
    if (!r1.ok) throw new Error('menti ' + r1.status);
    const j = await r1.json();
    let participants = null;
    try { participants = (await r2.json()).participant_count ?? null; } catch (e) {}
    const debug = req.query && req.query.debug === '1' ? { raw: JSON.stringify(j).slice(0, 2000) } : {};
    res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=10');
    return res.status(200).json({ q, type: s.type, participants, results: normalise(j), ...debug });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'menti-unreachable', detail: String(e.message || e) });
  }
};
module.exports.normalise = normalise;
