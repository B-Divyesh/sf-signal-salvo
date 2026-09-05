import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  await page.screenshot({ path: testInfo.outputPath('sample-end-screen.png'), fullPage: true });
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
  await loadDemo(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: /Sound cues/i }).check();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('checkbox', { name: /Sound cues/i })).toBeChecked();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain('demo:signal-salvo:settings');
  expect(keys).not.toContain('signal-salvo:settings');
});

test('the sample animation loop sustains 55 fps @claim:steady-frame-rate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadDemo(page);
  await page.waitForTimeout(2_200);
  const fps = await page.evaluate(() => window.signalSalvoMetrics.fps);
  expect(fps).toBeGreaterThanOrEqual(55);
});

test('the one-click sample stays isolated and same-origin @claim:demo-private', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await page.getByRole('button', { name: 'Try it with sample data' }).click();
  await page.getByRole('button', { name: 'Queue sample plan' }).click();
  await page.getByRole('button', { name: 'Lock three commands' }).click();
  await page.waitForTimeout(350);
  const origins = new Set(requests.map((url) => new URL(url).origin));
  expect([...origins]).toEqual(['http://127.0.0.1:4173']);
  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(storage['signal-salvo:real-session']).toBeUndefined();
  expect(storage['signal-salvo:settings']).toBeUndefined();
  await expect(page.getByText('Demo — sample data, nothing is saved')).toBeVisible();
});

test('two independent clients finish one hidden-plan room @claim:online-two-player', async ({ browser }, testInfo) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const playerA = await contextA.newPage();
  const playerB = await contextB.newPage();
  try {
    await playerA.goto('/');
    await playerA.getByRole('button', { name: 'Create a room' }).click();
    const code = (await playerA.locator('.room-code-output').textContent())?.trim();
    expect(code).toMatch(/^[A-Z]{5}$/);

    await playerB.goto(`/?room=${code}`);
    await playerB.getByRole('button', { name: 'Join room' }).click();
    await expect(playerA.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();
    await expect(playerB.getByRole('heading', { name: 'Round 1 of 6' })).toBeVisible();

    for (let round = 1; round <= 6; round += 1) {
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
    await playerA.screenshot({ path: testInfo.outputPath('online-player-a-end.png'), fullPage: true });
    await playerB.screenshot({ path: testInfo.outputPath('online-player-b-end.png'), fullPage: true });
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
        data: commands,
      });
      expect(a.ok()).toBeTruthy();
      const b = await api.post(`/api/rooms/${created.code}/commands`, {
        headers: { 'X-Player-Token': joined.token },
        data: commands,
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
  await expect(page.getByText('Free to play')).toBeVisible();
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect(page.locator('.room-code-output')).toHaveText(/^[A-Z]{5}$/);
  await expect(page.getByText(/checkout|payment|subscription/i)).toHaveCount(0);
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

  await page.getByRole('button', { name: 'Try it with sample data' }).click();
  const lock = page.getByRole('button', { name: 'Lock three commands' });
  await expect(lock).toBeDisabled();
  await page.getByRole('button', { name: 'Advance' }).click();
  await page.getByRole('button', { name: 'Send pulse' }).click();
  await page.getByRole('button', { name: 'Use sonar' }).click();
  await expect(page.getByRole('button', { name: 'Hold position' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove command 2' }).click();
  await expect(lock).toBeDisabled();

  const firstCell = page.locator('[data-cell="0"]');
  await firstCell.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-cell="1"]')).toBeFocused();
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
  await expect(page.getByRole('heading', { name: 'Plan a six-round duel together' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try it with sample data' })).toBeVisible();
  await expect(page.locator('.board')).toBeInViewport({ ratio: 0.05 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('home-phone.png'), fullPage: true });
});
