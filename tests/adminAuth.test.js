import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import * as adminService from '../src/services/adminService.js';

// Pure credential/JWT logic — no DB access (login only reads env + bcrypt + jwt).
const PW = process.env.TEST_ADMIN_PASSWORD; // 'Test1234!' (set in env.mjs)

describe('admin login modes', () => {
  test('live admin credentials -> token stamped mode "live"', async () => {
    const r = await adminService.login(process.env.ADMIN_EMAIL, PW);
    assert.ok(r, 'login should succeed');
    assert.equal(r.mode, 'live');
    assert.equal(jwt.verify(r.token, process.env.JWT_SECRET).mode, 'live');
  });

  test('test admin credentials -> token stamped mode "test"', async () => {
    const r = await adminService.login(process.env.TEST_ADMIN_EMAIL, PW);
    assert.ok(r, 'login should succeed');
    assert.equal(r.mode, 'test');
    assert.equal(jwt.verify(r.token, process.env.JWT_SECRET).mode, 'test');
  });

  test('wrong password -> null for both accounts', async () => {
    assert.equal(await adminService.login(process.env.ADMIN_EMAIL, 'nope'), null);
    assert.equal(await adminService.login(process.env.TEST_ADMIN_EMAIL, 'nope'), null);
  });

  test('unknown email -> null', async () => {
    assert.equal(await adminService.login('ghost@nowhere.local', PW), null);
  });
});
