import { DATA_VERSION, YEARS } from './data.js';
import { newGame, settleYear, restoreGame, validateDecision } from './engine.js';
import { validateDecisionPack, validatePersona } from './ai.js';

const copy = value => JSON.parse(JSON.stringify(value));
const sameDecision = (a, b) => a && b && ['insurance','buyHome','buyCar','choiceId','rebalance'].every(k => a[k] === b[k])
  && Object.keys(a.allocation || {}).every(k => a.allocation[k] === b.allocation?.[k]);

/** Both households advance in local values before the caller commits anything. */
export function settleDuel(player, rival, pack, decision, rounds) {
  if (player.round !== rival.round || rounds.length !== player.round) throw new Error('双方账本回合没有对齐。');
  pack = validateDecisionPack(pack, player, rival);
  if (!validateDecision(player, decision).valid) throw new Error('请先完成有效的玩家决定。');
  const nextPlayer = settleYear(player, decision);
  const nextRival = settleYear(rival, pack.rivalDecision);
  return { player: nextPlayer, rival: nextRival, rounds: [...rounds, copy(pack)] };
}

/** Replay the two paths together; never reconstruct the opponent after seeing results. */
export function restoreDuel(save) {
  if (save?.dataVersion !== DATA_VERSION || !['player','assisted','auto'].includes(save.state?.mode)) throw new Error('存档版本不匹配。');
  const canonicalPlayer = restoreGame(save.state);
  const canonicalRival = restoreGame(save.rivalState);
  if (canonicalPlayer.round !== canonicalRival.round || !Array.isArray(save.agentRounds)
    || save.agentRounds.length !== canonicalPlayer.round) throw new Error('双人存档不完整。');
  let player = newGame(canonicalPlayer.mode), rival = newGame('rival');
  const rounds = [];
  for (let i = 0; i < save.agentRounds.length; i++) {
    const pack = validateDecisionPack(save.agentRounds[i], player, rival);
    if (!sameDecision(pack.rivalDecision, canonicalRival.history[i].decision)) throw new Error('陪练账本与封存决定不一致。');
    player = settleYear(player, canonicalPlayer.history[i].decision);
    rival = settleYear(rival, pack.rivalDecision);
    rounds.push(pack);
  }
  let pack = null;
  if (save.agentPack && player.round < YEARS.length) {
    pack = validateDecisionPack(save.agentPack, player, rival);
  }
  let persona = null;
  if (save.persona && player.round === YEARS.length) {
    try { persona = validatePersona(save.persona, player, rival); } catch { /* A damaged portrait never damages the ledger. */ }
  }
  return { player, rival, rounds, pack, persona };
}
