# Strum Coach 🎸

A guitar teacher in your browser. It **listens** to every string through your microphone and **watches** your hands through your webcam. It tells you exactly what's wrong, like "string 3 is muted, your middle finger is leaning on it", instead of just saying "try again".

No accounts and no API keys. Songs, chords and lessons are built in. Progress saves automatically in your browser.

## How to open it

**Option A: on your website.** Once this branch is deployed to Vercel, go to `yoursite.com/guitar`.

**Option B: on your computer, no internet site needed.** Download [`public/guitar/index.html`](../public/guitar/index.html) (on GitHub: open the file → "Download raw file"), then double-click it. It opens in your browser.

Use **Chrome or Edge** on a laptop or desktop. When it asks for the microphone and camera, click **Allow**. The first time you turn on the camera it needs internet to download the hand-tracking model (about 8 MB). After that the model is cached.

## What's inside

- **The 4-hour Quickstart.** 23 short lessons (about 4 hours): tuning, holding the guitar, first notes, two riffs (Smoke on the Water, Seven Nation Army), five core chords (Em, G, D, Am, C), chord changes, strumming patterns, then three full songs.
- **Chords.** 17 chords. Each one has a string-by-string check (pluck each string and it tells you if it's muted, on the wrong fret, or ringing open) and a strum check.
- **One-minute chord changes.** The fastest way to get better. It counts every clean change and remembers your best.
- **Strumming trainer.** A metronome and a pattern grid that lights up green or red for every strum. It tells you if you're rushing or dragging, missing upstrokes, or hitting the strings on a skipped beat. With the camera on it also checks down vs. up direction.
- **Songs.** 11 songs with built-in chord charts (Knockin' on Heaven's Door, Stand By Me, Zombie, Wonderwall, Let It Be, Sweet Home Alabama and more). *Practice mode* waits until you play each chord right. *Play along* keeps the beat, scores you, and tells you which chord change to drill.
- **Tuner.**
- **Coach suggestions.** The home screen tells you what to practice next, based on what you've been getting wrong.

## Tips for the best results

- A quiet room, with the guitar about an arm's length from the laptop.
- Headphones for the metronome, so the mic only hears your guitar.
- A light **in front** of you and both hands in the camera view.
- Short sessions (20–30 minutes). Sore fingertips are normal for the first couple of weeks.

## What it can and can't do

- **The microphone is the strict judge.** It hears which notes ring and figures out which string is muted, on the wrong fret, or shouldn't be played. The string-by-string check is the most precise tool. The strum check only names a problem string when it's sure. Otherwise it points you to the string-by-string check.
- **The camera** checks that your fretting fingers are curled (not flat), which way your strumming hand moves, and whether it keeps moving. A webcam can't reliably see exact fret positions, so the microphone has the final say on notes.

## For developers

Source is in `guitar/src/`. The page is bundled into one file:

```
npm run guitar:build   # writes public/guitar/index.html
npm test               # includes dev/tests/guitar-dsp.test.js (audio analysis on synthesized guitar sounds)
```

`vercel.json` allows camera and microphone on `/guitar` only. The rest of the site keeps them blocked.
