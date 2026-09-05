import { describe, expect, it } from 'vitest';
import {
  currentFor,
  initialGame,
  resolveRound,
  sampleOpponentPlan,
  sampleSuggestedPlan,
  validatePlan,
} from './game';

describe('deterministic match engine', () => {
  it('replays the same seed and plans to the same result', () => {
    const play = () => {
      let game = initialGame('SALVO-DEMO-17');
      while (game.status !== 'finished') {
        game = resolveRound(game, {
          A: sampleSuggestedPlan(game.round),
          B: sampleOpponentPlan(game.round),
        });
      }
      return game;
    };
    expect(play()).toEqual(play());
  });

  it('takes the sample run from planning to a real end state', () => {
    let game = initialGame('SALVO-DEMO-17');
    let resolutions = 0;
    while (game.status !== 'finished' && resolutions < 6) {
      game = resolveRound(game, {
        A: sampleSuggestedPlan(game.round),
        B: sampleOpponentPlan(game.round),
      });
      resolutions += 1;
    }
    expect(game.status).toBe('finished');
    expect(game.result).not.toBeNull();
    expect(resolutions).toBeLessThanOrEqual(6);
  });

  it('rejects incomplete plans', () => {
    expect(validatePlan([])).toMatch(/exactly three/i);
    expect(validatePlan(sampleSuggestedPlan(1))).toBeNull();
  });

  it('moves an adjacent line of craft together with the current', () => {
    const seed = Array.from({ length: 100 }, (_, index) => `current-${index}`).find(
      (candidate) => currentFor(candidate, 1) === 'E',
    );
    expect(seed).toBeDefined();
    const game = initialGame(seed!);
    game.crafts.A[0].x = 1;
    game.crafts.A[0].y = 3;
    game.crafts.A[1].x = 2;
    game.crafts.A[1].y = 3;
    game.crafts.B[0].x = 3;
    game.crafts.B[0].y = 3;
    game.crafts.B[1].x = 4;
    game.crafts.B[1].y = 3;
    const holdPlan = [
      { craft: 'Echo' as const, action: 'hold' as const },
      { craft: 'Kilo' as const, action: 'hold' as const },
      { craft: 'Echo' as const, action: 'hold' as const },
    ];

    const resolved = resolveRound(game, { A: holdPlan, B: holdPlan });

    expect(resolved.crafts.A.map((craft) => craft.x)).toEqual([2, 3]);
    expect(resolved.crafts.B.map((craft) => craft.x)).toEqual([4, 5]);
    expect(resolved.lastLog).toContain('The east current shifted 4 craft.');
  });
});
