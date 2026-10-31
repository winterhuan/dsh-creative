/** Replace these rules and story beats with the approved design. */
export const initial = seed => ({ seed, rng: seed, turn: 0, phase: 'playing', energy: 6, progress: 0, outcome: null })
export const choices = state => state.phase === 'ended' ? [] : [
  { id: 'study', label: '调查线索 · 消耗 2，推进 2', value: 2 },
  { id: 'push', label: '冒险突进 · 消耗 3，推进 4 或 1', value: 4 },
  { id: 'rest', label: '休整观察 · 恢复 2，推进 0', value: 0 },
]
export function step(state, id) {
  if (!choices(state).some(choice => choice.id === id)) return state
  const next = { ...state, turn: state.turn + 1, rng: (Math.imul(state.rng, 1664525) + 1013904223) >>> 0 }
  if (id === 'rest') next.energy += 2
  else {
    next.energy -= id === 'push' ? 3 : 2
    next.progress += id === 'push' ? (next.rng % 2 ? 4 : 1) : 2
  }
  if (next.energy < 0 || next.turn >= 4 || next.progress >= 6) {
    next.phase = 'ended'
    next.outcome = next.energy < 0 ? 'exhausted' : next.progress >= 6 ? 'discovery' : 'missed'
  }
  return next
}
