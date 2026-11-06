import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

interface Sample {
  file: string; source: string; commit: string; bytes: number; sha256: string;
  expected?: {
    stats: Record<string, number>; records: number; roundTrips: number;
    emptyPages: string[]; issueCounts: Record<string, number>;
  };
  unsupportedHeader?: string;
}
export const rpteamSamples: Sample[] = JSON.parse(readFileSync(new URL('./rpteam/sources.json', import.meta.url), 'utf8'));
export const rpteamSamplePath = (sample: Sample): string => fileURLToPath(new URL(`./rpteam/${sample.file}`, import.meta.url));
export function readRpteamSample(sample: Sample): Buffer {
  const bytes = readFileSync(rpteamSamplePath(sample));
  assert.equal(bytes.length, sample.bytes, `${sample.file}: fixture size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.sha256, `${sample.file}: fixture checksum`);
  return bytes;
}
