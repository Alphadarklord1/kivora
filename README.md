StudyPilot is a desktop-first AI study workspace with offline model support.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Offline Model Bundles

Use this guide for bundled local AI models and installer profiles:

- `OFFLINE_MODEL_BUNDLE_GUIDE.md`

Quick commands:

```bash
npm run models:prepare:balanced
npm run electron:build:mac:balanced
npm run release:models:publish -- --tag=vX.Y.Z --repo=Alphadarklord1/studypilot --models-dir=~/StudyPilot-model-store
```

## Google Login Setup (Web + Desktop)

Set these environment variables:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
AUTH_GUEST_MODE=1
AUTH_REQUIRED=0
STUDYPILOT_DESKTOP_AUTH_PORT=3893
```

Google OAuth redirect URIs:

- `https://study-alpha-three.vercel.app/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`
- `http://127.0.0.1:3893/api/auth/callback/google`

Desktop note:

- The desktop app uses a fixed localhost callback port (`3893` by default).
- If that port is busy, StudyPilot falls back to guest-safe mode and disables OAuth for that run.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
