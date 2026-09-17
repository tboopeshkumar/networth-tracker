// Prints the hash the app compares against, for VITE_*_EMAIL_HASHES.
//
//   npm run hash-email -- you@gmail.com [someone@example.com ...]
//
// Must match emailHash() in src/lib/access.ts.
import { createHash } from 'node:crypto';

const emails = process.argv.slice(2);
if (!emails.length) {
  console.error('usage: npm run hash-email -- you@gmail.com [more ...]');
  process.exit(1);
}

const hashes = emails.map((e) =>
  createHash('sha256').update(`networth-tracker:${e.trim().toLowerCase()}`).digest('hex'));

emails.forEach((e, i) => console.error(`${e.trim().toLowerCase()}  →  ${hashes[i]}`));
console.log(hashes.join(','));
