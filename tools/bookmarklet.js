/**
 * bookmarklet.js — builds a one-click "Grab Roster" bookmarklet.
 *
 * Click it while the RosterOn ESS roster page is open. It reads the page,
 * checks the roster actually parsed, and copies the text to the clipboard —
 * ready to paste into a file for tools/import_rosteron.js.
 *
 * Why a bookmarklet and not a Chrome extension: no install, no dev-mode
 * warning, no stored credentials, nothing to maintain or re-enable. See
 * README for the comparison.
 *
 * Build:  node tools/bookmarklet.js
 * Then copy the printed javascript: URL into a bookmark.
 */

const fs = require('fs');
const path = require('path');

/* The code that runs in the page. Kept deliberately small and dependency-free. */
function grabRoster() {
  var text = document.body.innerText || '';
  var re = /^([A-Z][a-z]{2})\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.+)$/;
  var timeRe = /^(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})$/;
  var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

  var dates = [];
  for (var i = 0; i < lines.length; i++) {
    var h = re.exec(lines[i]);
    if (!h) continue;
    for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (timeRe.test(lines[j])) { dates.push(h[4] + '-' + h[3] + '-' + h[2]); break; }
    }
  }

  if (!dates.length) {
    alert('No shifts found on this page.\n\nOpen the RosterOn Roster list first, then click again.');
    return;
  }

  dates.sort();
  var msg = 'Copied ' + dates.length + ' shifts\n' + dates[0] + ' to ' + dates[dates.length - 1];

  function done() { alert(msg + '\n\nPaste into a file, then run:\nnode tools/import_rosteron.js <file>'); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { alert('Could not copy automatically — select all and copy manually.'); }
    document.body.removeChild(ta);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

/* ------------------------------------------------------------------ */

const body = grabRoster
  .toString()
  .replace(/^function grabRoster\(\)\s*\{/, '')
  .replace(/\}\s*$/, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .join(' ');

const url = 'javascript:(function(){' + encodeURIComponent(body).replace(/%20/g, ' ') + '})();';

const outPath = path.join(__dirname, 'bookmarklet.txt');
fs.writeFileSync(outPath, url + '\n');

console.log('Bookmarklet built (' + url.length + ' chars) -> tools/bookmarklet.txt\n');
console.log('To install:');
console.log('  1. Chrome > Bookmarks > Bookmark manager > ⋮ > Add new bookmark');
console.log('  2. Name: Grab Roster');
console.log('  3. URL: paste the contents of tools/bookmarklet.txt');
console.log('  4. Open the RosterOn Roster page and click the bookmark.\n');
