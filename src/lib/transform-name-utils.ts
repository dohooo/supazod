/**
 * Transform snake_case or camelCase to PascalCase
 */
export function defaultTypeNameTransformer(name: string): string {
  if (name.includes('_')) {
    // Handle snake_case to PascalCase
    return name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }
  // Handle camelCase to PascalCase
  return name.charAt(0).toUpperCase() + name.slice(1);
}
