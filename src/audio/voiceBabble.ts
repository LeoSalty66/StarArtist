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
}

/** Play a single random clip with pitch variation. */
function playRandomClip(): void {
  if (!audioCtx || buffers.length === 0) return;
  const buf = buffers[Math.floor(Math.random() * buffers.length)];
  const source = audioCtx.createBufferSource();
  source.buffer = buf;
  // Random pitch shift: 0.85 to 1.15 (±15%)
  source.playbackRate.value = 0.85 + Math.random() * 0.3;
  // Slightly random volume
  const gain = audioCtx.createGain();
  gain.gain.value = 0.3 + Math.random() * 0.2;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

let babbleInterval: number | null = null;
let syllablesLeft = 0;

/**
 * Start continuous babble: clusters of 3-8 syllables with pauses between.
 * Mimics natural speech rhythm.
 */
export function startBabble(): void {
  if (babbleInterval !== null) return;
  preloadVoice().then(() => {
    scheduleNextSyllable();
  });
}

function scheduleNextSyllable(): void {
  if (syllablesLeft <= 0) {
    // Start a new "word": 3-8 syllables
    syllablesLeft = 3 + Math.floor(Math.random() * 6);
    // Pause before starting the word (200-500ms)
    const pause = 200 + Math.random() * 300;
    babbleInterval = window.setTimeout(() => {
      playSyllableAndContinue();
    }, pause);
  } else {
    playSyllableAndContinue();
  }
}

function playSyllableAndContinue(): void {
  if (babbleInterval === null && syllablesLeft <= 0) return; // stopped
  playRandomClip();
  syllablesLeft--;
  // Time between syllables within a word: 80-150ms
  const gap = 80 + Math.random() * 70;
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
