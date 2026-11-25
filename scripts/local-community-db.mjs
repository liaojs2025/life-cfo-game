import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Preview and integration tests use the production SQL and a local SQLite file.
export function openCommunityDb(filename) {
  const directory = new URL('../drizzle/', import.meta.url);
  if (filename instanceof URL) mkdirSync(fileURLToPath(new URL('.', filename)),{recursive:true});
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
    if (!sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) {
      sqlite.exec('BEGIN');
      try {
        sqlite.exec(readFileSync(new URL(name,directory),'utf8'));
        sqlite.prepare('INSERT INTO local_migrations VALUES (?)').run(name);
        sqlite.exec('COMMIT');
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  }
  function prepare(sql, bindings=[]) {
    const statement = sqlite.prepare(sql);
    return { bind:(...values)=>prepare(sql, values), run:()=>statement.run(...bindings),
      first:()=>statement.get(...bindings), all:()=>({results: statement.all(...bindings)}) };
  }
  return { prepare, batch:statements=>statements.map(s=>s.all()), close:()=>sqlite.close() };
}
