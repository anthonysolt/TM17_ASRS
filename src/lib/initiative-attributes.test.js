import Database from 'better-sqlite3';
import { attributeTypeAcceptsField, normalizeInitiativeAttributes, syncInitiativeAttributes } from '@/lib/initiative-attributes';

describe('initiative attributes', () => {
  test('normalizes names, types, and duplicates', () => {
    expect(normalizeInitiativeAttributes(['School', { name: 'Score', data_type: 'number' }, { name: 'school', data_type: 'date' }]))
      .toEqual([{ name: 'School', data_type: 'text' }, { name: 'Score', data_type: 'number' }]);
  });

  test('sync preserves removed attributes linked to fields', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE initiative_attribute (attribute_id INTEGER PRIMARY KEY, name TEXT NOT NULL, data_type TEXT NOT NULL, initiative_id INTEGER NOT NULL, UNIQUE (initiative_id, name));
      CREATE TABLE field (field_id INTEGER PRIMARY KEY, attribute_id INTEGER);
    `);
    const attributes = syncInitiativeAttributes(db, 2, [{ name: 'Score', data_type: 'number' }, 'School']);
    const score = attributes.find(attribute => attribute.name === 'Score');
    db.prepare('INSERT INTO field (field_id, attribute_id) VALUES (?, ?)').run(1, score.attribute_id);
    syncInitiativeAttributes(db, 2, []);
    expect(db.prepare('SELECT name FROM initiative_attribute ORDER BY name').all()).toEqual([{ name: 'Score' }]);
  });

  test('matches semantic attribute types to question types', () => {
    expect(attributeTypeAcceptsField('number', 'rating')).toBe(true);
    expect(attributeTypeAcceptsField('text', 'radio')).toBe(true);
    expect(attributeTypeAcceptsField('date', 'text')).toBe(false);
  });
});
