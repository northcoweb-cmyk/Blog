// Strum Coach — built-in chords, songs, riffs and the 4-hour lesson path.
// Frets are listed low E (string 6) -> high e (string 1). -1 = don't play that string.
// Fingers: 1 index, 2 middle, 3 ring, 4 pinky, 0 = open / not used.

const CHORDS = [
  { id: 'Em', name: 'E minor', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], level: 1,
    tip: 'The easiest chord there is. Middle and ring fingers side by side on fret 2. Strum all six strings.' },
  { id: 'E', name: 'E major', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], level: 1,
    tip: 'Em plus your index finger on the G string, fret 1.' },
  { id: 'Am', name: 'A minor', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], level: 1,
    tip: 'Same shape as E major, moved over one string. Skip the low E string.' },
  { id: 'A', name: 'A major', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], level: 2,
    tip: 'Three fingers squeezed on fret 2. Tilt them so the high e string still rings.' },
  { id: 'C', name: 'C major', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], level: 2,
    tip: 'A staircase: ring on 3, middle on 2, index on 1. Keep your middle finger off the open G string.' },
  { id: 'G', name: 'G major', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], level: 2,
    tip: 'Big and bright. Middle on the low E, index on the A, ring on the high e. Strum all six.' },
  { id: 'D', name: 'D major', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], level: 2,
    tip: 'A little triangle on the thin strings. Only strum the top four strings (start from the D string).' },
  { id: 'Dm', name: 'D minor', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], level: 2,
    tip: 'Like D, but the high e drops to fret 1 with your index finger.' },
  { id: 'E7', name: 'E seven', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], level: 1,
    tip: 'E major with the ring finger lifted off.' },
  { id: 'A7', name: 'A seven', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], level: 1,
    tip: 'Two fingers on fret 2 with the G string ringing open between them.' },
  { id: 'D7', name: 'D seven', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], level: 2,
    tip: 'A flipped D shape. Strum from the D string.' },
  { id: 'F', name: 'F (easy)', frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], level: 3,
    tip: 'The beginner-friendly F (Fmaj7). No barre needed. Strum the top four strings only.' },
  { id: 'Em7', name: 'E minor 7', frets: [0, 2, 2, 0, 3, 3], fingers: [0, 1, 2, 0, 3, 4], level: 2,
    tip: 'Wonderwall shape: ring and pinky stay anchored on fret 3 of the two thinnest strings.' },
  { id: 'G*', name: 'G (Wonderwall)', frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4], level: 2,
    tip: 'G with ring and pinky anchored on fret 3 of the B and e strings.' },
  { id: 'Dsus4', name: 'D sus4', frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4], level: 2,
    tip: 'Ring and pinky stay put. Index on the G string, fret 2.' },
  { id: 'A7sus4', name: 'A7 sus4', frets: [-1, 0, 2, 0, 3, 3], fingers: [0, 0, 2, 0, 3, 4], level: 2,
    tip: 'Ring and pinky stay put. Middle finger on the D string, fret 2.' },
  { id: 'Cadd9', name: 'C add9', frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], level: 2,
    tip: 'Ring and pinky stay put. Middle on the A string (fret 3), index on the D string (fret 2).' },
];
const CHORD = Object.fromEntries(CHORDS.map((c) => [c.id, c]));

// Near-identical voicings. When you're asked for one, sounding like its sibling still counts.
const SIBLINGS = { C: ['Cadd9'], Cadd9: ['C'], G: ['G*'], 'G*': ['G'], Em: ['Em7'], Em7: ['Em'], D: ['Dsus4'], Dsus4: ['D'], A7: ['A7sus4'], A7sus4: ['A7'], E: ['E7'], E7: ['E'] };
const judgePool = (expectedId, ids) => ids.filter((id) => id === expectedId || !(SIBLINGS[expectedId] || []).includes(id));

const STRING_NAMES = { 6: 'low E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'high e' };
const FINGER_NAMES = { 1: 'index', 2: 'middle', 3: 'ring', 4: 'pinky' };

// Strumming patterns: 8 slots per 4/4 bar (1 & 2 & 3 & 4 &). D = down, U = up, - = skip.
const PATTERNS = {
  quarters: { name: 'Four downs', slots: 'D-D-D-D-', count: '1 2 3 4' },
  eighths: { name: 'Down-up', slots: 'DUDUDUDU', count: '1 & 2 & 3 & 4 &' },
  campfire: { name: 'Campfire (D, DU, UDU)', slots: 'D-DU-UDU', count: '1 2& &4&' },
  halves: { name: 'Two downs', slots: 'D---D---', count: '1 3' },
  waltz: { name: 'Waltz (3/4)', slots: 'D-D-D-', count: '1 2 3' },
};

// Songs: chord progressions only (no lyrics). "C:2" = C for 2 beats; plain "C" = a whole bar.
const SONGS = [
  {
    id: 'knockin', title: "Knockin' on Heaven's Door", artist: 'Bob Dylan', difficulty: 1, bpm: 68, beats: 4,
    pattern: 'quarters', note: 'Four chords, slow tempo. The perfect first song.',
    sections: [
      { name: 'Verse', prog: 'G D Am Am G D C C', repeat: 2 },
      { name: 'Chorus', prog: 'G D Am Am G D C C', repeat: 2 },
    ],
  },
  {
    id: 'standbyme', title: 'Stand By Me', artist: 'Ben E. King', difficulty: 1, bpm: 118, beats: 4,
    pattern: 'quarters', note: 'Played in G here. Same four chords the whole song.',
    sections: [
      { name: 'Verse', prog: 'G G Em Em C D G G', repeat: 2 },
      { name: 'Chorus', prog: 'G G Em Em C D G G', repeat: 1 },
    ],
  },
  {
    id: 'zombie', title: 'Zombie', artist: 'The Cranberries', difficulty: 1, bpm: 84, beats: 4,
    pattern: 'quarters', note: 'Simplified: Em, C, G, D, over and over. Hit it hard.',
    sections: [
      { name: 'Verse', prog: 'Em C G D', repeat: 4 },
      { name: 'Chorus', prog: 'Em C G D', repeat: 4 },
    ],
  },
  {
    id: 'birthday', title: 'Happy Birthday', artist: 'Traditional', difficulty: 1, bpm: 100, beats: 3,
    pattern: 'waltz', note: 'In 3/4 time: count 1-2-3. Everyone can sing along.',
    sections: [{ name: 'Song', prog: 'G G D D D D G G G G C C G D G G', repeat: 1 }],
  },
  {
    id: 'jetplane', title: 'Leaving on a Jet Plane', artist: 'John Denver', difficulty: 1, bpm: 96, beats: 4,
    pattern: 'campfire', note: 'Three friendly chords: G, C and D.',
    sections: [
      { name: 'Verse', prog: 'G C G C G C D D', repeat: 2 },
      { name: 'Chorus', prog: 'G C G C G C D D', repeat: 1 },
    ],
  },
  {
    id: 'alabama', title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd', difficulty: 2, bpm: 98, beats: 4,
    pattern: 'eighths', note: 'D and C for two beats each, then G for a whole bar.',
    sections: [{ name: 'Main riff', prog: 'D:2 C:2 G D:2 C:2 G', repeat: 4 }],
  },
  {
    id: 'badmoon', title: 'Bad Moon Rising', artist: 'Creedence Clearwater Revival', difficulty: 2, bpm: 90, beats: 4,
    pattern: 'quarters', note: 'Counted at half speed. D, A and G.',
    sections: [
      { name: 'Verse', prog: 'D A:2 G:2 D D', repeat: 2 },
      { name: 'Chorus', prog: 'G G D D A G D D', repeat: 1 },
    ],
  },
  {
    id: 'brownEyed', title: 'Brown Eyed Girl', artist: 'Van Morrison', difficulty: 2, bpm: 150, beats: 4,
    pattern: 'quarters', note: 'Fast. Start at 60% speed and build up.',
    sections: [
      { name: 'Verse', prog: 'G C G D', repeat: 4 },
      { name: 'Pre-chorus', prog: 'C D G Em C D', repeat: 1 },
    ],
  },
  {
    id: 'birds', title: 'Three Little Birds', artist: 'Bob Marley', difficulty: 2, bpm: 76, beats: 4,
    pattern: 'eighths', note: 'Simplified to A, D and E. Relaxed reggae feel.',
    sections: [
      { name: 'Chorus', prog: 'A A D A A A D A', repeat: 1 },
      { name: 'Verse', prog: 'A E A D A E D A', repeat: 2 },
    ],
  },
  {
    id: 'letitbe', title: 'Let It Be', artist: 'The Beatles', difficulty: 2, bpm: 72, beats: 4,
    pattern: 'quarters', note: 'Uses the easy F. Chords change every two beats.',
    sections: [
      { name: 'Verse', prog: 'C:2 G:2 Am:2 F:2 C:2 G:2 F:2 C:2', repeat: 2 },
      { name: 'Chorus', prog: 'Am:2 G:2 F:2 C:2 C:2 G:2 F:2 C:2', repeat: 1 },
    ],
  },
  {
    id: 'wonderwall', title: 'Wonderwall', artist: 'Oasis', difficulty: 3, bpm: 87, beats: 4,
    pattern: 'eighths', note: 'Ring and pinky stay anchored the whole song. (Original uses a capo on fret 2.)',
    sections: [
      { name: 'Verse', prog: 'Em7 G* Dsus4 A7sus4', repeat: 4 },
      { name: 'Pre-chorus', prog: 'Cadd9 Dsus4 Em7 Em7 Cadd9 Dsus4 Em7 Em7 Cadd9 Dsus4 A7sus4 A7sus4', repeat: 1 },
      { name: 'Chorus', prog: 'Cadd9 Em7 G* Em7', repeat: 4 },
    ],
  },
];

// Single-note riffs. Each note: s = string (6 low E .. 1 high e), f = fret, b = beats.
const RIFFS = [
  {
    id: 'smoke', title: 'Smoke on the Water', artist: 'Deep Purple', bpm: 112, difficulty: 1,
    note: 'Easy one-string version on the D string (4th string). Open, 3, 5.',
    notes: [
      { s: 4, f: 0, b: 1 }, { s: 4, f: 3, b: 1 }, { s: 4, f: 5, b: 1.5 },
      { s: 4, f: 0, b: 1 }, { s: 4, f: 3, b: 1 }, { s: 4, f: 6, b: 0.5 }, { s: 4, f: 5, b: 2 },
      { s: 4, f: 0, b: 1 }, { s: 4, f: 3, b: 1 }, { s: 4, f: 5, b: 1.5 },
      { s: 4, f: 3, b: 1 }, { s: 4, f: 0, b: 3 },
    ],
  },
  {
    id: 'sevennation', title: 'Seven Nation Army', artist: 'The White Stripes', bpm: 120, difficulty: 1,
    note: 'All on the A string (5th string): 7, 7, 10, 7, 5, 3, 2.',
    notes: [
      { s: 5, f: 7, b: 1.5 }, { s: 5, f: 7, b: 0.5 }, { s: 5, f: 10, b: 0.75 }, { s: 5, f: 7, b: 0.75 },
      { s: 5, f: 5, b: 0.5 }, { s: 5, f: 3, b: 2 }, { s: 5, f: 2, b: 2 },
    ],
  },
  {
    id: 'firstnotes', title: 'First fretted notes', artist: 'Warm-up', bpm: 70, difficulty: 1, hidden: true,
    note: 'Fingertip right behind the fret wire. Press just hard enough for a clean note.',
    notes: [
      { s: 5, f: 2, b: 1 }, { s: 5, f: 3, b: 1 }, { s: 4, f: 2, b: 1 }, { s: 4, f: 3, b: 1 },
      { s: 3, f: 2, b: 1 }, { s: 2, f: 1, b: 1 }, { s: 2, f: 3, b: 1 }, { s: 1, f: 3, b: 1 },
    ],
  },
];

// The Quickstart path: about 4 hours from "never played" to strumming real songs.
const OPEN_STRINGS = { id: 'open', name: 'Open strings', frets: [0, 0, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0] };

const MODULES = [
  {
    id: 'm1', title: 'Get set up', lessons: [
      {
        id: 'welcome', title: 'How this works', mins: 5, steps: [
          { type: 'read', title: 'Your coach has ears and eyes', html: `
            <p><b>Ears (microphone):</b> this is the strict part. It listens to every note and strum and tells you exactly which string is wrong: muted, buzzing, wrong fret, or ringing when it shouldn't.</p>
            <p><b>Eyes (camera):</b> it watches your hands. It checks that your fretting fingers are curled (not flat) and which way your strumming hand moves. It can't read exact fret positions off a webcam, so the microphone is the final judge.</p>
            <p><b>Tips for best results:</b> a quiet room, the laptop about an arm's length away, a light in front of you (not behind), and headphones if you have them so the metronome doesn't get mixed up with your guitar.</p>
            <p>Everything is saved automatically on this computer. No accounts, no keys.</p>` },
          { type: 'mic', title: 'Turn on the microphone' },
          { type: 'camera', title: 'Turn on the camera (optional)' },
        ],
      },
      {
        id: 'tune', title: 'Tune your guitar', mins: 8, steps: [
          { type: 'read', title: 'The six strings', html: `
            <p>Hold the guitar normally. The <b>thickest</b> string (closest to your face) is <b>string 6, low E</b>. The thinnest (closest to the floor) is <b>string 1, high e</b>.</p>
            <p>From thick to thin: <b>E A D G B E</b>. An easy way to remember it: <i>"Eddie Ate Dynamite, Good Bye Eddie."</i></p>
            <p><b>Tuning:</b> pluck one string and turn its peg slowly. Tightening raises the pitch, loosening lowers it. If you're way off, go slow: strings snap when over-tightened.</p>` },
          { type: 'tuner', title: 'Tune all six strings', requireAll: true },
        ],
      },
      {
        id: 'hold', title: 'Hold the guitar & pick', mins: 7, steps: [
          { type: 'read', title: 'Posture', html: `
            <p><b>Sit</b> on a chair without arms. The guitar's waist rests on your right leg (left leg if you're left-handed). Neck points slightly up.</p>
            <p><b>Fretting hand thumb</b> goes behind the neck, roughly behind your middle finger. Don't grip like a baseball bat. Keep a little gap between your palm and the neck.</p>
            <p><b>Fingers:</b> press with the very tips, curled like a claw. Flat fingers touch the strings next to them and mute them, which is the #1 beginner problem.</p>
            <p><b>Pick:</b> hold it between your thumb and the side of your index finger, with just a little tip showing. No pick? Use the side of your thumb.</p>
            <p><b>Sore fingertips are normal</b> for the first 2–3 weeks. Practice in 15–20 minute chunks and take breaks. They toughen up fast.</p>` },
          { type: 'camera-check', title: 'Let the camera see you', optional: true },
        ],
      },
    ],
  },
  {
    id: 'm2', title: 'First sounds', lessons: [
      {
        id: 'open-strings', title: 'Pick each string', mins: 8, steps: [
          { type: 'read', title: 'One string at a time', html: `
            <p>Pluck each string by itself, from thick to thin. Let each one ring. The coach checks that it sounds clean and in tune.</p>
            <p>Aim the pick at <b>one</b> string and move just a little. Small motions = accuracy.</p>` },
          { type: 'strings', title: 'Pluck strings 6 → 1', chord: 'open' },
        ],
      },
      {
        id: 'first-notes', title: 'Fret your first notes', mins: 10, steps: [
          { type: 'read', title: 'How to press a string', html: `
            <p>Put your fingertip <b>just behind</b> the metal fret wire (on the side closer to your body), not on top of it and not in the middle of the gap.</p>
            <p>Press just hard enough for a clean note. If it buzzes: move closer to the fret wire or press a little harder. If it thuds: your finger is too far back or something is touching the string.</p>
            <p>Fret numbers count from the head of the guitar: fret 1 is the first gap.</p>` },
          { type: 'riff', title: 'Play each note', riff: 'firstnotes' },
        ],
      },
      {
        id: 'smoke', title: 'First riff: Smoke on the Water', mins: 12, steps: [
          { type: 'riff', title: 'Smoke on the Water', riff: 'smoke', tempo: true },
        ],
      },
      {
        id: 'sevennation', title: 'Riff: Seven Nation Army', mins: 12, steps: [
          { type: 'riff', title: 'Seven Nation Army', riff: 'sevennation', tempo: true },
        ],
      },
    ],
  },
  {
    id: 'm3', title: 'Your first chords', lessons: [
      {
        id: 'em', title: 'E minor', mins: 12, steps: [
          { type: 'read', title: 'Two fingers, six strings', html: `
            <p>E minor is the easiest full chord. Middle finger on the <b>A string, fret 2</b>. Ring finger on the <b>D string, fret 2</b>.</p>
            <p>First the coach checks every string one at a time. Then you strum the whole thing.</p>` },
          { type: 'chord', chord: 'Em', strums: 3 },
        ],
      },
      {
        id: 'down-strums', title: 'Strumming on the beat', mins: 12, steps: [
          { type: 'read', title: 'Strum from the wrist', html: `
            <p>Strum with a loose wrist, like shaking water off your hand. Your arm moves a little; the wrist does most of the work.</p>
            <p>Hit the strings <b>on</b> the click. Don't rush. It's better to be steady than fast.</p>` },
          { type: 'latency', title: 'Sync the coach with your computer' },
          { type: 'rhythm', title: 'Four downs on Em', pattern: 'quarters', chords: ['Em'], bpm: 60, bars: 4 },
        ],
      },
      {
        id: 'g', title: 'G major', mins: 12, steps: [{ type: 'chord', chord: 'G', strums: 3 }],
      },
      {
        id: 'em-g', title: 'Change: Em ↔ G', mins: 8, steps: [
          { type: 'read', title: 'Changes are the real skill', html: `
            <p>Knowing a chord is one thing. Switching fast is what makes songs work.</p>
            <p><b>Trick:</b> look for fingers that barely move. From Em to G, your middle finger slides from fret 2 on the A string over to fret 3 on the low E, and your index takes its old spot.</p>
            <p>Switch back and forth for one minute. Each clean chord counts.</p>` },
          { type: 'change', a: 'Em', b: 'G', goal: 10 },
        ],
      },
      { id: 'd', title: 'D major', mins: 12, steps: [{ type: 'chord', chord: 'D', strums: 3 }] },
      { id: 'g-d', title: 'Change: G ↔ D', mins: 8, steps: [{ type: 'change', a: 'G', b: 'D', goal: 10 }] },
      { id: 'am', title: 'A minor', mins: 10, steps: [{ type: 'chord', chord: 'Am', strums: 3 }] },
      { id: 'c', title: 'C major', mins: 12, steps: [{ type: 'chord', chord: 'C', strums: 3 }] },
      {
        id: 'am-c', title: 'Change: Am ↔ C', mins: 8, steps: [
          { type: 'read', title: 'Anchor fingers', html: `<p>Am to C: your index and middle fingers <b>don't move at all</b>. Only the ring finger jumps from the G string (fret 2) to the A string (fret 3).</p>` },
          { type: 'change', a: 'Am', b: 'C', goal: 12 },
        ],
      },
      { id: 'c-g', title: 'Change: C ↔ G', mins: 8, steps: [{ type: 'change', a: 'C', b: 'G', goal: 8 }] },
    ],
  },
  {
    id: 'm4', title: 'Rhythm', lessons: [
      {
        id: 'down-up', title: 'Down-up strumming', mins: 10, steps: [
          { type: 'read', title: 'Keep the hand moving', html: `
            <p>Your strumming hand moves down on the numbers (1, 2, 3, 4) and up on the "ands" in between. It <b>never stops</b>, like a pendulum.</p>
            <p>Upstrokes are lighter; you only need to catch the thinner strings.</p>` },
          { type: 'rhythm', title: 'Down-up on G', pattern: 'eighths', chords: ['G'], bpm: 65, bars: 4 },
        ],
      },
      {
        id: 'campfire', title: 'The campfire strum', mins: 15, steps: [
          { type: 'read', title: 'D — DU — UDU', html: `
            <p>The most-used strumming pattern in pop and folk. Count <b>1, 2 &, (3) &, 4 &</b>.</p>
            <p>Down, down-up, <b>skip</b>, up, down-up. On the skipped beat your hand still moves down; it just misses the strings.</p>` },
          { type: 'rhythm', title: 'Campfire strum on G', pattern: 'campfire', chords: ['G'], bpm: 60, bars: 4 },
          { type: 'rhythm', title: 'Campfire strum with changes', pattern: 'campfire', chords: ['G', 'G', 'D', 'D'], bpm: 60, bars: 4 },
        ],
      },
    ],
  },
  {
    id: 'm5', title: 'Play real songs', lessons: [
      { id: 'song-knockin', title: "Knockin' on Heaven's Door", mins: 20, steps: [{ type: 'song', song: 'knockin' }] },
      { id: 'song-standbyme', title: 'Stand By Me', mins: 15, steps: [{ type: 'song', song: 'standbyme' }] },
      { id: 'song-zombie', title: 'Zombie', mins: 15, steps: [{ type: 'song', song: 'zombie' }] },
      {
        id: 'next', title: "What's next", mins: 5, steps: [
          { type: 'read', title: "You're a guitar player now", html: `
            <p>You can tune, fret notes, play two riffs, five chords, and real songs. That's a big deal.</p>
            <p><b>Every day, 20 minutes:</b> tune (1 min) → one-minute changes on your slowest pair (5 min) → a strumming pattern (4 min) → songs (10 min).</p>
            <p><b>Next chords to learn:</b> E, A, Dm and the easy F. They're in the Chords tab. <b>Next songs:</b> Let It Be, Sweet Home Alabama, then Wonderwall.</p>
            <p>The home screen always tells you what to practice based on what you've been struggling with.</p>` },
        ],
      },
    ],
  },
];

const LESSONS = MODULES.flatMap((m) => m.lessons.map((l) => ({ ...l, module: m.id, moduleTitle: m.title })));

// Parse "G D:2 C:2" into [{chord, beats}]
function parseProg(prog, beatsPerBar) {
  return prog.trim().split(/\s+/).map((tok) => {
    const [c, b] = tok.split(':');
    return { chord: c, beats: b ? Number(b) : beatsPerBar };
  });
}

function songTimeline(song) {
  const segs = [];
  let beat = 0;
  for (const sec of song.sections) {
    for (let r = 0; r < (sec.repeat || 1); r++) {
      for (const p of parseProg(sec.prog, song.beats)) {
        segs.push({ ...p, start: beat, section: sec.name });
        beat += p.beats;
      }
    }
  }
  return { segs, totalBeats: beat };
}

function songChords(song) {
  const set = new Set();
  song.sections.forEach((s) => parseProg(s.prog, song.beats).forEach((p) => set.add(p.chord)));
  return [...set];
}
