import fs from 'fs';

const sql = fs.readFileSync('backend/sql/schema.sql', 'utf8');

function extractSchema(content) {
  // Matches CREATE TABLE [IF NOT EXISTS] tableName ( ... );
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
      if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)/i.test(line)) continue;

      const firstSpace = line.search(/\s/);
      if (firstSpace === -1) continue;

      const colName = line.substring(0, firstSpace).replace(/["`]/g, '').trim();
      const rest = line.substring(firstSpace).trim();

      const isPk = /PRIMARY\s+KEY/i.test(rest);
      const isFk = /REFERENCES/i.test(rest) || (colName.endsWith('_id') && colName !== 'id') || colName === 'barangay' || colName === 'applicant_name' || colName === 'submitter_username';
      
      // Extract data type
      let typeMatch = rest.match(/^([a-zA-Z0-9_]+(\s*\([^\)]*\))?)/);
      let dataType = typeMatch ? typeMatch[1].toUpperCase() : 'TEXT';

      // Check for foreign key references target
      let ref = null;
      let refMatch = rest.match(/REFERENCES\s+([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_]+)\)/i);
      if (refMatch) {
        ref = `${refMatch[1]}.${refMatch[2]}`;
      }

      cols.push({
        name: colName,
        type: dataType,
        isPk,
        isFk: Boolean(isFk || ref),
        ref: ref || null
      });
    }

    // Also check ALTER TABLE ADD COLUMN in schema.sql for municipal_projects
    tables[tableName] = cols;
  }

  // Check alter table statements
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

const schema = extractSchema(sql);
console.log('Tables extracted:', Object.keys(schema).length);
for (const [tbl, cols] of Object.entries(schema)) {
  console.log(`${tbl} -> ${cols.length} columns`);
}

fs.writeFileSync('scripts/extracted-schema.json', JSON.stringify(schema, null, 2), 'utf8');

