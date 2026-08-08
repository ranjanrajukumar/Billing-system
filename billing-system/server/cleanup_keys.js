import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'Raju@9452',
  database: 'Billimgdb'
});

// Get all tables
const [tables] = await conn.query(`
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'Billimgdb'
  GROUP BY TABLE_NAME
  HAVING COUNT(*) > 5
  ORDER BY COUNT(*) DESC
`);

let totalDropped = 0;

for (const { TABLE_NAME: table } of tables) {
  const [indexes] = await conn.query(`SHOW INDEX FROM \`${table}\``);

  // Group by column
  const columnToIndexes = {};
  for (const idx of indexes) {
    const col = idx.Column_name;
    if (!columnToIndexes[col]) columnToIndexes[col] = [];
    columnToIndexes[col].push(idx.Key_name);
  }

  // Build a single ALTER TABLE with all drops for this table
  const dropParts = [];
  const fkDropParts = [];

  for (const [, names] of Object.entries(columnToIndexes)) {
    const unique = [...new Set(names)];
    if (unique.length <= 1) continue;

    const keep = unique.find(n => n === 'PRIMARY') || unique[0];
    for (const name of unique) {
      if (name === keep) continue;

      // Check if foreign key
      const [fks] = await conn.query(`
        SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = 'Billimgdb' AND TABLE_NAME = ? 
          AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      `, [table, name]);

      if (fks.length) {
        fkDropParts.push(`DROP FOREIGN KEY \`${name}\``);
      }
      dropParts.push(`DROP INDEX \`${name}\``);
    }
  }

  if (dropParts.length === 0) continue;

  // Batch all drops into a single ALTER TABLE statement
  const allParts = [...fkDropParts, ...dropParts];
  const sql = `ALTER TABLE \`${table}\` ${allParts.join(', ')}`;
  
  console.log(`${table}: dropping ${dropParts.length} duplicate indexes...`);
  try {
    await conn.query(sql);
    totalDropped += dropParts.length;
    console.log(`  ✓ done`);
  } catch (e) {
    console.log(`  ✗ batch failed: ${e.message}`);
    // Fallback: drop one by one
    for (const part of allParts) {
      try {
        await conn.query(`ALTER TABLE \`${table}\` ${part}`);
        if (part.startsWith('DROP INDEX')) totalDropped++;
      } catch (e2) {
        // already dropped
      }
    }
    console.log(`  ✓ done (individual fallback)`);
  }
}

console.log(`\nTotal indexes dropped: ${totalDropped}`);

// Verify
console.log('\n=== Final Key Counts ===');
const [after] = await conn.query(`
  SELECT TABLE_NAME, COUNT(*) as key_count
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'Billimgdb'
  GROUP BY TABLE_NAME
  ORDER BY key_count DESC
`);
for (const row of after) {
  console.log(`  ${row.TABLE_NAME}: ${row.key_count} keys`);
}

await conn.end();
console.log('\n✓ Cleanup complete! You can now restart the server.');
