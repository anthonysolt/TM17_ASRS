const VALID_ATTRIBUTE_TYPES = new Set(['text', 'number', 'date', 'boolean', 'json']);

export function normalizeInitiativeAttributes(attributes = []) {
  if (!Array.isArray(attributes)) return [];
  const seen = new Set();
  return attributes.flatMap((attribute) => {
    const name = typeof attribute === 'string' ? attribute.trim() : String(attribute?.name || '').trim();
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    const requestedType = typeof attribute === 'object' ? attribute.data_type : null;
    return [{ name, data_type: VALID_ATTRIBUTE_TYPES.has(requestedType) ? requestedType : 'text' }];
  });
}

export function syncInitiativeAttributes(db, initiativeId, attributes = []) {
  const normalized = normalizeInitiativeAttributes(attributes);
  const explicitlyTypedNames = new Set(
    (Array.isArray(attributes) ? attributes : [])
      .filter(attribute => typeof attribute === 'object' && VALID_ATTRIBUTE_TYPES.has(attribute?.data_type))
      .map(attribute => String(attribute.name || '').trim().toLowerCase())
  );
  const existing = db.prepare(
    'SELECT attribute_id, name FROM initiative_attribute WHERE initiative_id = ?'
  ).all(Number(initiativeId));
  const incomingNames = new Set(normalized.map(attribute => attribute.name.toLowerCase()));
  const insert = db.prepare(`
    INSERT INTO initiative_attribute (name, data_type, initiative_id)
    VALUES (?, ?, ?)
    ON CONFLICT (initiative_id, name) DO NOTHING
  `);
  const upsertTyped = db.prepare(`
    INSERT INTO initiative_attribute (name, data_type, initiative_id)
    VALUES (?, ?, ?)
    ON CONFLICT (initiative_id, name) DO UPDATE SET data_type = EXCLUDED.data_type
  `);
  for (const attribute of normalized) {
    const statement = explicitlyTypedNames.has(attribute.name.toLowerCase()) ? upsertTyped : insert;
    statement.run(attribute.name, attribute.data_type, Number(initiativeId));
  }
  const remove = db.prepare(`
    DELETE FROM initiative_attribute
    WHERE attribute_id = ?
      AND NOT EXISTS (SELECT 1 FROM field WHERE field.attribute_id = initiative_attribute.attribute_id)
  `);
  for (const attribute of existing) {
    if (!incomingNames.has(attribute.name.toLowerCase())) remove.run(attribute.attribute_id);
  }
  return db.prepare(`
    SELECT attribute_id, name, data_type, initiative_id
    FROM initiative_attribute WHERE initiative_id = ? ORDER BY name
  `).all(Number(initiativeId));
}

export function attributeTypeAcceptsField(dataType, fieldType) {
  const normalizedFieldType = {
    textarea: 'text', email: 'text', url: 'text', select: 'text',
    multiselect: 'json', choice: 'text', radio: 'text', checkbox: 'boolean',
    rating: 'number', yesno: 'boolean',
  }[fieldType] || fieldType;
  return dataType === normalizedFieldType;
}
