import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv, list, excluded } from '../src/env.mjs';

function envFile(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgub-'));
  const p = path.join(dir, '.env');
  fs.writeFileSync(p, text);
  return p;
}

test('parses KEY=VALUE, ignores comments and blank lines', () => {
  const p = envFile('# a comment\n\nFOO=bar\nBAZ = qux \n  # indented comment\nNOVALUE\n');
  delete process.env.FOO; delete process.env.BAZ;
  loadEnv(p);
  assert.equal(process.env.FOO, 'bar');
  assert.equal(process.env.BAZ, 'qux');
  assert.equal(process.env.NOVALUE, undefined);
});

test('strips quotes and unescapes inside double quotes', () => {
  const p = envFile('A="one\\ntwo"\nB="tab\\there"\nC=\'three\'\nD="quote: \\"x\\""\nE="back\\\\slash"\n');
  delete process.env.A; delete process.env.B; delete process.env.C;
  delete process.env.D; delete process.env.E;
  loadEnv(p);
  assert.equal(process.env.A, 'one\ntwo');
  assert.equal(process.env.B, 'tab\there');
  assert.equal(process.env.C, 'three');
  assert.equal(process.env.D, 'quote: "x"');
  assert.equal(process.env.E, 'back\\slash');
});

test('a multi-line template survives a single line of .env', () => {
  const p = envFile('T="Chat: {chat}\\nFrom: {sender}\\n\\"{text}\\""\n');
  delete process.env.T;
  loadEnv(p);
  assert.equal(process.env.T, 'Chat: {chat}\nFrom: {sender}\n"{text}"');
});

test('does not override variables that are already set', () => {
  const p = envFile('KEEP=from-file\n');
  process.env.KEEP = 'from-env';
  loadEnv(p);
  assert.equal(process.env.KEEP, 'from-env');
});

test('a missing env file is not an error', () => {
  assert.doesNotThrow(() => loadEnv(path.join(os.tmpdir(), 'tgub-does-not-exist-12345.env')));
});

test('list() splits, trims and drops empties', () => {
  process.env.TGUB_LIST = ' a , b ,, c ';
  assert.deepEqual(list('TGUB_LIST'), ['a', 'b', 'c']);
  process.env.TGUB_LIST = '';
  assert.deepEqual(list('TGUB_LIST'), []);
  delete process.env.TGUB_LIST;
  assert.deepEqual(list('TGUB_LIST'), []);
});

test('excluded() reads EXCLUDE as a set', () => {
  process.env.EXCLUDE = 'Work, News';
  assert.deepEqual([...excluded()], ['Work', 'News']);
  delete process.env.EXCLUDE;
});
