# AI MC Prototype Design

## Context

Digital Learning Confesta needs a real event-ready AI MC prototype. The MC is a cute but composed 3D-feeling robot character that introduces itself, thanks attendees, answers audience questions, and speaks with visible mouth movement.

The prototype should prioritize fast internal review while keeping the structure close to real event operation.

Reference site: https://adl-confesta.kr/

## Goals

- Show a believable AI MC experience for an internal meeting.
- Use a 2.5D character sheet now, with a path to replace it with a true 3D model later.
- Let operators choose audience questions before AI answers are shown or spoken.
- Require operator approval or editing before the robot speaks.
- Generate spoken Korean audio through OpenAI TTS.
- Animate the character while idle, listening, thinking, and speaking.

## Non-Goals

- Full production event reliability.
- Offline fallback mode.
- Real QR-based attendee chat intake.
- Final 3D model rigging.
- Complete moderation dashboard or admin authentication.

These are later event-readiness items, not blockers for the first prototype.

## Audience And Tone

The robot MC should feel cute, calm, intelligent, and appropriate for teachers, education specialists, parents, pre-service teachers, and the public. It should not sound childish.

The assistant may answer:

- Event schedule, place, program, and FAQ-style questions based on the official site.
- AI and digital learning questions at a high level.
- Light character questions such as identity, mood, and greeting.

The assistant should avoid or gracefully decline:

- Politics, hate, harassment, adult content, medical/legal advice, private personal data, and unverified event operations.
- Claims that are not available from the official event context.

## Screens

### `/demo`

Internal meeting mode. One screen includes:

- AI robot MC stage area.
- Sample audience questions.
- Manual question input.
- AI answer draft area.
- Operator edit and approve controls.
- Speak button that triggers TTS and lip movement.

This is the first screen to build because it demonstrates the whole flow quickly.

### `/stage`

Event screen mode. The public display includes only:

- AI robot MC.
- Current question or short prompt when appropriate.
- Approved answer subtitle.
- Speaking/listening/thinking visual state.

No operator controls appear here.

### `/operator`

Operator mode. The control display includes:

- Question queue.
- Selected question.
- Generate answer action.
- Editable answer draft.
- Approve and speak action.
- Status of the stage character.

For the prototype, this can share local browser state with `/demo`; production can later move to a server-backed shared session.

## Interaction Flow

1. Operator selects a sample question or types a new question.
2. App sends the question plus the AI MC persona and event context to OpenAI.
3. AI returns a concise Korean answer draft.
4. Operator reviews and edits the answer.
5. Operator approves the answer.
6. App sends the approved answer to OpenAI TTS.
7. Robot enters `speaking` state, audio plays, subtitles display, and mouth frames animate.
8. Robot returns to `idle` when speech ends.

## Character Asset

Generated character sheet:

- `assets/characters/ai-mc-character-sheet.png`
- `assets/characters/ai-mc-character-sheet-green.png`

The first prototype uses cropped regions from the sheet:

- Full-body poses for idle, greeting, listening, explaining, delighted, and thinking.
- Mouth/face frames for closed, small open, wide open, smile open, O, and E shapes.

The implementation should isolate character rendering behind a component so the sheet can later be replaced by a GLB/Three.js model.

## Architecture

Use a Vite React app.

Suggested modules:

- `src/App.tsx`: route selection and layout shell.
- `src/data/eventContext.ts`: official event context and AI MC guardrails.
- `src/data/sampleQuestions.ts`: meeting-ready sample questions.
- `src/components/RobotStage.tsx`: character state, stage visual, subtitles, lip animation.
- `src/components/OperatorPanel.tsx`: question queue, answer draft, approval controls.
- `src/lib/openaiClient.ts`: API calls for answer generation and TTS.
- `src/hooks/useMcSession.ts`: shared prototype session state.

## API Handling

The prototype can call OpenAI from a local development server endpoint to avoid exposing the API key in the browser. The browser should call local endpoints such as:

- `POST /api/generate-answer`
- `POST /api/tts`

The server reads `OPENAI_API_KEY` from environment variables.

If the key is missing, the UI should show a clear local-only error and keep the rest of the prototype usable.

## Error Handling

- If answer generation fails, keep the selected question and show a retryable error.
- If TTS fails, keep the approved answer visible and allow retry.
- If audio playback is blocked by the browser, require an operator click before speaking.
- If the user enters an empty question, disable answer generation.

## Testing And Verification

For the first prototype:

- Run install/build or dev server startup successfully.
- Confirm `/demo`, `/stage`, and `/operator` render.
- Confirm sample question selection and manual question input work.
- Confirm missing API key is handled cleanly.
- Confirm speaking state animates even if TTS is not called in local testing.

Browser visual QA should check desktop-sized event display and laptop operator display.

## Open Questions For Later

- Whether attendee submission should use QR/websocket, form polling, or a managed chat source.
- Whether stage and operator screens need separate devices with shared backend state.
- Final TTS voice choice.
- Final 3D model style and rigging pipeline.
- Offline fallback script and emergency manual mode.
