import './styles.css';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PLAN_SIZE,
  actionLabel,
  currentName,
  initialGame,
  resolveRound,
  sampleOpponentPlan,
  sampleSuggestedPlan,
  validatePlan,
  type Action,
  type Command,
  type Contact,
  type Craft,
  type CraftId,
  type Direction,
  type GameState,
  type Player,
} from './game';

type Mode = 'idle' | 'demo' | 'online';
type RoomPhase = 'waiting' | 'planning' | 'finished';
type ResultText = 'win' | 'loss' | 'draw' | null;

interface Settings {
  sound: boolean;
  motion: boolean;
}

interface RoomView {
  code: string;
  player: Player;
  phase: RoomPhase;
  round: number;
  current: Direction;
  deadlineMs: number | null;
  own: Craft[];
  contacts: Contact[];
  opponentIntegrity: Array<{ id: CraftId; integrity: number }>;
  queueLocked: boolean;
  result: ResultText;
  lastLog: string[];
}

interface RoomSession {
  code: string;
  token: string;
}

declare global {
  interface Window {
    signalSalvoMetrics: { fps: number; fixedUpdates: number };
  }
}

const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8787'
  : 'https://signal-salvo-realtime.sociobot.in';
const REAL_SESSION_KEY = 'signal-salvo:real-session';
const REAL_SETTINGS_KEY = 'signal-salvo:settings';
const DEMO_SETTINGS_KEY = 'demo:signal-salvo:settings';
const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('The application root is missing.');
const app: HTMLDivElement = appRoot;

let mode: Mode = window.location.pathname === '/demo' ? 'demo' : 'idle';
let demoGame: GameState = initialGame('SALVO-DEMO-17');
let roomView: RoomView | null = null;
let roomSession: RoomSession | null = mode === 'demo' ? null : loadRoomSession();
let queue: Command[] = [];
let selectedCraft: CraftId = 'Echo';
let boardCursor = 0;
let statusMessage = '';
let errorMessage = '';
let settings = loadSettings();
let pollTimer: number | null = null;
let roomOperation: Promise<void> = Promise.resolve();
let dialogReturnFocus: HTMLElement | null = null;

window.signalSalvoMetrics = { fps: 0, fixedUpdates: 0 };

function settingsKey(): string {
  return mode === 'demo' ? DEMO_SETTINGS_KEY : REAL_SETTINGS_KEY;
}

function loadSettings(): Settings {
  const key = window.location.pathname === '/demo' ? DEMO_SETTINGS_KEY : REAL_SETTINGS_KEY;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Settings>;
    return { sound: parsed.sound === true, motion: parsed.motion !== false };
  } catch {
    return { sound: false, motion: true };
  }
}

function saveSettings(): void {
  localStorage.setItem(settingsKey(), JSON.stringify(settings));
  document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
}

function loadRoomSession(): RoomSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(REAL_SESSION_KEY) ?? 'null') as RoomSession | null;
    if (!parsed?.code || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveRoomSession(session: RoomSession | null): void {
  roomSession = session;
  if (session) localStorage.setItem(REAL_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(REAL_SESSION_KEY);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

function navigate(path: string): void {
  window.history.pushState({}, '', path);
  route(true);
}

function route(moveFocus = false): void {
  stopPolling();
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/demo') {
    if (mode !== 'demo') {
      demoGame = initialGame('SALVO-DEMO-17');
      queue = [];
      selectedCraft = 'Echo';
      statusMessage = 'Sample match loaded. Queue three commands or use the sample plan.';
      errorMessage = '';
    }
    mode = 'demo';
    roomSession = null;
    roomView = null;
    settings = loadSettings();
    document.title = 'Demo — Signal Salvo';
    setCanonical('/demo');
    renderGamePage(true);
  } else if (path === '/') {
    leaveDemoNamespace();
    settings = loadSettings();
    document.title = 'Signal Salvo — plan a two-player tactics match';
    setCanonical('/');
    renderGamePage(false);
    const inviteCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
    if (!inviteCode || roomSession?.code === inviteCode) void resumeRoom();
  } else if (path === '/privacy') {
    leaveDemoNamespace();
    document.title = 'Privacy — Signal Salvo';
    setCanonical('/privacy');
    renderInfoPage('privacy');
  } else if (path === '/terms') {
    leaveDemoNamespace();
    document.title = 'Terms — Signal Salvo';
    setCanonical('/terms');
    renderInfoPage('terms');
  } else {
    leaveDemoNamespace();
    document.title = 'Page not found — Signal Salvo';
    setCanonical(path);
    renderNotFound();
  }
  document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
  if (moveFocus) {
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('h1');
      heading?.focus();
      announce(document.title);
    });
  }
}

function leaveDemoNamespace(): void {
  if (mode !== 'demo') return;
  localStorage.removeItem(DEMO_SETTINGS_KEY);
  demoGame = initialGame('SALVO-DEMO-17');
  queue = [];
  roomView = null;
  roomSession = loadRoomSession();
  mode = 'idle';
  settings = loadSettings();
}

function setCanonical(path: string): void {
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute(
    'href',
    `https://signal-salvo.sociobot.in${path}`,
  );
}

function shell(content: string): string {
  const currentPath = window.location.pathname;
  return `
    <a class="skip-link" href="#main">Skip to the game</a>
    <header class="site-header">
      <a class="wordmark" href="/" data-route aria-label="Signal Salvo home">
        <span class="wordmark-mark" aria-hidden="true"></span>
        Signal Salvo
      </a>
      <nav aria-label="Main navigation">
        <a href="/" data-route ${currentPath === '/' ? 'aria-current="page"' : ''}>Home</a>
        <a href="/demo" data-route ${currentPath === '/demo' ? 'aria-current="page"' : ''}>Demo</a>
        <a href="/privacy" data-route ${currentPath === '/privacy' ? 'aria-current="page"' : ''}>Privacy</a>
      </nav>
      <button class="quiet-button settings-button" type="button" data-open-settings>Settings</button>
    </header>
    ${content}
    <footer class="site-footer">
      <p>Queue three commands with a friend, then reveal both plans.</p>
      <div class="footer-links">
        <a href="/privacy" data-route>Privacy</a>
        <a href="/terms" data-route>Terms</a>
        <a href="https://sociobot.in">Built by Param Factory <span class="sr-only">(external site)</span></a>
      </div>
      <p>Original generated scenery is disclosed in the design record. Build 1.0.0</p>
    </footer>
    <div class="route-announcer sr-only" aria-live="polite"></div>
    ${settingsDialog()}
  `;
}

function renderGamePage(demoRoute: boolean, nextFocus?: string): void {
  const focusSelector = nextFocus ?? activeControlSelector();
  if (demoRoute && mode !== 'demo') mode = 'demo';
  const demoBanner = mode === 'demo' ? demoBannerHtml() : '';
  const title = demoRoute ? 'Play a sample six-round tactics match' : 'Play a six-round tactics match';
  const intro = demoRoute
    ? 'Use a fixed opponent to learn the three-command turn before inviting a friend.'
    : 'For two friends on a call who want tactics without downloads, accounts, or twitch reflexes.';
  app.innerHTML = shell(`
    ${demoBanner}
    <main id="main">
      <section class="first-screen" aria-labelledby="page-title">
        <div class="intro-sheet">
          <p class="eyebrow">Two-player browser tactics</p>
          <h1 id="page-title" tabindex="-1">${title}</h1>
          <p class="lede">${intro}</p>
          <div class="primary-actions">
            <button class="primary-button" type="button" data-start-demo>Try it with sample data</button>
            <span>Starts a fixed match against a sample opponent.</span>
          </div>
          <ul class="plain-facts" aria-label="Game facts">
            <li>Free to play</li>
            <li>No account</li>
            <li>Sample stays on this device</li>
          </ul>
        </div>
        ${gamePanelHtml()}
        ${mode === 'demo' ? '' : roomEntryHtml()}
      </section>
      <section class="how-section" aria-labelledby="how-title">
        <div>
          <p class="section-number" aria-hidden="true">01</p>
          <h2 id="how-title">How the match works</h2>
        </div>
        <ol class="steps">
          <li><strong>Queue three commands.</strong><span>Choose a craft, then add movement, sonar, or pulse commands.</span></li>
          <li><strong>Lock both plans.</strong><span>Neither player can see the other plan before both are ready.</span></li>
          <li><strong>Read the result.</strong><span>Wakes, sonar contacts, and integrity changes guide the next round.</span></li>
        </ol>
      </section>
      <section class="boundaries-section" aria-labelledby="boundaries-title">
        <div class="paper-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <p class="section-number" aria-hidden="true">02</p>
          <h2 id="boundaries-title">What the game does not include</h2>
          <p>Signal Salvo has no accounts, ranking, matchmaking, progression, purchases, or realistic conflict imagery.</p>
          <p>The sample match stays in a separate browser namespace. Online room state goes only to the product-owned room service.</p>
          <a href="/privacy" data-route>Read the privacy details</a>
        </div>
      </section>
    </main>
  `);
  bindCommonEvents();
  bindGameEvents();
  updateCountdown();
  restoreGameFocus(focusSelector);
}

function activeControlSelector(): string | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !app.contains(active)) return undefined;
  const attributes = [
    'data-command',
    'data-select-craft',
    'data-remove-command',
    'data-cell',
    'data-lock-plan',
    'data-clear-plan',
    'data-sample-plan',
    'data-create-room',
    'data-copy-invite',
    'data-leave-room',
    'data-rematch',
    'data-reset-demo',
    'data-start-real',
    'data-start-demo',
    'data-join-room',
    'data-open-settings',
  ];
  for (const attribute of attributes) {
    if (!active.hasAttribute(attribute)) continue;
    const value = active.getAttribute(attribute);
    return value ? `[${attribute}="${CSS.escape(value)}"]` : `[${attribute}]`;
  }
  return active.id ? `#${CSS.escape(active.id)}` : undefined;
}

function restoreGameFocus(selector?: string): void {
  if (!selector) return;
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(selector);
    if (target instanceof HTMLButtonElement && target.disabled) {
      document.querySelector<HTMLElement>('#planner-title, #end-title, #game-title')?.focus({ preventScroll: true });
      return;
    }
    target?.focus({ preventScroll: true });
  });
}

function roomEntryHtml(): string {
  const inviteCode = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
  return `
    <div class="room-entry" aria-labelledby="room-entry-title">
      <h2 id="room-entry-title">Play with a friend</h2>
      <button class="secondary-button" type="button" data-create-room>Create a room</button>
      <form data-join-form>
        <label for="room-code">Room code</label>
        <div class="join-row">
          <input id="room-code" name="roomCode" value="${escapeHtml(inviteCode)}" minlength="5" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" required aria-describedby="room-code-help app-error" aria-invalid="${errorMessage ? 'true' : 'false'}" />
          <button class="quiet-button" type="submit" data-join-room>Join room</button>
        </div>
        <span id="room-code-help">Enter the five letters from your friend.</span>
      </form>
    </div>
  `;
}

function demoBannerHtml(): string {
  return `
    <aside class="demo-banner" aria-label="Demo status">
      <strong>Demo — sample data, nothing is saved</strong>
      <div>
        <button class="text-button" type="button" data-reset-demo>Reset demo</button>
        <button class="text-button" type="button" data-start-real>Start for real</button>
      </div>
    </aside>
  `;
}

function viewModel(): RoomView {
  if (mode === 'online' && roomView) return roomView;
  const game = demoGame;
  const own = game.crafts.A;
  const result: ResultText =
    game.result === null ? null : game.result === 'draw' ? 'draw' : game.result === 'A' ? 'win' : 'loss';
  return {
    code: mode === 'demo' ? 'SAMPLE' : 'PREVIEW',
    player: 'A',
    phase: game.status === 'finished' ? 'finished' : 'planning',
    round: game.round,
    current: game.current,
    deadlineMs: null,
    own,
    contacts: game.contacts.A,
    opponentIntegrity: game.crafts.B.map(({ id, integrity }) => ({ id, integrity })),
    queueLocked: false,
    result,
    lastLog: game.lastLog,
  };
}

function gamePanelHtml(): string {
  const view = viewModel();
  if (!view.own.some((craft) => craft.id === selectedCraft && craft.integrity > 0)) {
    selectedCraft = view.own.find((craft) => craft.integrity > 0)?.id ?? 'Echo';
  }
  const isPlayable = mode !== 'idle' && view.phase !== 'waiting' && view.phase !== 'finished';
  const heading =
    mode === 'idle'
      ? 'Game preview'
      : view.phase === 'waiting'
        ? `Room ${escapeHtml(view.code)} is waiting`
        : view.phase === 'finished'
          ? 'Match result'
          : `Round ${view.round} of 6`;
  return `
    <section class="game-shell" aria-labelledby="game-title" data-mode="${mode}">
      <div class="game-topline">
        <div>
          <p class="game-kicker">${mode === 'online' ? `Room ${escapeHtml(view.code)}` : mode === 'demo' ? 'Sample match' : 'Live board'}</p>
          <h2 id="game-title">${heading}</h2>
        </div>
        <div class="round-dial" aria-label="${view.phase === 'finished' ? 'Match ended' : `Round ${view.round} of 6`}">
          <strong>${view.phase === 'finished' ? 'END' : view.round}</strong>
          <span>${view.phase === 'finished' ? 'complete' : 'of 6'}</span>
        </div>
      </div>
      ${view.phase === 'waiting' ? waitingRoomHtml(view) : boardAndControlsHtml(view, isPlayable)}
      <div class="message-stack">
        <p class="status-message" role="status" aria-live="polite">${escapeHtml(statusMessage)}</p>
        <p class="error-message" id="app-error" role="alert">${escapeHtml(errorMessage)}</p>
      </div>
    </section>
  `;
}

function waitingRoomHtml(view: RoomView): string {
  const inviteUrl = `${window.location.origin}/?room=${view.code}`;
  return `
    <div class="waiting-room">
      <p>Share this code with one friend. The board opens when they join.</p>
      <output class="room-code-output" aria-label="Room code">${escapeHtml(view.code)}</output>
      <button class="primary-button" type="button" data-copy-invite data-invite="${escapeHtml(inviteUrl)}">Copy invite link</button>
      <button class="text-button" type="button" data-leave-room>Leave room</button>
    </div>
  `;
}

function boardAndControlsHtml(view: RoomView, isPlayable: boolean): string {
  return `
    <div class="game-status" aria-label="Current match state">
      <span><b>Current</b> ${currentArrow(view.current)} ${currentName(view.current)}</span>
      <span><b>Plan</b> ${view.queueLocked ? 'locked' : `${queue.length} of ${PLAN_SIZE}`}</span>
      <span><b>Time</b> <span data-countdown>${countdownText(view.deadlineMs)}</span></span>
    </div>
    <div class="play-layout">
      <div class="board-wrap">
        ${boardHtml(view)}
        <div class="board-key" aria-label="Board key">
          <span><i class="key-own"></i>Your craft</span>
          <span><i class="key-sonar"></i>Sonar</span>
          <span><i class="key-wake"></i>Wake</span>
        </div>
      </div>
      <div class="command-desk">
        ${view.phase === 'finished' ? endScreenHtml(view) : commandControlsHtml(view, isPlayable)}
        ${roundLogHtml(view)}
      </div>
    </div>
  `;
}

function boardHtml(view: RoomView): string {
  const cells: string[] = [];
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      const index = y * BOARD_WIDTH + x;
      const craft = view.own.find((item) => item.x === x && item.y === y && item.integrity > 0);
      const contact = view.contacts.find((item) => item.x === x && item.y === y);
      const coordinate = `${String.fromCharCode(65 + x)}${y + 1}`;
      let content = '';
      let detail = 'open water';
      const classes = ['board-cell'];
      if (craft) {
        content = `<span class="craft-token facing-${craft.facing}" aria-hidden="true"><b>${craft.id[0]}</b></span>`;
        detail = `your ${craft.id} craft, facing ${currentName(craft.facing)}, integrity ${craft.integrity} of 2`;
        classes.push('has-craft');
        if (selectedCraft === craft.id) classes.push('is-selected');
      } else if (contact) {
        content = contact.kind === 'sonar' ? '<span class="sonar-contact" aria-hidden="true"></span>' : '<span class="wake-contact" aria-hidden="true">≈</span>';
        detail = `${contact.kind} contact`;
        classes.push(`has-${contact.kind}`);
      }
      cells.push(`<button class="${classes.join(' ')}" type="button" data-cell="${index}" data-craft="${craft?.id ?? ''}" tabindex="${index === boardCursor ? '0' : '-1'}" aria-label="${coordinate}, ${detail}" ${craft ? `aria-pressed="${selectedCraft === craft.id}"` : ''}>${content}</button>`);
    }
  }
  return `<div class="board" role="group" aria-label="Eight column by seven row tactics board. Use arrow keys to inspect cells.">${cells.join('')}</div>`;
}

function currentArrow(direction: Direction): string {
  return { N: '↑', E: '→', S: '↓', W: '←' }[direction];
}

function commandControlsHtml(view: RoomView, isPlayable: boolean): string {
  const locked = view.queueLocked || !isPlayable;
  const actions: Action[] = ['advance', 'left', 'right', 'pulse', 'sonar', 'hold'];
  return `
    <section class="planner" aria-labelledby="planner-title">
      <div class="planner-title-row">
        <div>
          <p class="small-label">Your private plan</p>
          <h3 id="planner-title" tabindex="-1">Queue three commands</h3>
        </div>
        <button class="text-button" type="button" data-clear-plan ${locked || queue.length === 0 ? 'disabled' : ''}>Clear plan</button>
      </div>
      <fieldset class="craft-picker" ${locked ? 'disabled' : ''}>
        <legend>Choose a craft</legend>
        ${view.own.map((craft) => `<button type="button" class="craft-choice ${selectedCraft === craft.id ? 'is-selected' : ''}" data-select-craft="${craft.id}" aria-pressed="${selectedCraft === craft.id}" ${craft.integrity === 0 ? 'disabled' : ''}>${craft.id}<span>${craft.integrity} integrity</span></button>`).join('')}
      </fieldset>
      <div class="command-grid" aria-label="Commands">
        ${actions.map((action) => `<button type="button" data-command="${action}" ${locked || queue.length >= PLAN_SIZE ? 'disabled' : ''}><span class="command-icon" aria-hidden="true">${actionIcon(action)}</span>${actionLabel(action)}</button>`).join('')}
      </div>
      <ol class="queue-list" aria-label="Queued commands">
        ${[0, 1, 2].map((index) => {
          const command = queue[index];
          return `<li class="${command ? 'filled' : ''}"><span>${index + 1}</span>${command ? `<b>${command.craft}</b> ${actionLabel(command.action)}<button type="button" data-remove-command="${index}" aria-label="Remove command ${index + 1}" ${locked ? 'disabled' : ''}>×</button>` : '<em>Empty command</em>'}</li>`;
        }).join('')}
      </ol>
      ${mode === 'demo' ? `<button class="secondary-button full-button" type="button" data-sample-plan ${locked ? 'disabled' : ''}>Queue sample plan</button>` : ''}
      <button class="primary-button full-button" type="button" data-lock-plan ${locked || queue.length !== PLAN_SIZE ? 'disabled' : ''}>${view.queueLocked ? 'Plan locked' : 'Lock three commands'}</button>
      <p class="planner-help">Both plans resolve together. Commands stay hidden until both players lock them.</p>
    </section>
  `;
}

function actionIcon(action: Action): string {
  return { advance: '↑', left: '↶', right: '↷', pulse: '╼', sonar: '◎', hold: '•' }[action];
}

function roundLogHtml(view: RoomView): string {
  return `
    <section class="round-log" aria-labelledby="round-log-title">
      <h3 id="round-log-title">Round report</h3>
      <ol>${view.lastLog.slice(-6).map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ol>
    </section>
  `;
}

function endScreenHtml(view: RoomView): string {
  const title = view.result === 'win' ? 'You won the match' : view.result === 'loss' ? 'You lost the match' : 'The match ended in a draw';
  const ownTotal = view.own.reduce((sum, craft) => sum + craft.integrity, 0);
  const otherTotal = view.opponentIntegrity.reduce((sum, craft) => sum + craft.integrity, 0);
  return `
    <section class="end-screen" aria-labelledby="end-title" data-end-screen>
      <p class="small-label">Final result</p>
      <h3 id="end-title" tabindex="-1">${title}</h3>
      <p>You kept ${ownTotal} integrity. The other side kept ${otherTotal}.</p>
      ${mode === 'demo'
        ? '<button class="primary-button" type="button" data-restart-sample>Play the sample again</button>'
        : '<button class="primary-button" type="button" data-rematch>Create a rematch</button>'}
      <button class="text-button" type="button" ${mode === 'demo' ? 'data-start-real' : 'data-leave-room'}>${mode === 'demo' ? 'Start for real' : 'Leave the match'}</button>
    </section>
  `;
}

function countdownText(deadlineMs: number | null): string {
  if (!deadlineMs) return mode === 'demo' ? 'No limit' : 'Waiting';
  const seconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  return `${seconds} seconds`;
}

function bindCommonEvents(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-route]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(link.pathname);
    });
  });
  document.querySelectorAll<HTMLElement>('[data-open-settings]').forEach((button) => {
    button.addEventListener('click', () => openSettings(button));
  });
  const dialog = document.querySelector<HTMLDialogElement>('#settings-dialog');
  dialog?.addEventListener('close', () => dialogReturnFocus?.focus());
  dialog?.querySelector<HTMLButtonElement>('[data-close-settings]')?.addEventListener('click', () => dialog.close());
  dialog?.querySelector<HTMLInputElement>('#sound-setting')?.addEventListener('change', (event) => {
    settings.sound = (event.currentTarget as HTMLInputElement).checked;
    saveSettings();
    if (settings.sound) playTone(520);
  });
  dialog?.querySelector<HTMLInputElement>('#motion-setting')?.addEventListener('change', (event) => {
    settings.motion = (event.currentTarget as HTMLInputElement).checked;
    saveSettings();
  });
}

function bindGameEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-start-demo]').forEach((button) => {
    button.addEventListener('click', startDemo);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-reset-demo]').forEach((button) => {
    button.addEventListener('click', resetDemo);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-start-real]').forEach((button) => {
    button.addEventListener('click', startReal);
  });
  document.querySelector<HTMLButtonElement>('[data-create-room]')?.addEventListener('click', () => void createRoom());
  document.querySelector<HTMLFormElement>('[data-join-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    void joinRoom(String(form.get('roomCode') ?? '').toUpperCase());
  });
  document.querySelector<HTMLButtonElement>('[data-copy-invite]')?.addEventListener('click', (event) => {
    const target = event.currentTarget as HTMLButtonElement;
    void navigator.clipboard
      .writeText(target.dataset.invite ?? '')
      .then(() => {
        statusMessage = 'Invite link copied.';
        renderGamePage(false);
      })
      .catch(() => {
        errorMessage = 'The browser blocked copying. Select the address bar and copy the invite link there.';
        renderGamePage(false);
      });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-leave-room]').forEach((button) => {
    button.addEventListener('click', leaveRoom);
  });
  document.querySelector<HTMLButtonElement>('[data-clear-plan]')?.addEventListener('click', () => {
    queue = [];
    statusMessage = 'Plan cleared.';
    renderGamePage(mode === 'demo', '[data-command="advance"]');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-select-craft]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedCraft = button.dataset.selectCraft as CraftId;
      statusMessage = `${selectedCraft} selected.`;
      renderGamePage(mode === 'demo', `[data-select-craft="${selectedCraft}"]`);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      if (queue.length >= PLAN_SIZE) return;
      const action = button.dataset.command as Action;
      queue.push({ craft: selectedCraft, action });
      statusMessage = `${selectedCraft}: ${actionLabel(action)} added as command ${queue.length}.`;
      playTone(360 + queue.length * 80);
      renderGamePage(
        mode === 'demo',
        queue.length === PLAN_SIZE ? '[data-lock-plan]' : `[data-command="${action}"]`,
      );
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-remove-command]').forEach((button) => {
    button.addEventListener('click', () => {
      queue.splice(Number(button.dataset.removeCommand), 1);
      statusMessage = 'Command removed.';
      renderGamePage(mode === 'demo', '[data-command="advance"]');
    });
  });
  document.querySelector<HTMLButtonElement>('[data-sample-plan]')?.addEventListener('click', () => {
    queue = sampleSuggestedPlan(demoGame.round);
    statusMessage = 'A sample plan is ready. Lock it when you are ready.';
    renderGamePage(true, '[data-lock-plan]');
  });
  document.querySelector<HTMLButtonElement>('[data-lock-plan]')?.addEventListener('click', () => void lockPlan());
  document.querySelector<HTMLButtonElement>('[data-restart-sample]')?.addEventListener('click', resetDemo);
  document.querySelector<HTMLButtonElement>('[data-rematch]')?.addEventListener('click', () => void createRoom());
  document.querySelectorAll<HTMLButtonElement>('[data-cell]').forEach((cell) => {
    cell.addEventListener('click', () => selectCell(cell));
    cell.addEventListener('keydown', handleBoardKey);
  });
}

function selectCell(cell: HTMLButtonElement): void {
  boardCursor = Number(cell.dataset.cell);
  if (cell.dataset.craft) {
    selectedCraft = cell.dataset.craft as CraftId;
    statusMessage = `${selectedCraft} selected from the board.`;
    renderGamePage(mode === 'demo', `[data-cell="${boardCursor}"]`);
  }
}

function handleBoardKey(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const current = Number((event.currentTarget as HTMLElement).dataset.cell);
  const x = current % BOARD_WIDTH;
  const y = Math.floor(current / BOARD_WIDTH);
  const nextX = event.key === 'ArrowLeft' ? Math.max(0, x - 1) : event.key === 'ArrowRight' ? Math.min(BOARD_WIDTH - 1, x + 1) : x;
  const nextY = event.key === 'ArrowUp' ? Math.max(0, y - 1) : event.key === 'ArrowDown' ? Math.min(BOARD_HEIGHT - 1, y + 1) : y;
  const next = nextY * BOARD_WIDTH + nextX;
  boardCursor = next;
  const cells = document.querySelectorAll<HTMLButtonElement>('[data-cell]');
  cells.forEach((cell) => (cell.tabIndex = Number(cell.dataset.cell) === next ? 0 : -1));
  cells[next]?.focus();
}

function startDemo(): void {
  if (window.location.pathname !== '/demo') {
    demoGame = initialGame('SALVO-DEMO-17');
    queue = [];
    statusMessage = 'Sample match loaded. Queue three commands or use the sample plan.';
    errorMessage = '';
    navigate('/demo');
    return;
  }
  resetDemo();
}

function resetDemo(): void {
  localStorage.removeItem(DEMO_SETTINGS_KEY);
  demoGame = initialGame('SALVO-DEMO-17');
  queue = [];
  selectedCraft = 'Echo';
  statusMessage = 'Sample reset to round 1.';
  errorMessage = '';
  settings = loadSettings();
  renderGamePage(true);
}

function startReal(): void {
  localStorage.removeItem(DEMO_SETTINGS_KEY);
  mode = 'idle';
  roomSession = loadRoomSession();
  roomView = null;
  queue = [];
  statusMessage = 'Create a room or enter a friend’s code.';
  navigate('/');
}

async function lockPlan(): Promise<void> {
  const problem = validatePlan(queue);
  if (problem) {
    errorMessage = problem;
    renderGamePage(mode === 'demo');
    return;
  }
  errorMessage = '';
  if (mode === 'demo') {
    const plan = structuredClone(queue);
    queue = [];
    statusMessage = 'Both sample plans are resolving.';
    renderGamePage(true, demoGame.status === 'finished' ? '#end-title' : '[data-sample-plan]');
    await delay(settings.motion && !prefersReducedMotion() ? 240 : 0);
    demoGame = resolveRound(demoGame, {
      A: plan,
      B: sampleOpponentPlan(demoGame.round),
    });
    statusMessage = demoGame.status === 'finished' ? 'The sample match is complete.' : `Round ${demoGame.round} is ready.`;
    playTone(demoGame.status === 'finished' ? 680 : 480);
    renderGamePage(true);
    return;
  }
  if (!roomSession) return;
  const plan = structuredClone(queue);
  const round = roomView?.round;
  try {
    const response = await serializeRoomOperation(async () => {
      if (!roomSession || mode !== 'online') return null;
      const session = roomSession;
      const view = await api<RoomView>(`/api/rooms/${session.code}/commands`, {
        method: 'POST',
        token: session.token,
        body: { round, commands: plan },
      });
      return { session, view };
    });
    if (!response || !isCurrentSession(response.session)) return;
    roomView = response.view;
    if (roomView.phase === 'finished') saveRoomSession(null);
    queue = [];
    statusMessage = roomView.queueLocked ? 'Plan locked. Waiting for your friend.' : `Round ${roomView.round} is ready.`;
    renderGamePage(false, roomView.phase === 'finished' ? '#end-title' : '#planner-title');
    startPolling();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && roomSession) {
      try {
        const response = await serializeRoomOperation(async () => {
          if (!roomSession || mode !== 'online') return null;
          const session = roomSession;
          const view = await fetchRoom(session);
          return { session, view };
        });
        if (!response || !isCurrentSession(response.session)) return;
        roomView = response.view;
        if (roomView.phase === 'finished') saveRoomSession(null);
        queue = [];
        errorMessage = error.message;
        statusMessage = roomView.phase === 'finished' ? 'The match is complete.' : `Round ${roomView.round} is ready.`;
        renderGamePage(false, roomView.phase === 'finished' ? '#end-title' : '#planner-title');
        startPolling();
        return;
      } catch {
        // Fall through to the connection guidance below.
      }
    }
    showApiError(error);
  }
}

async function createRoom(): Promise<void> {
  errorMessage = '';
  statusMessage = 'Creating a private room.';
  renderGamePage(false);
  try {
    const response = await api<{ code: string; token: string; view: RoomView }>('/api/rooms', { method: 'POST' });
    saveRoomSession({ code: response.code, token: response.token });
    roomView = response.view;
    mode = 'online';
    queue = [];
    statusMessage = 'Room created. Share the code with one friend.';
    window.history.replaceState({}, '', `/?room=${response.code}`);
    renderGamePage(false);
    startPolling();
  } catch (error) {
    showApiError(error);
  }
}

async function joinRoom(code: string): Promise<void> {
  if (!/^[A-Z]{5}$/.test(code)) {
    errorMessage = 'The room code needs exactly five letters. Check the code and try again.';
    renderGamePage(false);
    document.querySelector<HTMLInputElement>('#room-code')?.focus();
    return;
  }
  errorMessage = '';
  statusMessage = `Joining room ${code}.`;
  renderGamePage(false);
  try {
    const response = await api<{ code: string; token: string; view: RoomView }>(`/api/rooms/${code}/join`, { method: 'POST' });
    saveRoomSession({ code, token: response.token });
    roomView = response.view;
    mode = 'online';
    queue = [];
    statusMessage = `Joined room ${code}. Round 1 is ready.`;
    window.history.replaceState({}, '', '/');
    renderGamePage(false);
    startPolling();
  } catch (error) {
    showApiError(error);
  }
}

async function resumeRoom(): Promise<void> {
  if (!roomSession || mode === 'demo') return;
  try {
    const response = await serializeRoomOperation(async () => {
      if (!roomSession || mode === 'demo') return null;
      const session = roomSession;
      const view = await fetchRoom(session);
      return { session, view };
    });
    if (!response || !isCurrentSession(response.session)) return;
    roomView = response.view;
    if (roomView.phase === 'finished') saveRoomSession(null);
    mode = 'online';
    statusMessage =
      roomView.phase === 'finished' ? 'The match is complete.' : `Room ${response.session.code} restored.`;
    renderGamePage(false);
    startPolling();
  } catch (error) {
    saveRoomSession(null);
    if (error instanceof ApiError && [404, 410].includes(error.status)) {
      statusMessage = 'The previous room expired. Create a new room to play again.';
    } else {
      errorMessage = 'The room service could not be reached. Check your connection and try again.';
    }
    renderGamePage(false);
  }
}

function leaveRoom(): void {
  stopPolling();
  saveRoomSession(null);
  roomView = null;
  mode = 'idle';
  queue = [];
  statusMessage = 'You left the room on this device.';
  window.history.replaceState({}, '', '/');
  renderGamePage(false);
}

async function fetchRoom(session: RoomSession): Promise<RoomView> {
  return api<RoomView>(`/api/rooms/${session.code}`, { token: session.token });
}

function startPolling(): void {
  stopPolling();
  if (mode !== 'online' || !roomSession || roomView?.phase === 'finished') return;
  pollTimer = window.setTimeout(() => {
    pollTimer = null;
    void serializeRoomOperation(async () => {
      if (mode !== 'online' || !roomSession || roomView?.phase === 'finished') return;
      const session = roomSession;
      try {
        const previousRound = roomView?.round;
        const wasWaiting = roomView?.phase === 'waiting';
        const view = await fetchRoom(session);
        if (!isCurrentSession(session)) return;
        roomView = view;
        if (roomView.phase === 'finished') {
          saveRoomSession(null);
          statusMessage = 'The match is complete.';
        } else if (wasWaiting && roomView.phase === 'planning') {
          statusMessage = 'Your friend joined. Round 1 is ready.';
        } else if (previousRound !== roomView.round) {
          queue = [];
          statusMessage = `Round ${roomView.round} is ready.`;
        }
        renderGamePage(false);
        startPolling();
      } catch (error) {
        if (!isCurrentSession(session)) return;
        if (error instanceof ApiError && error.status === 410) {
          saveRoomSession(null);
          statusMessage = 'The match ended and its reconnect token expired.';
          renderGamePage(false);
        } else {
          errorMessage = 'The room connection paused. Reconnecting now.';
          renderGamePage(false);
          startPolling();
        }
      }
    });
  }, 900);
}

function stopPolling(): void {
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  pollTimer = null;
}

function isCurrentSession(session: RoomSession): boolean {
  return roomSession?.code === session.code && roomSession.token === session.token;
}

function serializeRoomOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = roomOperation.then(operation, operation);
  roomOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST';
  token?: string;
  body?: unknown;
}

async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) headers.set('X-Player-Token', options.token);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({ error: 'The room service returned an unreadable response.' }))) as T & { error?: string };
  if (!response.ok) throw new ApiError(payload.error ?? 'The room request failed.', response.status);
  return payload;
}

function showApiError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'The room request failed.';
  errorMessage = `${message} Check the room code or connection and try again.`;
  statusMessage = '';
  renderGamePage(false);
}

function settingsDialog(): string {
  return `
    <dialog id="settings-dialog" aria-labelledby="settings-title">
      <form method="dialog">
        <div class="dialog-heading">
          <h2 id="settings-title">Game settings</h2>
          <button class="icon-button" value="cancel" aria-label="Close settings" data-close-settings>×</button>
        </div>
        <label class="setting-row" for="sound-setting">
          <span><b>Sound cues</b><small>Play short tones after your actions.</small></span>
          <input id="sound-setting" type="checkbox" ${settings.sound ? 'checked' : ''} />
        </label>
        <label class="setting-row" for="motion-setting">
          <span><b>Interface motion</b><small>Move command chits during short state changes.</small></span>
          <input id="motion-setting" type="checkbox" ${settings.motion ? 'checked' : ''} />
        </label>
        <p>Your browser’s reduced-motion setting always takes priority.</p>
      </form>
    </dialog>
  `;
}

function openSettings(button: HTMLElement): void {
  dialogReturnFocus = button;
  document.querySelector<HTMLDialogElement>('#settings-dialog')?.showModal();
}

function renderInfoPage(page: 'privacy' | 'terms'): void {
  const isPrivacy = page === 'privacy';
  app.innerHTML = shell(`
    <main id="main" class="document-page">
      <p class="eyebrow">Signal Salvo</p>
      <h1 tabindex="-1">${isPrivacy ? 'Understand what the game stores' : 'Use Signal Salvo fairly'}</h1>
      <p class="lede">${isPrivacy ? 'This page explains the small amount of data used for settings and live rooms.' : 'These terms cover the free browser game and its room service.'}</p>
      ${isPrivacy ? privacyHtml() : termsHtml()}
    </main>
  `);
  bindCommonEvents();
}

function privacyHtml(): string {
  return `
    <section><h2>Sample match data</h2><p>The sample match runs in your browser. It sends no game commands to the room service.</p><p>Sample settings use keys beginning with <code>demo:</code>. Resetting or leaving the demo removes those keys.</p></section>
    <section><h2>Online room data</h2><p>The room service stores the room code, board state, and hidden plans in SQLite. It never stores names, email addresses, or account details.</p><p>Your browser stores one random reconnect token. The service invalidates it after delivering the match result.</p></section>
    <section><h2>Network and retention</h2><p>Online play sends commands only to the product-owned Signal Salvo room service. The site uses no analytics, ads, trackers, or third-party scripts.</p><p>Room records support active play and short recovery. Server logs contain request paths and status codes, not reconnect tokens or command bodies.</p></section>
    <section><h2>Your choices</h2><p>Use Reset demo to clear sample settings. Use Leave room to remove the reconnect token from this browser.</p><p>For a privacy request, email <a href="mailto:privacy@sociobot.in">privacy@sociobot.in</a>.</p></section>
  `;
}

function termsHtml(): string {
  return `
    <section><h2>Free access</h2><p>Signal Salvo is free. It has no purchases, subscriptions, prizes, or gambling mechanics.</p></section>
    <section><h2>Fair play</h2><p>Do not automate requests, disrupt rooms, guess tokens, or use the service to harm another person.</p><p>Room codes are short invitations. Share a code only with the person you want to play.</p></section>
    <section><h2>Availability</h2><p>The game is provided as available. Active rooms and locked plans survive a room-service restart.</p><p>Inactive room records may be removed. Leaving a room removes its token from your browser.</p></section>
    <section><h2>Contact</h2><p>For a terms question, email <a href="mailto:privacy@sociobot.in">privacy@sociobot.in</a>.</p></section>
  `;
}

function renderNotFound(): void {
  app.innerHTML = shell(`
    <main id="main" class="not-found-page">
      <p class="error-code">404</p>
      <h1 tabindex="-1">Return to the tactics board</h1>
      <p>This address does not match a Signal Salvo page.</p>
      <a class="primary-link" href="/" data-route>Open the game</a>
    </main>
  `);
  bindCommonEvents();
}

function announce(message: string): void {
  const region = document.querySelector<HTMLElement>('.route-announcer');
  if (region) region.textContent = message;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function playTone(frequency: number): void {
  if (!settings.sound) return;
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.1);
  oscillator.addEventListener('ended', () => void context.close());
}

function updateCountdown(): void {
  const target = document.querySelector<HTMLElement>('[data-countdown]');
  if (target) target.textContent = countdownText(roomView?.deadlineMs ?? null);
}

let lastFrame = 0;
let accumulator = 0;
let sampleStart = performance.now();
let frameCount = 0;
function frameLoop(now: number): void {
  if (document.visibilityState === 'hidden') {
    lastFrame = now;
    requestAnimationFrame(frameLoop);
    return;
  }
  const delta = lastFrame === 0 ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  accumulator += delta;
  while (accumulator >= 1 / 60) {
    window.signalSalvoMetrics.fixedUpdates += 1;
    accumulator -= 1 / 60;
  }
  frameCount += 1;
  if (now - sampleStart >= 1000) {
    window.signalSalvoMetrics.fps = (frameCount * 1000) / (now - sampleStart);
    frameCount = 0;
    sampleStart = now;
    updateCountdown();
  }
  requestAnimationFrame(frameLoop);
}

window.addEventListener('popstate', () => route(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') lastFrame = performance.now();
});
route();
requestAnimationFrame(frameLoop);
