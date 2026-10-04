const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const paths = process.argv.slice(2);
if (!paths.length) { console.error('Give at least one path'); process.exit(2); }
let failed = false;
const check = (label, pass, extra = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${extra ? ' ' + extra : ''}`); if (!pass) failed = true; };
try {
  for (const p of paths) {
    const res = await fetch(BASE + p);
    const html = await res.text();
    check(`${p} -> 200 HTML`, res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html') && !html.includes('Application error'), `(${res.status})`);
  }
} catch (e) { console.error(`ERROR: ${e.message}. Is the dev server running in Terminal C?`); failed = true; }
console.log(failed ? '\nPage verification FAILED.' : '\nPASS: all pages render.');
process.exit(failed ? 1 : 0);