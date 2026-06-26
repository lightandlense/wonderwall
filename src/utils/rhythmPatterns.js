// src/utils/rhythmPatterns.js
// Preset 16-step rhythm bank, ordered sparse -> busy by hit count. Pure data.
const STEPS = 16;
const _ = false, X = true;

const PATTERNS = [
  { name: 'Downbeat',          steps: [X,_,_,_, _,_,_,_, X,_,_,_, _,_,_,_] }, // 2  (0,8)
  { name: 'Backbeat',          steps: [_,_,_,_, X,_,_,_, _,_,_,_, X,_,_,_] }, // 2  (4,12)
  { name: 'Four on the floor', steps: [X,_,_,_, X,_,_,_, X,_,_,_, X,_,_,_] }, // 4  (0,4,8,12)
  { name: 'Offbeat eighths',   steps: [_,_,X,_, _,_,X,_, _,_,X,_, _,_,X,_] }, // 4  (2,6,10,14)
  { name: 'Son clave',         steps: [X,_,_,X, _,_,X,_, _,_,X,_, X,_,_,_] }, // 5  (0,3,6,10,12)
  { name: 'Eighths',           steps: [X,_,X,_, X,_,X,_, X,_,X,_, X,_,X,_] }, // 8
  { name: 'Gallop',            steps: [X,_,X,X, X,_,X,X, X,_,X,X, X,_,X,X] }, // 12
  { name: 'Sixteenths',        steps: [X,X,X,X, X,X,X,X, X,X,X,X, X,X,X,X] }, // 16
];

if (typeof window !== 'undefined') window.rhythmPatterns = { PATTERNS, STEPS };
if (typeof module !== 'undefined') module.exports = { PATTERNS, STEPS };
