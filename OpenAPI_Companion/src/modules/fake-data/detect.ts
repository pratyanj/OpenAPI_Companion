import type { GeneratorKey } from './generators'

/**
 * Field-type detection (T-07.2, FR-FDG-001). Picks a generator from a field's
 * NAME first (the strongest signal in a JSON body), then falls back to the
 * current VALUE's runtime type. Returns `null` for fields we can't confidently
 * type — the caller leaves those unchanged (EC-029/EC-030). Detection is
 * best-effort and side-effect-free.
 */

/** Name rules, most-specific first. Tested against the normalized field name. */
const NAME_RULES: ReadonlyArray<[(n: string) => boolean, GeneratorKey]> = [
  [(n) => n.includes('email') || n === 'mail', 'email'],
  [
    (n) => n.includes('username') || n.includes('login') || n.includes('handle') || n === 'user',
    'username',
  ],
  [
    (n) => n.includes('password') || n.includes('passwd') || n === 'pwd' || n.includes('secret'),
    'password',
  ],
  [(n) => n.includes('firstname') || n.includes('givenname') || n === 'fname', 'firstName'],
  [
    (n) =>
      n.includes('lastname') || n.includes('surname') || n.includes('familyname') || n === 'lname',
    'lastName',
  ],
  [
    (n) =>
      n.includes('fullname') ||
      n.includes('displayname') ||
      n.includes('contactname') ||
      n === 'name',
    'fullName',
  ],
  [
    (n) =>
      n.includes('company') ||
      n.includes('organization') ||
      n.includes('organisation') ||
      n.includes('employer') ||
      n.includes('business'),
    'company',
  ],
  [
    (n) =>
      n.includes('phone') ||
      n.includes('mobile') ||
      n.includes('cell') ||
      n === 'tel' ||
      n.includes('telephone'),
    'phone',
  ],
  [(n) => n.includes('address') || n.includes('street'), 'address'],
  [(n) => n.includes('city') || n.includes('town'), 'city'],
  [(n) => n.includes('state') || n.includes('province') || n.includes('region'), 'state'],
  [(n) => n.includes('country') || n.includes('nation'), 'country'],
  [(n) => n.includes('zip') || n.includes('postal') || n.includes('postcode'), 'postalCode'],
  // datetime before date, since "datetime" contains "date".
  [
    (n) =>
      n.includes('datetime') ||
      n.includes('timestamp') ||
      /(created|updated|deleted|modified|expired|published)at$/.test(n) ||
      n === 'time' ||
      n.endsWith('time'),
    'datetime',
  ],
  [
    (n) =>
      n.includes('date') || n.includes('dob') || n.includes('birthday') || n.includes('birthdate'),
    'date',
  ],
  [
    (n) =>
      n.includes('url') ||
      n.includes('uri') ||
      n.includes('website') ||
      n.includes('link') ||
      n.includes('homepage'),
    'url',
  ],
  // Money-ish fields → decimal (2dp). Keeps the `decimal` generator reachable.
  [
    (n) =>
      n.includes('amount') ||
      n.includes('price') ||
      n.includes('cost') ||
      n.includes('total') ||
      n.includes('balance') ||
      n.includes('salary') ||
      n.includes('subtotal') ||
      n.includes('discount') ||
      n === 'fee' ||
      n === 'tax',
    'decimal',
  ],
  [
    (n) =>
      n.startsWith('is') ||
      n.startsWith('has') ||
      n.startsWith('can') ||
      n.startsWith('should') ||
      n.includes('enabled') ||
      n.includes('active'),
    'boolean',
  ],
]

function normalize(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]/g, '')
}

/** Detect id/uuid fields on the RAW name to respect camelCase / _id boundaries. */
function looksLikeId(raw: string): boolean {
  const lower = raw.toLowerCase()
  if (lower === 'uuid' || lower === 'guid' || lower === 'id') return true
  return /(^|_)id$/i.test(raw) || /[a-z]Id$/.test(raw)
}

/**
 * Choose a generator for a field. `value` is the field's current value, used as
 * a fallback signal. Returns `null` when nothing fits (leave the field alone).
 */
export function detectGenerator(fieldName: string, value?: unknown): GeneratorKey | null {
  if (looksLikeId(fieldName)) return 'uuid'

  const n = normalize(fieldName)
  for (const [test, key] of NAME_RULES) {
    if (test(n)) return key
  }

  // Value-type fallback (EC-030): only for types we can generate meaningfully.
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float'

  return null
}
