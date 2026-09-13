import assert from 'node:assert/strict';

const values = new Map();
globalThis.sessionStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const { getSignedPhotoUrl, getSignedPhotoUrls } = await import('../v2/photo-cache.js');
let calls = 0;
const client = {
  storage: {
    from(bucket) {
      assert.equal(bucket, 'private');
      return {
        async createSignedUrls(paths, expiresIn) {
          calls += 1;
          assert.equal(expiresIn, 3600);
          return { data: paths.map((path) => ({ path, signedUrl: `https://storage.test/${path}?call=${calls}` })) };
        },
      };
    },
  },
};

const first = await getSignedPhotoUrls(client, 'private', ['a.webp', 'a.webp', 'b.webp']);
assert.equal(calls, 1);
assert.match(first['a.webp'], /call=1/);

const second = await getSignedPhotoUrl(client, 'private', 'a.webp');
assert.equal(calls, 1, 'the same signed URL must be reused within the session');
assert.equal(second, first['a.webp']);

await getSignedPhotoUrl(client, 'private', 'c.webp');
assert.equal(calls, 2, 'only a cache miss should call Supabase');

console.log('Photo URL cache QA OK');
