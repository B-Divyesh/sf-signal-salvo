import { describe, expect, it } from 'vitest';
import {
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
});
