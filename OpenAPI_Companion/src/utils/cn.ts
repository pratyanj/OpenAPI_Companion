/**
 * Tiny className joiner — filters falsy values and joins with a space.
 * Avoids a dependency for the common conditional-class pattern.
 */
export type ClassValue = string | number | false | null | undefined

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
