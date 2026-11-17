// Sign-in by redirect: the request sent to Google, and how its reply is checked.

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { authUrl, readReply } from '../src/lib/auth';

test('the sign-in request asks for a token, back to the app, for one picked file', () => {
  const u = new URL(authUrl('client-123', 'https://example.github.io/networth-tracker/', 'abc'));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const p = Object.fromEntries(u.searchParams);
  assert.equal(p.response_type, 'token');
  assert.equal(p.redirect_uri, 'https://example.github.io/networth-tracker/');
  assert.equal(p.state, 'abc');
  assert.deepEqual(p.scope.split(' ').sort(), ['email', 'https://www.googleapis.com/auth/drive.file', 'openid']);
});

test('a reply is used only when it answers this tab\'s own request', () => {
  const ok = '#state=abc&access_token=tok&expires_in=3599&scope=email%20https://www.googleapis.com/auth/drive.file';
  assert.deepEqual(readReply(ok, 'abc'), { kind: 'token', token: 'tok', expiresIn: 3599, scope: 'email https://www.googleapis.com/auth/drive.file' });
  assert.equal(readReply(ok, 'other').kind, 'error', 'a different request\'s state');
  assert.equal(readReply(ok, null).kind, 'error', 'no request started in this tab');
  assert.deepEqual(readReply('#state=abc&error=access_denied', 'abc'), { kind: 'error', message: 'Sign-in was cancelled.' });
  assert.deepEqual(readReply('', 'abc'), { kind: 'none' }, 'an ordinary page load');
  assert.deepEqual(readReply('#section-3', 'abc'), { kind: 'none' });
});
