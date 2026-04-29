# AGENTS.md

## Project
Next.js 15 + React 19 conversation webapp for Dify AI platform. Connects to a Dify backend via REST/SSE and renders chat with streaming responses, voice input, workflow visualization, and i18n (6 locales).

## Commands
- `pnpm dev` — Start Next.js dev server (port 3000)
- `pnpm build` — Production build (uses `next build`)
- `pnpm lint` — Run ESLint
- `pnpm fix` — Auto-fix lint issues
- `pnpm speech-server` — Start WebSocket speech recognition server (port 8787)
- `pnpm download-whisper` — Download Whisper model files

Pre-commit hook runs `pnpm lint-staged` (ESLint on staged `.ts`/`.tsx` files).

## Architecture
- **App Router**: Entry is `app/layout.tsx` → `app/page.tsx` → `app/components/index.tsx`
- **API proxy**: Routes in `app/api/**/route.ts` use `dify-client` ChatClient to forward requests to Dify backend
- **Client streaming**: `service/base.ts` exports `ssePost` for SSE streaming; `service/index.ts` wraps domain calls (`sendChatMessage`, `fetchConversations`, etc.)
- **State**: Zustand + immer for state management; ahooks for utility hooks
- **Config**: `config/index.ts` holds `APP_ID`, `API_KEY`, `API_URL` from env vars
- **Speech server**: Standalone Node.js WebSocket server in `speech-server/` — runs separately from Next.js

## Voice Recognition
Two engines in `app/components/chat/voice-recognition/`:
- **browser** (`browser-recognition.ts`): Uses Web Speech API (`SpeechRecognition`). Hardcoded `lang: 'zh-CN'`. Only triggers callback on `isFinal` results. Check browser support: `window.SpeechRecognition || window.webkitSpeechRecognition`.
- **whisper** (`whisper-recognition.ts`): Connects to speech-server via WebSocket. Supports models: whisper-tiny/base/small, funasr-paraformer-zh, funasr-sensevoice.

Engine switching: `voice-settings.tsx` → `VoiceInput` component in `voice-input.tsx`.

**Gotcha**: `VoiceInput` accumulates text with comma separators between final results. The `onResult` callback receives accumulated text, not individual segments.

## Conventions
- **ESLint**: No semicolons, single quotes, 2-space indent (`@antfu/eslint-config`). Run `pnpm fix` to auto-format.
- **Imports**: Use `@/*` alias (maps to project root). Absolute imports preferred.
- **Components**: `'use client'` required for client components. Server components are the default in App Router.
- **Styling**: Tailwind-first. SCSS only for markdown/code. `classnames` or `tailwind-merge` for conditional classes.
- **Build**: `next.config.js` disables ESLint and TypeScript errors during build (`ignoreDuringBuilds: true`).
- **Docker**: `docker build . -t <repo>/webapp-conversation:latest` then `docker run -p 3000:3000` — uses standalone output mode.

## Environment
Required in `.env.local`:
```
NEXT_PUBLIC_APP_ID=<dify-app-id>
NEXT_PUBLIC_APP_KEY=<dify-api-key>
NEXT_PUBLIC_API_URL=https://api.dify.ai/v1
NEXT_PUBLIC_DEFAULT_THEME=tech-blue
```
