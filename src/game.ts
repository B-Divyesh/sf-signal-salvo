export const BOARD_WIDTH = 8;
export const BOARD_HEIGHT = 7;
export const MAX_ROUNDS = 6;
export const PLAN_SIZE = 3;

export type Player = 'A' | 'B';
export type CraftId = 'Echo' | 'Kilo';
export type Direction = 'N' | 'E' | 'S' | 'W';
export type Action = 'advance' | 'left' | 'right' | 'pulse' | 'sonar' | 'hold';
export type GameStatus = 'planning' | 'finished';
export type Result = Player | 'draw' | null;

export interface Command {
  craft: CraftId;
  action: Action;
}

export interface Craft {
  id: CraftId;
  x: number;
  y: number;
  facing: Direction;
  integrity: number;
}

export interface Contact {
  x: number;
  y: number;
  kind: 'sonar' | 'wake';
}

export interface GameState {
  seed: string;
  round: number;
  status: GameStatus;
  result: Result;
  current: Direction;
  crafts: Record<Player, Craft[]>;
  contacts: Record<Player, Contact[]>;
  lastLog: string[];
}

const vectors: Record<Direction, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
};

const directionNames: Record<Direction, string> = {
  N: 'north',
  E: 'east',
  S: 'south',
  W: 'west',
};

const directionOrder: Direction[] = ['N', 'E', 'S', 'W'];

export function opponent(player: Player): Player {
  return player === 'A' ? 'B' : 'A';
}

export function currentName(direction: Direction): string {
  return directionNames[direction];
}

export function initialGame(seed: string): GameState {
  return {
    seed,
    round: 1,
    status: 'planning',
    result: null,
    current: currentFor(seed, 1),
    crafts: {
      A: [
        { id: 'Echo', x: 1, y: 2, facing: 'E', integrity: 2 },
        { id: 'Kilo', x: 1, y: 5, facing: 'E', integrity: 2 },
      ],
      B: [
        { id: 'Echo', x: 6, y: 2, facing: 'W', integrity: 2 },
        { id: 'Kilo', x: 6, y: 5, facing: 'W', integrity: 2 },
      ],
    },
    contacts: { A: [], B: [] },
    lastLog: ['Round 1 is ready. Queue three commands.'],
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function currentFor(seed: string, round: number): Direction {
  return directionOrder[(hashSeed(seed) + round * 3) % directionOrder.length];
}

function rotate(direction: Direction, amount: -1 | 1): Direction {
  const index = directionOrder.indexOf(direction);
  return directionOrder[(index + amount + directionOrder.length) % directionOrder.length];
}

function inside(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < BOARD_HEIGHT;
}

function liveCrafts(state: GameState): Array<{ player: Player; craft: Craft }> {
  return (['A', 'B'] as Player[]).flatMap((player) =>
    state.crafts[player]
      .filter((craft) => craft.integrity > 0)
      .map((craft) => ({ player, craft })),
  );
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}

function findCraft(state: GameState, player: Player, id: CraftId): Craft | undefined {
  return state.crafts[player].find((craft) => craft.id === id && craft.integrity > 0);
}

function moveAdvancingCrafts(
  state: GameState,
  stepCommands: Record<Player, Command>,
  wakeContacts: Record<Player, Contact[]>,
  log: string[],
): void {
  const occupied = new Set(liveCrafts(state).map(({ craft }) => positionKey(craft.x, craft.y)));
  const proposals = (['A', 'B'] as Player[]).flatMap((player) => {
    const command = stepCommands[player];
    const craft = command.action === 'advance' ? findCraft(state, player, command.craft) : undefined;
    if (!craft) return [];
    const [dx, dy] = vectors[craft.facing];
    return [{ player, craft, x: craft.x + dx, y: craft.y + dy }];
  });
  const duplicateTargets = new Set(
    proposals
      .filter((proposal, index) =>
        proposals.some(
          (other, otherIndex) =>
            otherIndex !== index && other.x === proposal.x && other.y === proposal.y,
        ),
      )
      .map((proposal) => positionKey(proposal.x, proposal.y)),
  );

  for (const proposal of proposals) {
    const target = positionKey(proposal.x, proposal.y);
    if (!inside(proposal.x, proposal.y) || occupied.has(target) || duplicateTargets.has(target)) {
      log.push(`${proposal.player} ${proposal.craft.id} could not advance.`);
      continue;
    }
    wakeContacts[opponent(proposal.player)].push({
      x: proposal.craft.x,
      y: proposal.craft.y,
      kind: 'wake',
    });
    occupied.delete(positionKey(proposal.craft.x, proposal.craft.y));
    proposal.craft.x = proposal.x;
    proposal.craft.y = proposal.y;
    occupied.add(target);
    log.push(`${proposal.player} ${proposal.craft.id} advanced.`);
  }
}

function firstCraftInPulse(
  state: GameState,
  player: Player,
  source: Craft,
): Craft | undefined {
  const [dx, dy] = vectors[source.facing];
  for (let distance = 1; distance <= 3; distance += 1) {
    const x = source.x + dx * distance;
    const y = source.y + dy * distance;
    const target = state.crafts[opponent(player)].find(
      (craft) => craft.integrity > 0 && craft.x === x && craft.y === y,
    );
    if (target) return target;
  }
  return undefined;
}

function applyCurrent(
  state: GameState,
  wakeContacts: Record<Player, Contact[]>,
  log: string[],
): void {
  const [dx, dy] = vectors[state.current];
  const all = liveCrafts(state);
  const occupied = new Set(all.map(({ craft }) => positionKey(craft.x, craft.y)));
  const proposals = all.map(({ player, craft }) => ({
    player,
    craft,
    x: craft.x + dx,
    y: craft.y + dy,
  }));
  const valid = proposals.filter(({ x, y }) => inside(x, y));
  const duplicateTargets = new Set(
    valid
      .filter((proposal, index) =>
        valid.some(
          (other, otherIndex) =>
            otherIndex !== index && other.x === proposal.x && other.y === proposal.y,
        ),
      )
      .map(({ x, y }) => positionKey(x, y)),
  );

  let moved = 0;
  for (const proposal of valid) {
    const target = positionKey(proposal.x, proposal.y);
    const ownPosition = positionKey(proposal.craft.x, proposal.craft.y);
    const targetWillLeave = proposals.some(
      (other) => positionKey(other.craft.x, other.craft.y) === target && inside(other.x, other.y),
    );
    if (duplicateTargets.has(target) || (occupied.has(target) && !targetWillLeave)) continue;
    wakeContacts[opponent(proposal.player)].push({
      x: proposal.craft.x,
      y: proposal.craft.y,
      kind: 'wake',
    });
    occupied.delete(ownPosition);
    proposal.craft.x = proposal.x;
    proposal.craft.y = proposal.y;
    occupied.add(target);
    moved += 1;
  }
  log.push(`The ${currentName(state.current)} current shifted ${moved} craft.`);
}

function totalIntegrity(state: GameState, player: Player): number {
  return state.crafts[player].reduce((total, craft) => total + craft.integrity, 0);
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function resolveRound(
  previous: GameState,
  plans: Record<Player, Command[]>,
): GameState {
  if (previous.status !== 'planning') throw new Error('The match has already ended.');
  for (const player of ['A', 'B'] as Player[]) {
    if (plans[player].length !== PLAN_SIZE) throw new Error(`${player} needs three commands.`);
  }

  const state = cloneState(previous);
  const log = [`Round ${state.round} plans revealed.`];
  const newContacts: Record<Player, Contact[]> = { A: [], B: [] };

  for (let step = 0; step < PLAN_SIZE; step += 1) {
    const stepCommands: Record<Player, Command> = {
      A: plans.A[step],
      B: plans.B[step],
    };

    for (const player of ['A', 'B'] as Player[]) {
      const command = stepCommands[player];
      const craft = findCraft(state, player, command.craft);
      if (!craft) continue;
      if (command.action === 'left') {
        craft.facing = rotate(craft.facing, -1);
        log.push(`${player} ${craft.id} turned left.`);
      }
      if (command.action === 'right') {
        craft.facing = rotate(craft.facing, 1);
        log.push(`${player} ${craft.id} turned right.`);
      }
      if (command.action === 'hold') log.push(`${player} ${craft.id} held position.`);
    }

    moveAdvancingCrafts(state, stepCommands, newContacts, log);

    const hits: Array<{ player: Player; target: Craft }> = [];
    for (const player of ['A', 'B'] as Player[]) {
      const command = stepCommands[player];
      const craft = findCraft(state, player, command.craft);
      if (!craft) continue;
      if (command.action === 'pulse') {
        const target = firstCraftInPulse(state, player, craft);
        if (target) {
          hits.push({ player, target });
          log.push(`${player} ${craft.id} connected a pulse with ${opponent(player)} ${target.id}.`);
        } else {
          log.push(`${player} ${craft.id} sent a pulse with no contact.`);
        }
      }
      if (command.action === 'sonar') {
        const contacts = state.crafts[opponent(player)]
          .filter(
            (target) =>
              target.integrity > 0 &&
              Math.abs(target.x - craft.x) + Math.abs(target.y - craft.y) <= 3,
          )
          .map<Contact>((target) => ({ x: target.x, y: target.y, kind: 'sonar' }));
        newContacts[player].push(...contacts);
        log.push(`${player} ${craft.id} found ${contacts.length} sonar contact${contacts.length === 1 ? '' : 's'}.`);
      }
    }
    for (const hit of hits) hit.target.integrity = Math.max(0, hit.target.integrity - 1);
  }

  applyCurrent(state, newContacts, log);
  state.contacts = {
    A: uniqueContacts(newContacts.A),
    B: uniqueContacts(newContacts.B),
  };
  state.lastLog = log;

  const aIntegrity = totalIntegrity(state, 'A');
  const bIntegrity = totalIntegrity(state, 'B');
  const lastRound = state.round >= MAX_ROUNDS;
  if (aIntegrity === 0 || bIntegrity === 0 || lastRound) {
    state.status = 'finished';
    state.result = aIntegrity === bIntegrity ? 'draw' : aIntegrity > bIntegrity ? 'A' : 'B';
    state.lastLog.push(
      state.result === 'draw'
        ? 'The match ended in a draw.'
        : `Player ${state.result} won the match.`,
    );
  } else {
    state.round += 1;
    state.current = currentFor(state.seed, state.round);
    state.lastLog.push(`Round ${state.round} is ready.`);
  }
  return state;
}

function uniqueContacts(contacts: Contact[]): Contact[] {
  const unique = new Map<string, Contact>();
  for (const contact of contacts) unique.set(`${contact.x}:${contact.y}:${contact.kind}`, contact);
  return [...unique.values()];
}

export function sampleOpponentPlan(round: number): Command[] {
  if (round === 1) {
    return [
      { craft: 'Echo', action: 'advance' },
      { craft: 'Kilo', action: 'advance' },
      { craft: 'Echo', action: 'sonar' },
    ];
  }
  return [
    { craft: 'Echo', action: 'pulse' },
    { craft: 'Kilo', action: 'hold' },
    { craft: 'Echo', action: 'sonar' },
  ];
}

export function sampleSuggestedPlan(round: number): Command[] {
  if (round === 1) return sampleOpponentPlan(round);
  return [
    { craft: 'Echo', action: 'pulse' },
    { craft: 'Kilo', action: 'pulse' },
    { craft: 'Echo', action: 'sonar' },
  ];
}

export function actionLabel(action: Action): string {
  const labels: Record<Action, string> = {
    advance: 'Advance',
    left: 'Turn left',
    right: 'Turn right',
    pulse: 'Send pulse',
    sonar: 'Use sonar',
    hold: 'Hold position',
  };
  return labels[action];
}

export function validatePlan(plan: Command[]): string | null {
  if (plan.length !== PLAN_SIZE) return 'Queue exactly three commands before locking the plan.';
  return null;
}
