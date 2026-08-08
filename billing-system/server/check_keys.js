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

const [rows] = await conn.query(`
  SELECT TABLE_NAME, COUNT(*) as key_count
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'Billimgdb'
  GROUP BY TABLE_NAME
  ORDER BY key_count DESC
`);

console.log('Table Key Counts:');
for (const row of rows) {
  console.log(`  ${row.TABLE_NAME}: ${row.key_count} keys`);
}

await conn.end();
