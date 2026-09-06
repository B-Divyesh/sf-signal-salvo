import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function firstRgb(value: string): string {
  const color = value.match(/rgb\([^)]*\)/)?.[0];
  if (!color) throw new Error(`No RGB color found in ${value}.`);
  return color;
}

function contrastRatio(first: string, second: string): number {
  const luminance = (value: string): number => {
    const parts = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    if (!parts || parts.length !== 3) throw new Error(`Cannot read color ${value}.`);
    const channels = parts.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function startIsolatedRoomService(databasePath: string, port: number): Promise<ChildProcess> {
  const child = spawn('cargo', ['run', '--quiet', '--manifest-path', 'server/Cargo.toml'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SIGNAL_SALVO_DB: databasePath },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`The isolated room service exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return child;
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }
  child.kill('SIGKILL');
  throw new Error('The isolated room service did not become healthy.');
}

async function stopIsolatedRoomService(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), delay(5_000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function startCapturedRoomService(
  databasePath: string,
  port: number,
): Promise<{ child: ChildProcess; readLogs: () => string }> {
  let logs = '';
  const child = spawn('cargo', ['run', '--quiet', '--manifest-path', 'server/Cargo.toml'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), SIGNAL_SALVO_DB: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    logs += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    logs += chunk;
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`The captured room service exited with ${child.exitCode}.\n${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return { child, readLogs: () => logs };
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }
  child.kill('SIGKILL');
  throw new Error(`The captured room service did not become healthy.\n${logs}`);
}

async function loadDemo(page: Page): Promise<void> {
  await page.goto('/demo');
  await expect(page.getByText('Demo — sample data, nothing is saved')).toBeVisible();
}

async function playSampleToEnd(page: Page): Promise<void> {
  for (let round = 0; round < 6; round += 1) {
    if (await page.locator('[data-end-screen]').isVisible().catch(() => false)) return;
    await page.getByRole('button', { name: 'Queue sample plan' }).click();
    await page.getByRole('button', { name: 'Lock three commands' }).click();
    await page.waitForTimeout(320);
  }
  await expect(page.locator('[data-end-screen]')).toBeVisible();
}

async function queueHoldPlan(page: Page): Promise<void> {
  const picker = page.locator('.craft-picker');
  await picker.getByRole('button', { name: /Echo.*integrity/i }).click();
  await page.getByRole('button', { name: 'Hold position' }).click();
  await picker.getByRole('button', { name: /Kilo.*integrity/i }).click();
  await page.getByRole('button', { name: 'Hold position' }).click();
  await picker.getByRole('button', { name: /Echo.*integrity/i }).click();
  await page.getByRole('button', { name: 'Use sonar' }).click();
}

test('the sample plays through to an actual result @claim:sample-match-end', async ({ page }, testInfo) => {
  await loadDemo(page);
  await playSampleToEnd(page);
  await expect(page.getByRole('heading', { name: /won|lost|draw/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the sample again' })).toBeVisible();
  await expect(page.getByText('Demo — sample data, nothing is saved')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('sample-end-screen.png'), fullPage: true });
});

test('the phone sample presents its result below the persistent demo banner', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  await playSampleToEnd(page);
  const resultTitle = page.locator('#end-title');
  await expect(resultTitle).toBeFocused();
  await expect(resultTitle).toBeInViewport();
  const placement = await resultTitle.evaluate((title) => {
    const banner = document.querySelector<HTMLElement>('.demo-banner');
    const heading = title.getBoundingClientRect();
    return {
      bannerBottom: banner?.getBoundingClientRect().bottom ?? 0,
      headingTop: heading.top,
      headingBottom: heading.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(placement.headingTop).toBeGreaterThanOrEqual(placement.bannerBottom + 8);
  expect(placement.headingBottom).toBeLessThanOrEqual(placement.viewportHeight);
  await page.screenshot({ path: testInfo.outputPath('sample-end-phone-viewport.png') });
});

test('restarting the sample clears its match state @claim:restart-reset', async ({ page }) => {
  await loadDemo(page);
  await playSampleToEnd(page);
  await page.getByRole('button', { name: 'Play the sample again' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
  await expect(page.getByText('0 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: /Echo.*2 integrity/i })).toBeEnabled();
});

test('sample settings persist only in the demo namespace @claim:settings-persist', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: /Sound cues/i }).check();
  await page.getByRole('checkbox', { name: /Interface motion/i }).uncheck();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Sound cues/i })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Interface motion/i })).not.toBeChecked();
  await page.getByRole('button', { name: 'Close settings' }).click();
  const realSettings = await page.evaluate(() => localStorage.getItem('signal-salvo:settings'));
  expect(realSettings).toBe(JSON.stringify({ sound: true, motion: false }));

  await loadDemo(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Sound cues/i })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Interface motion/i })).toBeChecked();
  await page.getByRole('checkbox', { name: /Sound cues/i }).check();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Sound cues/i })).toBeChecked();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain('demo:signal-salvo:settings');
  expect(keys).toContain('signal-salvo:settings');
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.getByRole('button', { name: 'Start for real' }).click();
  await expect(page.getByText('Demo — sample data, nothing is saved')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Sound cues/i })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Interface motion/i })).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('demo:signal-salvo:settings'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('signal-salvo:settings'))).toBe(realSettings);
});

test('the sample animation loop sustains 55 fps @claim:steady-frame-rate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  await page.waitForTimeout(2_200);
  const fps = await page.evaluate(() => window.signalSalvoMetrics.fps);
  expect(fps).toBeGreaterThanOrEqual(55);
});

test('a six-round online match provides six 20-second planning windows @claim:online-match-duration', async () => {
  const api = await apiRequest.newContext({
    baseURL: 'http://127.0.0.1:8787',
    extraHTTPHeaders: { 'X-Forwarded-For': '198.51.100.29' },
  });
  const commands = [
    { craft: 'Echo', action: 'hold' },
    { craft: 'Kilo', action: 'hold' },
    { craft: 'Echo', action: 'sonar' },
  ];
  try {
    const created = await (await api.post('/api/rooms')).json();
    const joined = await (await api.post(`/api/rooms/${created.code}/join`)).json();
    const planningWindows: number[] = [joined.view.deadlineMs - Date.now()];
    for (let round = 1; round <= 6; round += 1) {
      const locked = await api.post(`/api/rooms/${created.code}/commands`, {
        headers: { 'X-Player-Token': created.token },
        data: { round, commands },
      });
      expect(locked.ok()).toBeTruthy();
      const resolved = await api.post(`/api/rooms/${created.code}/commands`, {
        headers: { 'X-Player-Token': joined.token },
        data: { round, commands },
      });
      expect(resolved.ok()).toBeTruthy();
      const view = await resolved.json();
      if (round < 6) planningWindows.push(view.deadlineMs - Date.now());
      else {
        expect(view.phase).toBe('finished');
        expect(view.deadlineMs).toBeNull();
      }
    }
    expect(planningWindows).toHaveLength(6);
    for (const milliseconds of planningWindows) {
      expect(milliseconds).toBeGreaterThanOrEqual(18_500);
      expect(milliseconds).toBeLessThanOrEqual(20_100);
    }
  } finally {
    await api.dispose();
  }
});

test('the one-click sample stays isolated and same-origin @claim:demo-private', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  const realSettings = JSON.stringify({ sound: true, motion: false });
  await page.evaluate((value) => localStorage.setItem('signal-salvo:settings', value), realSettings);
  await page.getByRole('button', { name: 'Try it with sample data' }).click();
  await page.getByRole('button', { name: 'Queue sample plan' }).click();
  await page.getByRole('button', { name: 'Lock three commands' }).click();
  await page.waitForTimeout(350);
  const origins = new Set(requests.map((url) => new URL(url).origin));
  expect([...origins]).toEqual(['http://127.0.0.1:4173']);
  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(storage['signal-salvo:real-session']).toBeUndefined();
  expect(storage['signal-salvo:settings']).toBe(realSettings);
  await expect(page.getByText('Demo — sample data, nothing is saved')).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  expect(await page.evaluate(() => localStorage.getItem('signal-salvo:settings'))).toBe(realSettings);
});

test('online play contacts only the site and room service @claim:online-network-private', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.locator('.room-code-output')).toHaveText(/^[A-Z]{5}$/);
  expect([...origins].sort()).toEqual(['http://127.0.0.1:4173', 'http://127.0.0.1:8787']);
});

test('online rooms do not store submitted personal details @claim:no-personal-data-storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'signal-salvo-personal-data-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const port = 18789;
  let child: ChildProcess | undefined;
  const personalMarkers = {
    name: 'Private Player 73F6A1',
    email: 'private-73f6a1@example.invalid',
    accountDetails: 'account-private-73f6a1',
  };
  try {
    child = await startIsolatedRoomService(databasePath, port);
    const base = `http://127.0.0.1:${port}`;
    const createdResponse = await fetch(`${base}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personalMarkers),
    });
    expect(createdResponse.ok).toBeTruthy();
    const created = await createdResponse.json();
    const joinedResponse = await fetch(`${base}/api/rooms/${created.code}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personalMarkers),
    });
    expect(joinedResponse.ok).toBeTruthy();
    const joined = await joinedResponse.json();
    const planResponse = await fetch(`${base}/api/rooms/${created.code}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Player-Token': created.token },
      body: JSON.stringify({
        round: 1,
        commands: [
          { craft: 'Echo', action: 'hold' },
          { craft: 'Kilo', action: 'hold' },
          { craft: 'Echo', action: 'sonar' },
        ],
        player: personalMarkers,
      }),
    });
    expect(planResponse.ok).toBeTruthy();
    expect(JSON.stringify({ created, joined })).not.toContain(personalMarkers.email);
    await stopIsolatedRoomService(child);
    child = undefined;

    const storedBytes = await readFile(databasePath);
    const storedText = storedBytes.toString('utf8');
    for (const marker of Object.values(personalMarkers)) expect(storedText).not.toContain(marker);
  } finally {
    if (child) await stopIsolatedRoomService(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('request logs omit tokens and command bodies @claim:request-log-privacy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'signal-salvo-private-logs-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const port = 18790;
  let service: Awaited<ReturnType<typeof startCapturedRoomService>> | undefined;
  const commandMarker = 'private-command-body-91c5e2';
  try {
    service = await startCapturedRoomService(databasePath, port);
    const base = `http://127.0.0.1:${port}`;
    const created = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
    const joined = await fetch(`${base}/api/rooms/${created.code}/join`, { method: 'POST' });
    expect(joined.ok).toBeTruthy();
    const response = await fetch(`${base}/api/rooms/${created.code}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Player-Token': created.token },
      body: JSON.stringify({
        round: 1,
        commands: [
          { craft: 'Echo', action: 'hold' },
          { craft: 'Kilo', action: 'hold' },
          { craft: 'Echo', action: 'sonar' },
        ],
        privateNote: commandMarker,
      }),
    });
    expect(response.ok).toBeTruthy();
    await stopIsolatedRoomService(service.child);
    const entries = service
      .readLogs()
      .split('\n')
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as { fields?: { status?: number }; span?: { uri?: string } }];
        } catch {
          return [];
        }
      });
    expect(entries.some((entry) => entry.span?.uri === '/api/rooms' && entry.fields?.status === 200)).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.span?.uri === `/api/rooms/${created.code}/commands` && entry.fields?.status === 200,
      ),
    ).toBe(true);
    const logs = service.readLogs();
    expect(logs).not.toContain(created.token);
    expect(logs).not.toContain(commandMarker);
    expect(logs).not.toContain('"craft":"Echo"');
    service = undefined;
  } finally {
    if (service) await stopIsolatedRoomService(service.child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('two independent clients reconnect, finish, and open a rematch @claim:online-two-player @claim:room-reconnect @claim:online-rematch', async ({ browser }, testInfo) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const playerA = await contextA.newPage();
  const playerB = await contextB.newPage();
  const consoleErrors: string[] = [];
  const failedRoomResponses: string[] = [];
  for (const page of [playerA, playerB]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('/api/rooms/') && response.status() >= 400) {
        failedRoomResponses.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });
  }
  try {
    await playerA.goto('/');
    await playerA.getByRole('button', { name: 'Create a room' }).click();
    const code = (await playerA.locator('.room-code-output').textContent())?.trim();
    expect(code).toMatch(/^[A-Z]{5}$/);

    await playerB.goto(`/?room=${code}`);
    await playerB.getByRole('button', { name: 'Join room' }).click();
    await expect(playerA.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
    await expect(playerB.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();

    await queueHoldPlan(playerA);
    await playerA.getByRole('button', { name: 'Lock three commands' }).click();
    await expect(playerA.locator('.game-status').getByText('Plan locked')).toBeVisible();
    await playerA.reload();
    await expect(playerA.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
    await expect(playerA.locator('.game-status').getByText('Plan locked')).toBeVisible();
    await playerB.reload();
    await expect(playerB.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
    await expect(playerB.getByRole('list', { name: 'Queued commands' }).getByText('Empty command')).toHaveCount(3);
    await expect(playerB.locator('.round-log')).not.toContainText('held position');
    await queueHoldPlan(playerB);
    await playerB.getByRole('button', { name: 'Lock three commands' }).click();
    await expect(playerA.getByRole('heading', { name: 'Round 2 of 6' })).toBeVisible();
    await expect(playerB.getByRole('heading', { name: 'Round 2 of 6' })).toBeVisible();
    await expect(playerB.locator('.round-log')).toContainText('held position');

    for (let round = 2; round <= 6; round += 1) {
      await queueHoldPlan(playerA);
      await playerA.getByRole('button', { name: 'Lock three commands' }).click();
      await expect(playerA.locator('.game-status').getByText('Plan locked')).toBeVisible();
      await expect(playerB.getByRole('list', { name: 'Queued commands' }).getByText('Empty command')).toHaveCount(3);
      await queueHoldPlan(playerB);
      await playerB.getByRole('button', { name: 'Lock three commands' }).click();
      if (round < 6) {
        await expect(playerA.getByRole('heading', { name: `Round ${round + 1} of 6` })).toBeVisible();
        await expect(playerB.getByRole('heading', { name: `Round ${round + 1} of 6` })).toBeVisible();
      }
    }
    await expect(playerA.locator('[data-end-screen]')).toBeVisible();
    await expect(playerB.locator('[data-end-screen]')).toBeVisible();
    await Promise.all([playerA.waitForTimeout(1_200), playerB.waitForTimeout(1_200)]);
    expect(failedRoomResponses).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(await playerA.evaluate(() => localStorage.getItem('signal-salvo:real-session'))).toBeNull();
    expect(await playerB.evaluate(() => localStorage.getItem('signal-salvo:real-session'))).toBeNull();
    await playerA.screenshot({ path: testInfo.outputPath('online-player-a-end.png'), fullPage: true });
    await playerB.screenshot({ path: testInfo.outputPath('online-player-b-end.png'), fullPage: true });
    await playerA.getByRole('button', { name: 'Create a rematch' }).click();
    await expect(playerA.locator('.room-code-output')).toHaveText(/^[A-Z]{5}$/);
    const rematchCode = (await playerA.locator('.room-code-output').textContent())?.trim();
    expect(rematchCode).not.toBe(code);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('reconnect tokens expire after the result is delivered @claim:room-token-expiry', async () => {
  const api = await apiRequest.newContext({
    baseURL: 'http://127.0.0.1:8787',
    extraHTTPHeaders: { 'X-Forwarded-For': '198.51.100.19' },
  });
  try {
    const created = await (await api.post('/api/rooms')).json();
    const joined = await (await api.post(`/api/rooms/${created.code}/join`)).json();
    const commands = {
      commands: [
        { craft: 'Echo', action: 'hold' },
        { craft: 'Kilo', action: 'hold' },
        { craft: 'Echo', action: 'sonar' },
      ],
    };
    for (let round = 1; round <= 6; round += 1) {
      const a = await api.post(`/api/rooms/${created.code}/commands`, {
        headers: { 'X-Player-Token': created.token },
        data: { ...commands, round },
      });
      expect(a.ok()).toBeTruthy();
      const b = await api.post(`/api/rooms/${created.code}/commands`, {
        headers: { 'X-Player-Token': joined.token },
        data: { ...commands, round },
      });
      expect(b.ok()).toBeTruthy();
    }
    const finalForA = await api.get(`/api/rooms/${created.code}`, {
      headers: { 'X-Player-Token': created.token },
    });
    expect(finalForA.ok()).toBeTruthy();
    expect((await finalForA.json()).phase).toBe('finished');
    const expiredA = await api.get(`/api/rooms/${created.code}`, {
      headers: { 'X-Player-Token': created.token },
    });
    const expiredB = await api.get(`/api/rooms/${created.code}`, {
      headers: { 'X-Player-Token': joined.token },
    });
    expect(expiredA.status()).toBe(410);
    expect(expiredB.status()).toBe(410);
  } finally {
    await api.dispose();
  }
});

test('a visitor can create a free room without an account @claim:free-no-account', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  await expect(page.locator('a[download], a[href$=".zip"], a[href$=".exe"], a[href$=".dmg"]')).toHaveCount(0);
  await expect(page.getByText('Free to play')).toBeVisible();
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.locator('.room-code-output')).toHaveText(/^[A-Z]{5}$/);
  await expect(page.getByText(/checkout|payment|subscription/i)).toHaveCount(0);
});

test('the room service reports its running build @claim:service-health', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:8787/health');
  expect(response.ok()).toBeTruthy();
  const health = await response.json();
  expect(health.ok).toBe(true);
  expect(health.buildSha).toMatch(/^(dev|[0-9a-f]{40})$/);
});

test('an active room and locked plan survive a service restart @claim:room-restart-persistence', async () => {
  test.setTimeout(45_000);
  const directory = await mkdtemp(join(tmpdir(), 'signal-salvo-restart-'));
  const databasePath = join(directory, 'rooms.sqlite');
  const port = 18787;
  let child: ChildProcess | undefined;
  const commands = {
    round: 1,
    commands: [
      { craft: 'Echo', action: 'hold' },
      { craft: 'Kilo', action: 'hold' },
      { craft: 'Echo', action: 'sonar' },
    ],
  };
  try {
    child = await startIsolatedRoomService(databasePath, port);
    const base = `http://127.0.0.1:${port}`;
    const created = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
    const joined = await (await fetch(`${base}/api/rooms/${created.code}/join`, { method: 'POST' })).json();
    const locked = await fetch(`${base}/api/rooms/${created.code}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Player-Token': created.token },
      body: JSON.stringify(commands),
    });
    expect(locked.ok).toBeTruthy();
    await stopIsolatedRoomService(child);

    child = await startIsolatedRoomService(databasePath, port);
    const restored = await fetch(`${base}/api/rooms/${created.code}`, {
      headers: { 'X-Player-Token': created.token },
    });
    expect(restored.ok).toBeTruthy();
    expect(await restored.json()).toMatchObject({ round: 1, queueLocked: true });
    const resolved = await fetch(`${base}/api/rooms/${created.code}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Player-Token': joined.token },
      body: JSON.stringify(commands),
    });
    expect(resolved.ok).toBeTruthy();
    expect(await resolved.json()).toMatchObject({ round: 2, phase: 'planning' });
  } finally {
    if (child) await stopIsolatedRoomService(child);
    await rm(directory, { recursive: true, force: true });
  }
});

test('normal, invalid, boundary, keyboard, and recovery paths work', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  await page.getByLabel('Room code', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('alert')).toContainText('exactly five letters');

  await page.route('http://127.0.0.1:8787/**', (route) => route.abort('connectionfailed'));
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the room code or connection and try again');
  expect(consoleErrors).toEqual(['Failed to load resource: net::ERR_CONNECTION_FAILED']);
  consoleErrors.length = 0;
  await page.unroute('http://127.0.0.1:8787/**');
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.locator('.room-code-output')).toHaveText(/^[A-Z]{5}$/);
  await page.getByRole('button', { name: 'Leave room' }).click();

  await page.getByRole('button', { name: 'Try it with sample data' }).click();
  const lock = page.getByRole('button', { name: 'Lock three commands' });
  await expect(lock).toBeDisabled();
  const advance = page.getByRole('button', { name: 'Advance' });
  await advance.focus();
  await page.keyboard.press('Enter');
  await expect(advance).toBeFocused();
  await page.getByRole('button', { name: 'Send pulse' }).click();
  await page.getByRole('button', { name: 'Use sonar' }).click();
  await expect(page.getByRole('button', { name: 'Hold position' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove command 2' }).click();
  await expect(lock).toBeDisabled();

  await advance.focus();
  await page.keyboard.press('Enter');
  await expect(lock).toBeFocused();

  const firstCell = page.locator('[data-cell="0"]');
  await firstCell.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-cell="1"]')).toBeFocused();
  await page.locator('[data-cell="7"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-cell="7"]')).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('routes, reduced motion, dialog focus, and accessibility pass', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [path, title] of [
    ['/', 'Signal Salvo — plan a two-player tactics match'],
    ['/demo', 'Demo — Signal Salvo'],
    ['/privacy', 'Privacy — Signal Salvo'],
    ['/terms', 'Terms — Signal Salvo'],
    ['/missing-page', 'Page not found — Signal Salvo'],
    ['/404.html', 'Page not found — Signal Salvo'],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  }
  await page.goto('/demo');
  const settingsButton = page.getByRole('button', { name: 'Settings' });
  await settingsButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(settingsButton).toBeFocused();
  const duration = await page.locator('.craft-token').first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(['0s', '0.00001s', '1e-05s']).toContain(duration);
});

test('the phone layout shows the job, first action, and board without page overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Play a six-round tactics match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try it with sample data' })).toBeVisible();
  await expect(page.locator('.board')).toBeInViewport({ ratio: 0.05 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('home-phone.png'), fullPage: true });
});

test('two hundred percent text and keyboard focus keep the game usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.getByRole('heading', { name: 'Play a sample six-round tactics match' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue sample plan' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Queue sample plan' }).focus();
  const focusStyle = await page.getByRole('button', { name: 'Queue sample plan' }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle, outlineColor: style.outlineColor };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(Number.parseFloat(focusStyle.width)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(focusStyle.outlineColor, 'rgb(255, 249, 233)')).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: 'Reset demo' }).focus();
  const bannerFocus = await page.getByRole('button', { name: 'Reset demo' }).evaluate((element) => getComputedStyle(element).boxShadow);
  expect(contrastRatio(firstRgb(bannerFocus), 'rgb(20, 47, 53)')).toBeGreaterThanOrEqual(3);
});

test('phone touch controls provide at least a 44 pixel target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo');
  const undersized = await page.locator('button, input, a').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0)) return [];
      if (element.matches('input[type="checkbox"]') && element.closest('label')) return [];
      return rect.width < 44 || rect.height < 44
        ? [{ label: element.getAttribute('aria-label') ?? element.textContent?.trim(), width: rect.width, height: rect.height }]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
});
