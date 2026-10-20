import test from 'node:test';
import assert from 'node:assert/strict';
import { chatName, deaccent, entityName, textOf } from '../src/format.mjs';

test('entityName prefers the title, then full name, then username, then id', () => {
  assert.equal(entityName({ title: 'Team' }), 'Team');
  assert.equal(entityName({ firstName: 'Mary', lastName: 'K' }), 'Mary K');
  assert.equal(entityName({ firstName: 'Mary' }), 'Mary');
  assert.equal(entityName({ username: 'mary' }), 'mary');
  assert.equal(entityName({ id: 42 }), '42');
  assert.equal(entityName(null), '');
});

test('chatName falls back from chat to sender', () => {
  assert.equal(chatName({ chat: { title: 'Team' }, sender: { firstName: 'Mary' } }), 'Team');
  assert.equal(chatName({ sender: { firstName: 'Mary' } }), 'Mary');
  assert.equal(chatName({}), '');
});

test('textOf collapses whitespace in text', () => {
  assert.equal(textOf({ message: '  hello \n  world  ' }), 'hello world');
});

test('textOf keeps the author line breaks when asked', () => {
  const grid = 'Wordle 1900 5/6*\n#####\n+++++';
  assert.equal(textOf({ message: grid }, { collapse: false }), grid);
  assert.equal(textOf({ message: grid }).includes('\n'), false);
});

test('textOf normalises CRLF', () => {
  assert.equal(textOf({ message: 'a\r\nb' }, { collapse: false }), 'a\nb');
});

test('textOf describes media when there is no text', () => {
  assert.equal(textOf({ media: { className: 'MessageMediaPhoto' } }), '[photo]');
  assert.equal(textOf({}), '[empty]');
});

test('deaccent is accent- and case-insensitive', () => {
  assert.equal(deaccent('\u00C5ngstr\u00F6m'), 'angstrom');
  assert.equal(deaccent('Caf\u00E9'), 'cafe');
  assert.equal(deaccent(undefined), '');
  assert.equal(deaccent('MARY'), deaccent('mary'));
});
