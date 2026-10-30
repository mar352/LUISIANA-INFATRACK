import fs from 'fs';

const sql = fs.readFileSync('backend/sql/schema.sql', 'utf8');

function cleanSchema(content) {
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  let match;
  const tables = {};

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    if (tableName.startsWith('_old')) continue;
    const body = match[2];
    const lines = body.split('\n');
    const cols = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('--')) continue;
      // Skip constraints
      if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)/i.test(line)) continue;
      // Skip lines that start with single or double quotes (enum lists from check constraints)
      if (/^['"]/.test(line)) continue;

      const firstSpace = line.search(/\s/);
      if (firstSpace === -1) continue;

      const colName = line.substring(0, firstSpace).replace(/["`,]/g, '').trim();
      const rest = line.substring(firstSpace).trim();

      // Ensure valid SQL identifier and not duplicate
      if (!/^[a-zA-Z0-9_]+$/.test(colName)) continue;
      if (cols.some(c => c.name === colName)) continue;

      const isPk = /PRIMARY\s+KEY/i.test(rest);

      // Extract SQL type: e.g. VARCHAR(64), DOUBLE PRECISION, INT, BOOLEAN, TIMESTAMPTZ, NUMERIC(15, 2), TEXT, JSONB, DATE
      let typeMatch = rest.match(/^(DOUBLE\s+PRECISION|[A-Z0-9_]+(\s*\([^\)]*\))?)/i);
      let dataType = typeMatch ? typeMatch[1].toUpperCase() : 'TEXT';

      // Check for Foreign Key
      let ref = null;
      let refMatch = rest.match(/REFERENCES\s+([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_]+)\)/i);
      if (refMatch) {
        ref = `${refMatch[1]}.${refMatch[2]}`;
      }

      const isFk = Boolean(
        ref ||
        (colName.endsWith('_id') && colName !== 'id') ||
        (colName.endsWith('_code') && colName !== 'code') ||
        colName === 'barangay' ||
        colName === 'submitter_username' ||
        colName === 'author_username' ||
        (colName === 'username' && tableName !== 'staff_accounts') ||
        (colName === 'actor_username')
      );

      cols.push({
        name: colName,
        type: dataType,
        isPk,
        isFk,
        ref
      });
    }

    tables[tableName] = cols;
  }

  // Idempotent columns for municipal_projects
  const alterRegex = /ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_\(\)]+)/gi;
  let alterMatch;
  while ((alterMatch = alterRegex.exec(content)) !== null) {
    const tName = alterMatch[1];
    const cName = alterMatch[2];
    const cType = alterMatch[3].toUpperCase();
    if (tables[tName] && !tables[tName].find(c => c.name === cName)) {
      tables[tName].push({
        name: cName,
        type: cType,
        isPk: false,
        isFk: cName.endsWith('_id') || cName === 'application_id',
        ref: null
      });
    }
  }

  return tables;
}

const cleaned = cleanSchema(sql);
console.log('Cleaned tables count:', Object.keys(cleaned).length);
for (const [tbl, cols] of Object.entries(cleaned)) {
  console.log(`${tbl}: ${cols.length} attributes`);
}
fs.writeFileSync('scripts/cleaned-attributes-schema.json', JSON.stringify(cleaned, null, 2), 'utf8');

