import { relayURLForLocation } from './providers.js';
import { ASSET_KEYS } from './atlas-scenarios.js';

const prefix = 'life-cfo-result-outbox-';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// One visit per document load. The same random ID is retained for any network
// retry. Only a compact, anonymous player allocation history goes in the outbox.
export function startCommunity(onChange) {
  const visit = crypto.randomUUID();
  const url = relayURLForLocation()?.replace(/\/ai$/, '/community');
  const pending = new Map();
  let viewRecorded = false, active = false, retryTimer = null, attempts = 0;
  let summary = null, lastRead = 0;
  try {
    for (const key of Object.keys(localStorage).filter(k=>k.startsWith(prefix))) {
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (item && uuid.test(item.seed) && key === prefix+item.seed &&
          ['us','jp'].includes(item.country) && ['full','short'].includes(item.edition) &&
          Array.isArray(item.allocations) && item.allocations.length<=40 &&
          item.allocations.every(row=>Array.isArray(row) && row.length===ASSET_KEYS.length &&
            row.every(weight=>Number.isInteger(weight) && weight>=0 && weight<=100))) pending.set(item.seed,item);
      } catch {}
    }
  } catch {}

  async function send(body) {
    const options = { credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(10000) };
    if (body) Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const response = await fetch(url,options);
    if (!response.ok) {
      const error = new Error('统计同步失败');
      error.status = response.status;
      throw error;
    }
    const value = await response.json();
    if (!Number.isSafeInteger(value.views) || !Number.isSafeInteger(value.completions) || !Array.isArray(value.recent))
      throw new Error('统计数据无效');
    summary = value;
    lastRead = Date.now();
  }

  function remove(seed) {
    pending.delete(seed);
    try { localStorage.removeItem(prefix+seed); } catch {}
  }

  async function sync(readLatest=false) {
    if (active || !url) return;
    clearTimeout(retryTimer);
    active = true;
    try {
      if (readLatest && viewRecorded && (!pending.size || !Array.isArray(summary?.leaderboard))) await send(null);
      if (!viewRecorded) {
        await send({type:'view', visit});
        viewRecorded = true;
        onChange(summary,false);
      }
      for (const [seed,item] of pending) {
        // A newly completed run keeps its device time while the score service rolls out.
        if (item.finishedAt && !Array.isArray(summary?.leaderboard)) throw new Error('等待成绩服务更新');
        const event = {type:'finish',visit,seed:item.seed,country:item.country,edition:item.edition,allocations:item.allocations};
        if (Number.isSafeInteger(item.finishedAt) && item.finishedAt>0) event.finishedAt=item.finishedAt;
        try { await send(event); remove(seed); }
        catch (e) {
          if (e.status===400 || e.status===422) { remove(seed); continue; }
          if (e.status===409) viewRecorded = false;
          throw e;
        }
      }
      attempts = 0;
      onChange(summary,false);
    } catch {
      onChange(summary,true);
      if (attempts<3) retryTimer = setTimeout(()=>sync(true), [3000,10000,30000][attempts++]);
    } finally { active = false; }
  }
  window.addEventListener('online',()=>{attempts=0; void sync(true);});
  void sync();
  return { retry:()=>sync(true), refresh:()=>{ if (Date.now()-lastRead>=5000) void sync(true); }, finish(state) {
    if (!state.finished || !uuid.test(state.seed) || pending.has(state.seed)) return;
    const item = { finishedAt:Date.now(), seed:state.seed, country:state.country, edition:state.edition,
      allocations:state.history.map(r=>ASSET_KEYS.map(key=>r.playerAllocation[key])) };
    pending.set(item.seed,item);
    try { localStorage.setItem(prefix+item.seed,JSON.stringify(item)); } catch {}
    void sync();
  }};
}
