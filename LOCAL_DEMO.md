# Local Desktop Demo (No Website)

Run StudyPilot as a local desktop demo app:

```bash
npm install
npm run demo:local
```

What this does:
- Starts Next.js on `http://localhost:3000`
- Launches Electron desktop window
- Enables `LOCAL_DEMO_MODE=1` to bypass login gates for dashboard pages
- Auto-creates a local demo user (`demo@local.studypilot`) if needed for API-backed flows

Notes:
- This is intended for local demos and product walkthroughs.
- Do not use `LOCAL_DEMO_MODE` in production deployments.

Web-only guest mode (without Electron):

```bash
AUTH_GUEST_MODE=1 npm run dev
```
