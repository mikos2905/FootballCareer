import { CARDS, prepare } from '../../src/engine/decisions/registry';
import { world } from '../lib/run';
import { createCareer } from '../../src/engine/creation';
import { substream, Rng } from '../../src/engine/rng';
import type { Effect } from '../../src/engine/decisions/types';

function describe(e: Effect): string {
  switch (e.kind) {
    case 'immediate': {
      const c = e.change as Record<string, unknown>;
      return Object.entries(c).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
    }
    case 'modifier': {
      const m = e.modifier as unknown as Record<string, unknown>;
      return `mod ${m.channel}=${m.value ?? JSON.stringify(m.attributes)} x${m.seasons}s`;
    }
    case 'delayed':
      return `+${e.seasons}s[ ${e.effects.map(describe).join(' | ')} ]`;
    case 'probabilistic':
      return `p${e.chance}[ ${e.then.map(describe).join(' | ')} ]${e.otherwise ? ` else[ ${e.otherwise.map(describe).join(' | ')} ]` : ''}`;
    default:
      return e.kind;
  }
}

const ids = process.argv.slice(2);
const config = { seed: 7, seedLabel: '7', cadence: 'standard' as const, surname: 'Probe', shirtNumber: 9, foot: 'right' as const, nationId: 'eng', position: 'ST' as const };
const state = createCareer(substream(7, 'creation', 0), config, world);
state.player.age = 26;
state.season = 10;
for (const id of ids) {
  const def = CARDS.find((c) => c.id === id);
  if (!def) { console.log(`?? ${id}`); continue; }
  const ctx = prepare(def, state, world, new Rng(1));
  console.log(`\n== ${id} (${def.category}, ${def.stages.join('/')})`);
  for (const o of def.options(ctx)) {
    console.log(`   ${o.id}: ${o.effects(ctx).map(describe).join('  ;  ') || '(nothing)'}`);
  }
}
