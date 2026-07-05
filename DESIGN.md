# AI MC Prototype Design System

## Source

Primary reference: https://adl-confesta.kr/

The prototype should borrow the official site's visual language without copying the whole page. The AI MC must still feel like the main product experience.

## Design Direction

Use a playful education-festival stage:

- Deep grape-purple event backdrop.
- Oversized ice cream cone key visual as the main background object.
- Lime ribbon and CTA accents.
- Bubblegum pink and blueberry highlights for status, motion, and small badges.
- Clean vanilla panels for operator controls.
- Cute 3D robot in the foreground, visually tied to the ice cream/scoop motif.

The screen should feel like an event stage, not a generic chatbot dashboard.

## Core Assets

Use these project assets:

- `assets/site/confesta-ice-cream-cone.png`
  - Official ice cream key visual from the site.
  - `1152 x 1920`, transparent PNG.
  - Primary background anchor for `/demo` and `/stage`.
- `assets/site/confesta-hero-sparkle.png`
  - Official sparkle accent from the site.
  - Use sparingly behind the robot or near status badges.
- `assets/characters/ai-mc-character-sheet.png`
  - Generated robot MC character sheet.
  - Use for the speaking/listening/thinking robot.

## Color Tokens

Use these as CSS custom properties:

```css
:root {
  --confesta-hero-bg: oklch(0.42 0.28 295);
  --confesta-grape: #8e14dc;
  --confesta-bubblegum: #ff00a9;
  --confesta-blueberry: #467aff;
  --confesta-lime: #00f444;
  --confesta-lime-ribbon: #c8ff3d;
  --confesta-mango: #ffd11e;
  --confesta-peach: #ffb382;
  --confesta-chocolate: #5a3d78;
  --confesta-vanilla: #fdf8ff;
  --confesta-page: #fdfbff;
  --confesta-ink: #140a29;
  --confesta-muted: #5a5176;
  --confesta-border: #ddd2eb;
  --confesta-soft-shadow: 0 1px 2px #1314280a, 0 8px 24px -12px #1314281a;
  --confesta-pop-shadow: 0 2px 4px #1314280d, 0 20px 40px -16px #1314282e;
}
```

Stage screens should use `--confesta-hero-bg` as the dominant field. Operator screens should use `--confesta-page` and `--confesta-vanilla` with strong lime/grape accents.

## Typography

- Primary UI font: Pretendard.
- Accent display text: rounded, playful Korean display styling inspired by the site.
- Use big display type only for stage status and the robot's spoken message.
- Operator controls should be dense, readable, and work-focused.
- Letter spacing should stay at `0`; do not use negative tracking.

## Stage Composition

For `/stage`:

- Full-bleed grape-purple background.
- Place the ice cream cone as a large vertical anchor on the right or center-back.
- Keep the robot in front of the key visual, slightly left or centered.
- The robot should not be visually swallowed by the cone; use glow, shadow, or a soft separation layer.
- Use one lime ribbon-style subtitle band near the bottom for the approved answer.
- Avoid showing any operator controls.

For `/demo`:

- Left or center: stage preview with robot and ice cream backdrop.
- Right: operator workflow in a clean vanilla panel.
- Keep the stage preview visually close to `/stage` so internal reviewers understand the final event screen.
- Use sample question chips styled like colorful scoop tickets.

For `/operator`:

- Functional layout first.
- Vanilla/page background with grape headings and lime primary actions.
- Question queue items can use small color strips or scoop icons.
- No decorative full-bleed hero treatment; this screen is for repeated work.

## Image Usage Rules

Use `confesta-ice-cream-cone.png` as the main background image:

- Desktop stage: height around `86vh` to `105vh`, positioned behind or beside the robot.
- Demo preview: height around `72%` to `95%` of the stage preview.
- Mobile/narrow preview: crop less, scale down, and keep the robot readable.
- Apply a soft drop shadow consistent with the site: `drop-shadow(0 30px 60px rgba(0,0,0,0.35))`.
- Add a subtle floating motion: translate Y by `-8px` over about `6s`.

Do not blur, darken, or obscure the ice cream image so much that it stops reading as the event key visual.

## Motion

Motion should feel like a polished event mascot:

- Ice cream key visual: slow float.
- Robot idle: gentle bob and head tilt.
- Listening: small ear/screen glow pulse.
- Thinking: slower bob, subtle sparkle or dot motion.
- Speaking: mouth-frame animation plus small body bounce.
- Approved/speaking transition: one confident pop, not a long animation.

Respect `prefers-reduced-motion` and keep the app usable with motion disabled.

## UI Shape Language

- Stage subtitles: lime ribbon or rounded pill band, inspired by the site ribbon.
- Question chips: scoop-ticket feel with saturated accents.
- Buttons: rounded full pills for primary actions, compact icon buttons for repeated tools.
- Panels: radius near `10px`; avoid stacking cards inside cards.
- Operator tables/queues: clear rows, strong selected state, no decorative clutter.

## Copy Tone

The visual style is playful, but the MC voice is composed:

- Friendly and concise.
- Korean-first.
- Appropriate for teachers, education professionals, parents, pre-service teachers, and citizens.
- Cute reactions are allowed, but core event answers should sound reliable.

## Implementation Notes

- Keep design tokens in CSS variables so `/demo`, `/stage`, and `/operator` share the same brand system.
- Build the ice cream visual as a reusable `ConfestaBackdrop` component.
- Build the robot as a separate `RobotStage` layer so the background can change without touching character state.
- Use the official ice cream image as the first-viewport signal on stage and demo screens.
- Avoid generic purple-gradient chatbot aesthetics; the official ice cream key visual must carry the event identity.
