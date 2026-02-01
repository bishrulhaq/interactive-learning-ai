This is the Next.js frontend for the Interactive Learning AI Platform.

## Getting Started

Run the full stack from the repo root (recommended):

```powershell
.\run-dev.ps1
```

Or run the frontend only (backend must already be running):

```bash
npm install
npm run dev
```

By default the frontend calls `http://localhost:8000` (see `src/lib/api.ts`). Override via `NEXT_PUBLIC_API_URL`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

See the repo root `README.md` for full setup, providers, and troubleshooting.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
