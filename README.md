# Pocket Interviewer

A voice-based AI mock interviewer that installs on your iPhone. Pick a role (or paste a real job posting), answer questions out loud, and get a feedback report: STAR structure, clarity, relevance, confidence, filler words, speaking pace, and a stronger example answer for every question.

**Live app:** https://devindipk.github.io/pocket-interviewer/

## Features

- **Spoken interview**: the interviewer talks (device text-to-speech) and you answer by voice; typing works too.
- **Real follow-ups**: if an answer is vague or missing a result, the AI asks one follow-up, like a real interviewer.
- **Feedback report**: overall score, category scores, per-question strengths and fixes, and a rewritten STAR answer.
- **Delivery metrics measured on the device**: words per minute and filler-word counts.
- **Job-posting mode**: paste a posting and the questions are based on it.
- **Installable app (PWA)**: add it to the iPhone home screen; history is stored on the device only.
- **$0 to run**: GitHub Pages + Cloudflare Workers free plan + Google Gemini free tier.

## Architecture

```
iPhone (React PWA on GitHub Pages)
   │  records 16 kHz WAV, measures pace + fillers, speaks questions
   ▼
Cloudflare Worker (worker/)          ← holds GEMINI_API_KEY as a secret
   │  3 fixed tasks: /api/transcribe, /api/turn, /api/report
   │  origin allow-list, size limits, per-IP rate limit, model fallback
   ▼
Google Gemini API (free tier, structured JSON output)
```

The key never reaches the browser, and the Worker only performs these three tasks, so it can't be used as a general AI proxy.

## Run locally

```bash
npm install
npm run dev            # demo mode (no AI) at http://localhost:5173
```

To use the real AI locally, put `GEMINI_API_KEY=...` in `worker/.dev.vars`, run `cd worker && npm install && npx wrangler dev`, and start the app with `VITE_API_URL=http://localhost:8787 npm run dev`.

## Deploy

1. **Worker**: `cd worker && npx wrangler login && npx wrangler secret put GEMINI_API_KEY && npx wrangler deploy`
2. **App**: `gh variable set API_URL --body "https://pocket-interviewer-api.<you>.workers.dev"`, then push to `main`. GitHub Actions builds and publishes to Pages.

## Tech

React 19, TypeScript, Vite, Web Audio API, Web Speech API, Cloudflare Workers, Gemini API, Playwright (end-to-end test with a fake microphone: `node scripts/e2e.mjs`).

## Privacy

Answers are sent to Google Gemini for transcription and feedback. On the free tier Google may use them to improve its products, so don't share private information in practice answers. Interview history stays in the browser's local storage.
