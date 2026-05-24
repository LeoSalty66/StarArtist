/**
 * Stellar's babble voice system.
 * Plays random clips from the voice pool with pitch variation and
 * natural speech-like timing (clusters of syllables with pauses).
 */

const CLIP_FILES = [
  'StellarVoices00000026.mp3',
  'StellarVoices00000066.mp3',
  'StellarVoices00000098.mp3',
  'StellarVoices00000176.mp3',
  'StellarVoices00000204.mp3',
  'StellarVoices00000283.mp3',
  'StellarVoices00000297.mp3',
  'StellarVoices00000310.mp3',
  'StellarVoices00000334.mp3',
  'StellarVoices00000399.mp3',
  'StellarVoices00000414.mp3',
  'StellarVoices00000508.mp3',
  'StellarVoices00000523.mp3',
  'StellarVoices00000536.mp3',
  'StellarVoices00000718.mp3',
  'StellarVoices00000826.mp3',
  'StellarVoices00000909.mp3',
  'StellarVoices00001605.mp3',
  'StellarVoices00001638.mp3',
  'StellarVoices00001667.mp3',
  'StellarVoices00001679.mp3',
  'StellarVoices00001769.mp3',
  'StellarVoices00001784.mp3',
  'StellarVoices00001813.mp3',
  'StellarVoices00001842.mp3',
  'StellarVoices00001901.mp3',
  'StellarVoices00001924.mp3',
  'StellarVoices00001974.mp3',
  'StellarVoices00002096.mp3',
  'StellarVoices00002122.mp3',
  'StellarVoices00002141.mp3',
  'StellarVoices00002203.mp3',
  'StellarVoices00002221.mp3',
  'StellarVoices00002271.mp3',
  'StellarVoices00002279.mp3',
  'StellarVoices00002288.mp3',
  'StellarVoices00002296.mp3',
  'StellarVoices00002397.mp3',
  'StellarVoices00002436.mp3',
  'StellarVoices00002495.mp3',
  'StellarVoices00002526.mp3',
  'StellarVoices00002549.mp3',
  'StellarVoices00002635.mp3',
  'StellarVoices00002703.mp3',
  'StellarVoices00002972.mp3',
  'StellarVoices00003045.mp3',
  'StellarVoices00003072.mp3',
  'StellarVoices00003384.mp3',
  'StellarVoices00003420.mp3',
];

const BASE_PATH = '/audio/stellar/';

let audioCtx: AudioContext | null = null;
let buffers: AudioBuffer[] = [];
let loaded = false;
let shortIdxs: Set<number> = new Set();
let longIdxs: Set<number> = new Set();
let long20Idxs: Set<number> = new Set();

/** Preload all voice clips into audio buffers. */
export async function preloadVoice(): Promise<void> {
  if (loaded) return;
  audioCtx = new AudioContext();
  const promises = CLIP_FILES.map(async (file) => {
    const res = await fetch(BASE_PATH + file);
    const arrayBuf = await res.arrayBuffer();
    return audioCtx!.decodeAudioData(arrayBuf);
  });
  buffers = await Promise.all(promises);
  loaded = true;

  // Identify the 10 shortest and 10 longest clips by duration.
  // Also track the top 20 longest for additional gap reduction.
  const indexed = buffers.map((b, i) => ({ i, dur: b.duration }));
  indexed.sort((a, b) => a.dur - b.dur);
  shortIdxs = new Set(indexed.slice(0, 10).map((x) => x.i));
  longIdxs = new Set(indexed.slice(-10).map((x) => x.i));
  long20Idxs = new Set(indexed.slice(-20).map((x) => x.i));
}

let lastClipIdx = -1;
let lastClipCategory: 'short' | 'long' | 'mid' = 'mid';
let recentClips: number[] = [];

/** Play a single random clip (never one that was in the last 3 used). */
function playRandomClip(): void {
  if (!audioCtx || buffers.length === 0) return;
  let idx = Math.floor(Math.random() * buffers.length);
  // Avoid repeating any of the last 3 clips
  if (buffers.length > 3) {
    while (recentClips.includes(idx)) {
      idx = Math.floor(Math.random() * buffers.length);
    }
  }
  recentClips.push(idx);
  if (recentClips.length > 3) recentClips.shift();
  lastClipIdx = idx;
  lastClipCategory = longIdxs.has(idx) ? 'long' : shortIdxs.has(idx) ? 'short' : 'mid';
  const buf = buffers[idx];
  const source = audioCtx.createBufferSource();
  source.buffer = buf;
  // No pitch shifting, keep natural voice
  source.playbackRate.value = 1.0;
  // Slightly random volume
  const gain = audioCtx.createGain();
  gain.gain.value = 0.3 + Math.random() * 0.2;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

let babbleInterval: number | null = null;
let syllablesLeft = 0;
let useWordPauses = false;

/**
 * Start continuous babble.
 * @param withPauses - If true, adds 400-800ms pauses between "word" clusters (3-8 syllables).
 *                     Default is false (continuous stream with no pauses).
 */
export function startBabble(withPauses = false): void {
  if (babbleInterval !== null) return;
  useWordPauses = withPauses;
  preloadVoice().then(() => {
    scheduleNextSyllable();
  });
}

function scheduleNextSyllable(): void {
  if (syllablesLeft <= 0) {
    // Start a new "word": 3-8 syllables
    syllablesLeft = 3 + Math.floor(Math.random() * 6);
    if (useWordPauses) {
      // Pause before starting the word (400-800ms)
      const pause = 400 + Math.random() * 400;
      babbleInterval = window.setTimeout(() => {
        playSyllableAndContinue();
      }, pause);
    } else {
      // No pause — continue immediately
      playSyllableAndContinue();
    }
  } else {
    playSyllableAndContinue();
  }
}

function playSyllableAndContinue(): void {
  if (babbleInterval === null && syllablesLeft <= 0) return; // stopped
  playRandomClip();
  syllablesLeft--;
  // Time between syllables: adjust based on clip length category
  let gap = 400 + Math.random() * 100;
  if (lastClipCategory === 'long') gap += 100;
  else if (lastClipCategory === 'short') gap -= 130; // -100 base, -30 extra
  // Additional 50ms reduction for the 20 longest clips
  if (long20Idxs.has(lastClipIdx)) gap -= 50;
  babbleInterval = window.setTimeout(() => {
    if (babbleInterval !== null) {
      scheduleNextSyllable();
    }
  }, gap);
}

/** Stop babbling. */
export function stopBabble(): void {
  if (babbleInterval !== null) {
    clearTimeout(babbleInterval);
    babbleInterval = null;
  }
  syllablesLeft = 0;
}

/** Check if currently babbling. */
export function isBabbling(): boolean {
  return babbleInterval !== null;
}
