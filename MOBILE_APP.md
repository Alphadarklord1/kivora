# Mobile App Wrapper (iOS/Android)

This project supports an iOS/Android wrapper using Capacitor. The wrapper can either:

- Load the **deployed web app** (recommended for fastest iteration), or
- Bundle a static export (only if you later make the app fully static).

## Recommended: Web-backed wrapper

1. Make sure the web app is deployed (Vercel).
2. Edit `capacitor.config.ts` and set:
   - `server.url` to your deployed URL (example: `https://study-alpha-three.vercel.app`)
3. Run:
   ```bash
   npm install
   npx cap add ios
   npx cap add android
   npx cap sync
   ```
4. Open native projects:
   ```bash
   npx cap open ios
   npx cap open android
   ```

## Optional: Static bundle (advanced)

This app uses authenticated, server-backed routes, so a static export may not work without changes.
If you still want to try:

```bash
npm run export
npx cap sync
```

Then open Xcode/Android Studio as usual.

## Notes

- The app already includes **Electron** support for desktop builds.
- For mobile, the wrapper is best used as a web-backed shell.
