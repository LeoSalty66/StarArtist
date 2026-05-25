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
    givenLines: [
      { ax: 0.397, ay: 0.53, bx: 0.2055, by: 0.38 },
      { ax: 0.2055, ay: 0.38, bx: 0.4351, by: 0.383 },
      { ax: 0.4351, ay: 0.383, bx: 0.2529, by: 0.535 },
      { ax: 0.2529, ay: 0.535, bx: 0.3428, by: 0.255 },
      { ax: 0.397, ay: 0.53, bx: 0.3665, by: 0.382 },
    ],
    lineBudget: 1,
    drawTool: 'line',
    introDialogue: [
      { speaker: 'Stellar', text: 'Oh, hello there!', portraits: stellarSmile },
      { speaker: 'Stellar', text: "My name is Stellar, and I'm the guardian of these mountains!", portraits: stellarSmile },
      { speaker: 'Stellar', text: 'This is my favorite spot to go stargazing...', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'But all the stars fell out of the sky just a moment ago...', portraits: stellarSad },
      { speaker: 'Stellar', text: 'And broke into pieces.', portraits: stellarSad },
      { speaker: 'Stellar', text: 'Will you help me fix them?', portraits: stellarSad },
      { speaker: 'Stellar', text: 'If you can repair the broken stars, I can put them back in the night sky!', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'And then we can stargaze again!', portraits: stellarSmile },
      { speaker: 'Stellar', text: "First, I'll show you how to repair stars.", portraits: stellarSmile },
      { speaker: 'Stellar', text: 'This is a 5-pointed star.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/TutorialStar.png'] } },
      { speaker: 'Stellar', text: 'Every 5-pointed star is composed of 6 total shapes...', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/FilledTutorialStar.png'] } },
      { speaker: 'Stellar', text: 'One shape with 5 points,', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/5Points1.png', '/art/ui/tutorial/5Points2.png'] } },
      { speaker: 'Stellar', text: 'And five shapes with 3 points each.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/3Points1.png', '/art/ui/tutorial/3Points2.png'] } },
      { speaker: 'Stellar', text: 'For example, these are not valid stars.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/FalseStar1.png', '/art/ui/tutorial/FalseStar2.png'] } },
      { speaker: 'Stellar', text: 'Each 3-pointed shape shares a single, entire, unique face with the 5-pointed shape.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/SharedEdge.png'] } },
      { speaker: 'Stellar', text: "So these aren't real stars, either.", portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/FalseStar3.png', '/art/ui/tutorial/FalseStar4.png'] } },
      { speaker: 'Stellar', text: 'Oh, one more thing... aside from the 6 shapes, there cannot be any extra lines or shapes.', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'This star will not work.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/FalseStar5.png'] } },
      { speaker: 'Stellar', text: 'Nor will this one.', portraits: stellarSmile, canvasImage: { frames: ['/art/ui/tutorial/FalseStar6.png'] } },
      { speaker: 'Stellar', text: "Those are the ONLY rules! Now you know what a 5-pointed star is!", portraits: stellarSmile },
      { speaker: 'Stellar', text: "You'll be able to fix broken stars by drawing in the missing parts.", portraits: stellarSmile },
      { speaker: 'Stellar', text: 'Careful, though! We only have a limited amount of lines we can use.', portraits: stellarSad },
      { speaker: 'Stellar', text: 'You can see how many lines you have remaining at the top right.', portraits: stellarSmile, showLinesRemaining: true },
      { speaker: 'Stellar', text: "Look, there's a star piece right there!", portraits: stellarSmile, showGivenLines: true },
      { speaker: 'Stellar', text: 'Try using the PEN to fill in the missing section with a line!', portraits: stellarSmile },
      { speaker: 'Stellar', text: 'But if you mess up, you can ERASE, MOVE, or UNDO lines you create.', portraits: stellarSmile },
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
    drawTool: 'line',
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
    drawTool: 'line',
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
    drawTool: 'line',
  },
];

export default chapter1;
