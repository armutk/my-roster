/**
 * Regenerates the ROSTER_FALLBACK constant in src/js/app.js from src/data/roster.json
 * so the offline/file:// fallback can never drift from the real data.
 * Run after every roster.json change:  node tools/sync_fallback.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsonPath = path.join(root, 'src/data/roster.json');
const appPath = path.join(root, 'src/js/app.js');

const data = fs.readFileSync(jsonPath, 'utf8').trimEnd();
let app = fs.readFileSync(appPath, 'utf8');

const startMarker = '  const ROSTER_FALLBACK = ';
const startIdx = app.indexOf(startMarker);
if (startIdx === -1) throw new Error('ROSTER_FALLBACK marker not found in app.js');

// find the terminating "};" at the same indentation
const endMarker = '\n  };\n';
const endIdx = app.indexOf(endMarker, startIdx);
if (endIdx === -1) throw new Error('End of ROSTER_FALLBACK not found');

// indent the JSON body by 2 spaces to match surrounding code
const indented = data.split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n');
const replacement = startMarker + indented + ';\n';

app = app.slice(0, startIdx) + replacement + app.slice(endIdx + endMarker.length);
fs.writeFileSync(appPath, app);

const parsed = JSON.parse(data);
console.log(`Synced ROSTER_FALLBACK: ${parsed.shifts.length} shifts, ${parsed.shifts.reduce((s,x)=>s+x.paidHours,0)} hours`);
