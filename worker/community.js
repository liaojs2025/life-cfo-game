import { replayPlayerFinish } from '../dist/atlas-engine.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers });
const isId = value => typeof value === 'string' && uuid.test(value);
const hasFields = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).length === keys.length && keys.every(key=>Object.hasOwn(object,key));

// A small edge-local burst guard. Network addresses exist only in this minute's
// in-memory window, never in the database, responses or application logs.
const burst = new Map();
let burstMinute = -1;
function acceptWrite(request) {
  const address = request.headers.get('CF-Connecting-IP');
  if (!address) return true;
  const minute = Math.floor(Date.now() / 60000);
  if (burstMinute !== minute) { burst.clear(); burstMinute = minute; }
  const previous = burst.get(address) || 0;
  if (previous >= 180 || (!previous && burst.size >= 8192)) return false;
  burst.set(address, previous+1);
  return true;
}

async function communitySummary(db) {
  const [counts, recent] = await db.batch([
    db.prepare("SELECT (SELECT COUNT(*) FROM visits) AS views, (SELECT COUNT(*) FROM finishes WHERE outcome='completed') AS completions"),
    db.prepare('SELECT country, edition, outcome, year, wealth, investment_return AS investmentReturn FROM finishes ORDER BY recorded_at DESC, rowid DESC LIMIT 4'),
  ]);
  return { ...counts.results[0], recent: recent.results };
}

// Only simulation inputs cross the wire. Neither the stored results nor the
// public feed contain a player's seed, allocations, visit ID or model settings.
export async function communityRequest(request, db, { allowedOrigins, readBounded }) {
  const origin = request.headers.get('Origin');
  const trusted = allowedOrigins.has(origin);
  const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', Vary:'Origin', ...(trusted ? {'Access-Control-Allow-Origin':origin} : {}) };
  const error = (status, code) => json({ error:code }, status, headers);
  if ((origin && !trusted) || (!trusted && request.method !== 'GET')) return error(403, 'origin');
  if (request.method === 'OPTIONS') {
    if (request.headers.get('Access-Control-Request-Method') !== 'POST' ||
      (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').some(h=>h.trim() && h.trim()!=='content-type')) return error(403,'preflight');
    return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  }
  if (!db) return error(503,'unavailable');
  try {
    if (request.method === 'GET') return json(await communitySummary(db), 200, headers);
    if (request.method !== 'POST') return error(405, 'method');
    if (!acceptWrite(request)) return error(429,'cooldown');
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return error(415, 'json');
    const limit = 4096;
    if (Number(request.headers.get('Content-Length'))>limit) return error(413, 'size');
    let event;
    try { event=JSON.parse(await readBounded(request.body,limit)); }
    catch { return error(400, 'body'); }
    if (!isId(event?.visit)) return error(400, 'visit');
    if (event.type==='view' && hasFields(event,['type','visit'])) {
      await db.prepare('INSERT INTO visits (id) VALUES (?) ON CONFLICT(id) DO NOTHING').bind(event.visit).run();
    } else if (event.type==='finish' && hasFields(event,['type','visit','seed','country','edition','allocations'])) {
      if (!isId(event.seed) || !['us','jp'].includes(event.country) || !['short','full'].includes(event.edition))
        return error(400,'journey');
      const visit = await db.prepare('SELECT 1 AS present FROM visits WHERE id=?').bind(event.visit).first();
      if (!visit) return error(409,'visit_required');
      let result;
      try { result = replayPlayerFinish(event); } catch { return error(422,'unfinished_or_invalid'); }
      const key = new TextEncoder().encode(event.country+'/'+event.edition+'/'+event.seed);
      const run = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',key)),b=>b.toString(16).padStart(2,'0')).join('');
      await db.prepare('INSERT INTO finishes (run,country,edition,outcome,year,wealth,investment_return,recorded_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run) DO NOTHING')
        .bind(run,result.country,result.edition,result.outcome,result.year,result.wealth,result.investmentReturn,Date.now()).run();
    } else return error(400,'event');
    return json(await communitySummary(db),200,headers);
  } catch { return error(503,'unavailable'); }
}
