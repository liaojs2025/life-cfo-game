import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NEWS } from '../dist/atlas-news.js';

test('all eighty country/year leads have distinct local photographs and distinct archive originals', async () => {
  const paths = new Set();
  const originals = new Set();
  const digests = new Set();
  for (const country of ['us', 'jp']) {
    for (let year = 1986; year <= 2025; year++) {
      const lead = NEWS[country][year];
      const source = new URL(lead.imageSource);
      const original = source.hostname + decodeURIComponent(source.pathname).replaceAll('_', ' ');
      const bytes = await readFile(new URL('../dist/' + lead.image, import.meta.url));
      const digest = createHash('sha256').update(bytes).digest('hex');
      assert.equal(digest, lead.imageSha256);
      for (const [collection, value] of [[paths, lead.image], [originals, original], [digests, digest]]) {
        assert.ok(!collection.has(value), country + ' ' + year + ' repeats another news photograph');
        collection.add(value);
      }
    }
  }
  assert.equal(digests.size, 80);
});
