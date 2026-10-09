# Looping game tutorials

Six tutorials built from **recordings of the actual production game engines**. Each delivered MP4 is exactly 5 seconds, 960 × 800, 60 fps / 300 frames, silent H.264 / yuv420p, with a matching first-frame JPEG poster.

The game artwork is not redrawn. Real gameplay video occupies the 840 × 420 screen. The recorded per-frame cursor position drives a coral aiming ray from the phone’s projected top edge. The phone rotates in perspective; its fingertip follows the recorded pressed state. One large sentence-case action teaches each step. Typography uses the app’s native SF Pro system stack, weight 550 and positive 0.5px tracking.

The title sits in a dedicated top zone with generous spacing above the screen. Text resolves to native SF Pro (.SF NS, verified through Chrome’s platform-font inspection). The transition from 4.35–4.9 seconds hides the outgoing action before revealing the opening state, avoiding the former doubled words and ghosted action. A single caption is drawn per frame. The delivered app plays a native muted, inline, looping video; it does not run the composition’s animation logic.

## Source

- `assets/gameplay-*.mp4`: deterministic captures of the actual game artwork.
- `assets/aim-*.json`: recorded normalized cursor/paddle position, pointing input, button state, and phase for each frame.
- `draw.js`: tutorial shell, perspective phone, fingertip, aim ray, and captions. Contains no game illustration code.
- `generate.mjs`: extracts actual opening frames, embeds aim data, and generates the HyperFrames composition and render variants.
- `index.html`: seekable composition with HyperFrames-managed gameplay video and opening-frame reveal.
- `proof/contact-sheet.jpg`: decoded midpoint frames from the delivered videos.
- `proof/validation.json`: verified duration, frame rate, codec, loop seam, motion, and gameplay-art comparison with source footage.

## Reproduce

Capture the gameplay assets first, then run from this folder with Node.js, Python 3, FFmpeg, and the pinned HyperFrames CLI:

```sh
node generate.mjs
npm run check
npm run render
python3 verify.py
```

The render uses one screenshot worker and fresh lossless source frames to keep media timing deterministic. Verification rejects extra frames, a blank opening, or a visible loop seam. The render writes videos into `../../public/tutorials`; verification extracts matching posters and checks every encode. GSAP is bundled locally. Native macOS rendering supplies the SF font; no font files are redistributed.
