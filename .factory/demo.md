# Signal Salvo sample sandbox

- URL: `https://signal-salvo.sociobot.in/demo`
- Local URL: `http://127.0.0.1:4173/demo`
- Entry: select **Try it with sample data** on the first screen, or open `/demo` directly.
- Sample: seed `SALVO-DEMO-17`, two player craft, two opponent craft, changing currents, sonar contacts, and a deterministic opposing plan.
- Fast path: select **Queue sample plan**, then **Lock three commands**. Repeat until the result screen appears.
- Reset: select **Reset demo** in the persistent banner or **Play the sample again** on the end screen.
- Leave: select **Start for real**. This clears the demo settings namespace and opens the real room controls.

The sample runs entirely in browser memory. It does not call the room API. Its only optional localStorage key is `demo:signal-salvo:settings`; real settings use `signal-salvo:settings`, and a real reconnect session uses `signal-salvo:real-session`. Resetting or leaving the sample deletes the demo key without changing either real key.
