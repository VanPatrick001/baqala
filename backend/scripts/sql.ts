/** Découpe un script SQL en tenant compte des blocs DELIMITER $$ (format du client mysql). */
export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let delimiter = ';';
  let buffer = '';
  for (const line of sql.split(/\r?\n/)) {
    const m = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (m) {
      delimiter = m[1];
      continue;
    }
    buffer += line + '\n';
    if (line.trimEnd().endsWith(delimiter)) {
      const stmt = buffer.trimEnd().slice(0, -delimiter.length).trim();
      const hasCode = stmt.split('\n').some((l) => l.trim() && !l.trim().startsWith('--'));
      if (hasCode) statements.push(stmt);
      buffer = '';
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

