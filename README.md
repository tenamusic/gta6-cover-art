# Vice Cover Studio

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![make.fun rank](https://make.fun/badge/gta6-cover-art-01/tenamusic/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![make.fun reward](https://make.fun/badge/gta6-cover-art-01/tenamusic/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

A GTA-style cover art maker for the [gta6-cover-art-01 bounty](https://make.fun/bounty/gta6-cover-art-01): turn your own photo and a caption into a multi-panel sunset-neon poster cover, exported as a PNG to share.

## What it does

- **Any photo** — add photos from your machine; they are read locally with FileReader and never uploaded. Two free sample photos are built in so you can try it at once.
- **Multi-panel poster** — a hero panel plus supporting panels. One photo can fill every panel, or each panel can hold a different photo. Click a panel to select it, then crop it with zoom and position sliders.
- **Bold caption lettering** — a heavy system-sans caption with outline and shadow, plus a tagline, size, colour and placement controls.
- **Sunset / neon colour grade** — four grades (Sunset, Neon Nights, Palm Dusk, Golden Hour) wash every panel with a warm or neon grade, with a skyline silhouette and a low sun for the poster feel.
- **Fast and easy** — a few steps from a photo to a PNG in the common post sizes: **1080 × 1080**, **1080 × 1350** and **1920 × 1080**.

## Try it

Serve `app/` with any static server and open `index.html` in desktop Chrome, for example:

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request, no external font or library — everything the app loads is a file under `app/`.

## Originality

An original design. No Rockstar Games logo, wordmark, official artwork, character or font is used anywhere; lettering uses the system font stack only.

## License

MIT — see `LICENSE`.
