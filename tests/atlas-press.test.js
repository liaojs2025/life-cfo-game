import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NEWS, OPENING } from '../dist/atlas-news.js';
import { EVENTS, getCampaignYears } from '../dist/atlas-scenarios.js';

test('every opening has a dated prior-year lead, a licensed photo, and contemporaneous context', async () => {
  const digestByPath = new Map();
  for (const country of ['us', 'jp']) {
    for (const { year, aiContext } of getCampaignYears(country)) {
      const lead = NEWS[country][year - 1];
      const opening = OPENING[country][year];
      assert.equal(lead.year, year - 1);
      assert.equal(opening.newsId, lead.id);
      assert.ok(lead.knownBy <= opening.asOf && opening.asOf <= year + '-01-01');
      assert.ok(lead.imageDate.slice(0, 4) <= String(lead.year));
      assert.match(lead.imageKind, /^(event|background)$/);
      for (const field of ['imageCredit','imageLicense','imageCaption','summary','impact']) assert.ok(lead[field]);
      for (const url of [lead.imageSource, lead.imageLicenseUrl, lead.sourceUrl]) assert.equal(new URL(url).protocol, 'https:');
      if (!digestByPath.has(lead.image)) {
        const bytes = await readFile(new URL('../dist/' + lead.image, import.meta.url));
        assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, 'news uses local JPEG photography');
        digestByPath.set(lead.image, createHash('sha256').update(bytes).digest('hex'));
      }
      assert.equal(digestByPath.get(lead.image), lead.imageSha256);
      assert.doesNotMatch(JSON.stringify(aiContext), /https?:|(?:19|20)\d\d年|FIRREA|NAFTA|软银|格林斯潘|关西机场/);
    }
  }
});

test('a long-form historical dossier and its annual lead share a single archive card', () => {
  const keys = EVENTS.map(event=>[event.country,event.date,event.title].join('/'));
  assert.equal(new Set(keys).size, keys.length);
  const ids = new Set(EVENTS.map(event=>event.id));
  for (const event of EVENTS) for (const link of event.relatedIds) assert.ok(ids.has(link));
});
