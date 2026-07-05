# AI MC Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local React prototype for the Digital Learning Confesta AI MC with a 2.5D robot, official ice cream backdrop, operator approval flow, OpenAI answer generation, TTS, and lip movement.

**Architecture:** A single Express server owns `/api/generate-answer` and `/api/tts`, reads `OPENAI_API_KEY`, and hosts Vite in dev mode. The React app exposes `/demo`, `/stage`, and `/operator` views backed by shared client session state and reusable stage/operator components.

**Tech Stack:** React, TypeScript, Vite, Express, OpenAI Node SDK, Vitest, React Testing Library, Supertest, CSS modules via plain CSS.

---

## File Structure

- Create `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example`.
- Create `server/index.mjs` for Express, OpenAI endpoints, and Vite middleware.
- Create `server/index.test.mjs` for API behavior with mocked OpenAI clients.
- Create `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/setupTests.ts`.
- Create `src/types.ts` for session, question, and robot state types.
- Create `src/data/eventContext.ts` and `src/data/sampleQuestions.ts`.
- Create `src/lib/mcFlow.ts` and `src/lib/mcFlow.test.ts` for pure state helpers.
- Create `src/hooks/useMcSession.ts` for operator/session behavior.
- Create `src/components/ConfestaBackdrop.tsx`, `src/components/RobotStage.tsx`, `src/components/OperatorPanel.tsx`, `src/components/StatusBadge.tsx`.
- Create `src/App.test.tsx` for route smoke tests.
- Generate derived image files under `assets/characters/generated/` from the existing character sheet.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Add package scripts and dependencies**

Create `package.json` with:

```json
{
  "name": "ai-mc-confesta-prototype",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server/index.mjs",
    "build": "tsc --noEmit && vite build",
    "preview": "NODE_ENV=production node server/index.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "crop:character": "python3 scripts/crop_character_sheet.py"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "dotenv": "latest",
    "express": "latest",
    "openai": "latest",
    "react": "latest",
    "react-dom": "latest",
    "vite": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/express": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@types/supertest": "latest",
    "jsdom": "latest",
    "supertest": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Add TypeScript and Vite config**

Create `tsconfig.json` with strict React settings and `vite.config.ts` with React plugin plus Vitest `jsdom` setup.

- [ ] **Step 3: Add local environment docs**

Create `.env.example` with:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=low
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=coral
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependency installation succeeds and creates `package-lock.json`.

- [ ] **Step 5: Commit scaffold**

Run: `git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore .env.example && git commit -m "chore: scaffold ai mc app"`

## Task 2: Pure MC Flow Logic With TDD

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/mcFlow.test.ts`
- Create: `src/lib/mcFlow.ts`

- [ ] **Step 1: Write failing tests**

Create tests that assert:

```ts
expect(canGenerateAnswer("행사 장소가 어디인가요?")).toBe(true);
expect(canGenerateAnswer("   ")).toBe(false);
expect(nextLipFrame(0, 6)).toBe(1);
expect(nextLipFrame(5, 6)).toBe(0);
expect(statusLabel("speaking")).toBe("답변 중");
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/lib/mcFlow.test.ts`

Expected: FAIL because `src/lib/mcFlow.ts` does not exist yet.

- [ ] **Step 3: Implement minimal flow helpers**

Create `src/types.ts` and `src/lib/mcFlow.ts` with `RobotState`, `AudienceQuestion`, `McSession`, `canGenerateAnswer`, `nextLipFrame`, and `statusLabel`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test -- src/lib/mcFlow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit flow logic**

Run: `git add src/types.ts src/lib/mcFlow.ts src/lib/mcFlow.test.ts && git commit -m "feat: add ai mc flow helpers"`

## Task 3: Server API With TDD

**Files:**
- Create: `server/index.test.mjs`
- Create: `server/index.mjs`
- Create: `src/data/eventContext.ts`

- [ ] **Step 1: Write failing API tests**

Create Supertest cases that assert:

```js
await request(app).post("/api/generate-answer").send({ question: "행사 장소?" }).expect(503);
await request(appWithMockClient).post("/api/generate-answer").send({ question: "행사 장소?" }).expect(200);
await request(appWithMockClient).post("/api/tts").send({ text: "안녕하세요" }).expect(200);
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- server/index.test.mjs`

Expected: FAIL because server exports do not exist.

- [ ] **Step 3: Implement Express app and OpenAI calls**

Create `createApp({ openai, env, rootDir })`, `createAnswer`, and `createSpeechAudio`. Use `client.responses.create` for answers and `client.audio.speech.create` for TTS. Return 503 when `OPENAI_API_KEY` is missing.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm test -- server/index.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit server API**

Run: `git add server/index.mjs server/index.test.mjs src/data/eventContext.ts && git commit -m "feat: add ai mc openai server"`

## Task 4: Character Assets

**Files:**
- Create: `scripts/crop_character_sheet.py`
- Create: `assets/characters/generated/*.png`

- [ ] **Step 1: Add crop script**

Create a Pillow script that crops these named regions from `assets/characters/ai-mc-character-sheet.png`: `pose-idle`, `pose-wave`, `pose-listen`, `pose-explain`, `pose-delight`, `pose-think`, and six `mouth-*` frames.

- [ ] **Step 2: Run crop script**

Run: `npm run crop:character`

Expected: generated PNG files appear in `assets/characters/generated/`.

- [ ] **Step 3: Verify dimensions**

Run: `file assets/characters/generated/*.png`

Expected: all generated files are PNG images with alpha.

- [ ] **Step 4: Commit assets**

Run: `git add scripts/crop_character_sheet.py assets/characters/generated && git commit -m "feat: add ai mc sprite assets"`

## Task 5: React UI With Smoke Tests

**Files:**
- Create: `src/setupTests.ts`
- Create: `src/data/sampleQuestions.ts`
- Create: `src/components/ConfestaBackdrop.tsx`
- Create: `src/components/RobotStage.tsx`
- Create: `src/components/OperatorPanel.tsx`
- Create: `src/components/StatusBadge.tsx`
- Create: `src/hooks/useMcSession.ts`
- Create: `src/App.test.tsx`
- Create: `src/App.tsx`
- Create: `src/main.tsx`
- Create: `src/styles.css`

- [ ] **Step 1: Write failing route smoke tests**

Create tests that assert `/demo` renders "AI MC 리허설", `/stage` renders "AI MC", and `/operator` renders "운영자 콘솔".

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL because app components do not exist.

- [ ] **Step 3: Implement UI components**

Implement the demo, stage, and operator routes. Use `DESIGN.md` tokens, official ice cream image, robot generated pose assets, sample questions, editable answer draft, approve/speak flow, and missing-key API errors.

- [ ] **Step 4: Run smoke tests to verify GREEN**

Run: `npm test -- src/App.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit UI**

Run: `git add src index.html && git commit -m "feat: build ai mc prototype UI"`

## Task 6: Build And Browser Verification

**Files:**
- Modify if needed: `src/styles.css`
- Modify if needed: `src/components/*.tsx`

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Start dev server**

Run: `npm run dev`

Expected: server starts on `http://localhost:5173`.

- [ ] **Step 4: Verify screens**

Open:

- `http://localhost:5173/demo`
- `http://localhost:5173/stage`
- `http://localhost:5173/operator`

Expected: each screen renders without overlap, the ice cream visual appears, the robot is visible, and the operator flow can be clicked through.

- [ ] **Step 5: Commit verification fixes**

Run after any final fixes: `git add <changed-files> && git commit -m "fix: polish ai mc prototype"`
