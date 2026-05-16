This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Next Steps Agent

This app generates a three-level actionable plan from a free-text situation using OpenAI, validates structure server-side, and saves each run locally under `data/plans/` (ignored by git—do not commit that folder).

### Configure OpenAI

Copy `.env.example` to `.env.local`, then set:

- `OPENAI_API_KEY` — required (your real `sk-…` key, not a placeholder)
- `OPENAI_MODEL` **or** `OPENAI_MODEL_ID` — optional (defaults to `gpt-4o-mini`)
- `OPENAI_ORGANIZATION` **or** `OPENAI_ORG_ID` — optional, if your OpenAI account uses org routing

Use `.env.local` for local secrets (Next.js loads it automatically). Never commit `.env.local` / `.env`.

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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
