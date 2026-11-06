import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeLz4Block, parseStringTable, parseRp9Container } from '../src/parser/rp9-container.ts';
import { encodeRp9Payload, parseRp9Payload } from '../src/parser/rp9-payload.ts';
import {gzipSync} from 'node:zlib';

test('LZ4 rejects truncation, back-reference before output and length mismatch', () => {
  assert.throws(() => decodeLz4Block(Buffer.from([0xf0]), 20), /truncated/);
  assert.throws(() => decodeLz4Block(Buffer.from([0, 1, 0]), 4), /distance/);
  assert.throws(() => decodeLz4Block(Buffer.from([0x10, 65]), 2), /mismatch/);
});

test('RP9 containers retain older record versions without accepting older outer containers',()=>{
  const words=(...values:number[])=>{const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>b.writeUInt32LE(v,i*4));return b;};
  const record=(version:number)=>{
    const text=Buffer.from('Axure:PrintConfig'),payload=encodeRp9Payload([{tag:8,value:1}],['Axure:PrintConfig']);
    return Buffer.concat([words(27,version,0,5,0,0xc351,31,1,text.length),text,payload]);
  };
  const records=[8,9].map(version=>{const data=gzipSync(record(version));return Buffer.concat([words(0,data.length),data]);});
  const manifest=Buffer.from(JSON.stringify({root:{parts:{older:0,current:records[0].length}}}));
  assert.ok(manifest.length>=15&&manifest.length<128);
  const compressed=Buffer.concat([Buffer.from([0xf0,manifest.length-15]),manifest]);
  const frame=Buffer.concat([Buffer.from([1,manifest.length,compressed.length]),compressed]);
  const file=Buffer.concat([Buffer.from([0xac,0xef,9,0]),words(frame.length),frame,...records]);
  const parsed=parseRp9Container(file);assert.deepEqual(parsed.records.map(r=>r.inner!.words[1]),[8,9]);
  for(const r of parsed.records){const t=r.inner!;assert.deepEqual(t.strings,['Axure:PrintConfig']);assert.deepEqual(parseRp9Payload(r.payload.subarray(t.payloadStart),t.strings).roots,[{tag:8,value:1}]);}
  const older=Buffer.from(file);older.writeUInt16LE(8,2);assert.throws(()=>parseRp9Container(older),/container version 8/);
  for(const version of [7,10,11])assert.throws(()=>parseStringTable(record(version)),/unsupported inner header/);
  assert.throws(()=>parseStringTable(record(8).subarray(0,40)),/truncated string bytes/);
});
