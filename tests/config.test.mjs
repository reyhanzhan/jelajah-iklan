import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.js';

test('build maps existing Vercel public Supabase variables and prefers VITE values', () => {
  const values = {
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    NEXT_PUBLIC_SUPABASE_URL: ' https://test.supabase.co ',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' sb_publishable_test ',
    NEXT_PUBLIC_SUPABASE_SECRET_KEY: 'must-not-be-exposed',
  };
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, values);
    const resolve = () => config({ mode: 'test' }).define;
    assert.deepEqual(resolve(), {
      'import.meta.env.VITE_SUPABASE_URL': '"https://test.supabase.co"',
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '"sb_publishable_test"',
    });
    process.env.VITE_SUPABASE_URL = 'https://preferred.supabase.co';
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'preferred-public-key';
    assert.equal(resolve()['import.meta.env.VITE_SUPABASE_URL'], '"https://preferred.supabase.co"');
    assert.equal(resolve()['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY'], '"preferred-public-key"');
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
