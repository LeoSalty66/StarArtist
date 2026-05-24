import type { LevelData } from './types';
import type { PortraitSet } from '../dialogue/types';

/** Stellar's smile expression portrait set. */
const stellarSmile: PortraitSet = {
  idle: ['/art/portraits/stellar/StellarSmile1.png', '/art/portraits/stellar/StellarSmile2.png'],
  talk: ['/art/portraits/stellar/StellarSmile1.png', '/art/portraits/stellar/StellarSmileTalk.png'],
};

/** Stellar's sad expression portrait set. */
const stellarSad: PortraitSet = {
  idle: ['/art/portraits/stellar/StellarSad1.png', '/art/portraits/stellar/StellarSad2.png'],
  talk: ['/art/portraits/stellar/StellarSad1.png', '/art/portraits/stellar/StellarSadTalk.png'],
};

const chapter1: LevelData[] = [
  {
    id: '1-0',
    name: 'Tutorial',
    givenLines: [],
    lineBudget: 10,
    introDialogue: [
      { speaker: 'Stellar', text: 'Oh, hello there!', portraits: stellarSmile },
      { speaker: 'Stellar', text: "My name is Stellar, and I'm the guardian of these mountains!", portraits: stellarSmile },
      { speaker: 'Stellar', text: 'This is my favorite spot to go stargazing...', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'But all the stars fell out of the sky just a moment ago...', portraits: stellarSad },
      { speaker: 'Stellar', text: 'And broke into pieces.', portraits: stellarSad },
      { speaker: 'Stellar', text: 'Will you help me fix them?', portraits: stellarSad },
    ],
  },
  {
    id: '1-1',
    name: 'Level 1',
    givenLines: [
      { ax: 0.7044, ay: 0.6991, bx: 0.2832, by: 0.396 },
      { ax: 0.7168, ay: 0.3917, bx: 0.3308, by: 0.709 },
      { ax: 0.3308, ay: 0.709, bx: 0.498, by: 0.1953 },
      { ax: 0.498, ay: 0.1953, bx: 0.7044, by: 0.6991 },
    ],
    lineBudget: 5,
    introDialogue: [
      { speaker: 'Stellar', text: "Hey! See those lines? They're almost a star, but not quite.", portraits: stellarSmile },
      { speaker: 'Stellar', text: 'Your job is to finish it! Just draw the missing lines to complete a five-pointed star.', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'Tap and drag to draw. You got this!', portraits: stellarSmile },
    ],
    completionDialogue: [
      { speaker: 'Stellar', text: 'Wow, look at that! A perfect star!', portraits: stellarSmile },
      { speaker: 'Stellar', text: "You're a natural. Let's try another one!", portraits: stellarSmile },
    ],
  },
  {
    id: '1-2',
    name: 'Level 2',
    givenLines: [
      { ax: 0.6447, ay: 0.5973, bx: 0.3229, by: 0.3981 },
      { ax: 0.3229, ay: 0.3981, bx: 0.6769, by: 0.3787 },
      { ax: 0.6769, ay: 0.3787, bx: 0.4071, by: 0.6212 },
      { ax: 0.4071, ay: 0.6212, bx: 0.4453, by: 0.3914 },
      { ax: 0.6447, ay: 0.5973, bx: 0.549, by: 0.3858 },
    ],
    lineBudget: 5,
  },
  {
    id: '1-3',
    name: 'Level 3',
    givenLines: [
      { ax: 0.5112, ay: 0.6082, bx: 0.348, by: 0.7049 },
      { ax: 0.348, ay: 0.7049, bx: 0.5132, by: 0.2951 },
      { ax: 0.5112, ay: 0.6082, bx: 0.6516, by: 0.6907 },
      { ax: 0.6516, ay: 0.6907, bx: 0.5132, by: 0.2951 },
    ],
    lineBudget: 5,
  },
];

export default chapter1;
