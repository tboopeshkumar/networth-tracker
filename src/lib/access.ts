// App-level access, compared by hash so no email address is ever shipped.
//
// NOT a security boundary: page code can be edited in the browser. The real
// gates are Google's — the OAuth test-user list, drive.file, and the sheet's
// sharing (Viewer vs Editor). This decides what the UI offers.

const SALT = 'networth-tracker:';

/** Must match tools/hash-email.mjs */
export async function emailHash(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Access { allowed: boolean; canEdit: boolean }

/** Empty lists mean "no restriction" at this level. */
export async function accessFor(email: string, lists: { allowed: string[]; editors: string[] }): Promise<Access> {
  const h = await emailHash(email);
  return {
    allowed: !lists.allowed.length || lists.allowed.includes(h),
    canEdit: !lists.editors.length || lists.editors.includes(h),
  };
}
