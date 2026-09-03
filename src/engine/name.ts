// Turn an arbitrary user string into a token prefix that is valid EVERYWHERE we emit it:
// CSS custom properties, SCSS variables, Tailwind keys, JS identifiers, and DTCG group names.
// The safe intersection is lowercase kebab-case that does not start with a digit.

export function sanitizeTokenName(input?: string | null): string {
  let s = (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics → single hyphen
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, '') // trim edge hyphens
    .slice(0, 40); // keep identifiers sane
  s = s.replace(/-+$/g, ''); // re-trim in case slice cut mid-hyphen
  if (!s) return 'brand'; // empty / all-symbols → safe default
  return /^[0-9]/.test(s) ? `c-${s}` : s; // identifiers must not start with a digit
}
