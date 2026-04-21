export function substitute(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`,
  );
}
