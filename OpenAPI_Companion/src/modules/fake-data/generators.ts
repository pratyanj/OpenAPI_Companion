/**
 * The 21 v1 fake-data generators (T-07.1, FDD-005). Each is a pure function that
 * produces a valid, realistic value by construction — no network, no locale data
 * (DD/non-goals). Randomness uses `Math.random`; callers wanting reproducibility
 * inject an `rng`. Generators are deliberately small and dependency-free so the
 * whole engine stays well under the perf budget (< 20 ms/field).
 */

export type GeneratorKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'username'
  | 'email'
  | 'password'
  | 'uuid'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'country'
  | 'postalCode'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'integer'
  | 'float'
  | 'decimal'
  | 'url'
  | 'company'

export type FakeValue = string | number | boolean

/** 0..1 random source; injectable for deterministic tests. */
export type Rng = () => number

const FIRST_NAMES = [
  'James',
  'Mary',
  'John',
  'Patricia',
  'Robert',
  'Jennifer',
  'Michael',
  'Linda',
  'David',
  'Elizabeth',
  'Maria',
  'Ahmed',
  'Wei',
  'Sofia',
  'Liam',
  'Olivia',
  'Noah',
  'Emma',
  'Aarav',
  'Yuki',
]
const LAST_NAMES = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Chen',
  'Khan',
  'Patel',
  'Nguyen',
  'Kim',
  'Silva',
  'Müller',
  'Rossi',
  'Andersson',
  'Tanaka',
]
const CITIES = [
  'Springfield',
  'Riverside',
  'Franklin',
  'Greenville',
  'Bristol',
  'Clinton',
  'Fairview',
  'Salem',
  'Georgetown',
  'Madison',
  'Arlington',
  'Ashland',
]
const STATES = [
  'California',
  'Texas',
  'Florida',
  'New York',
  'Illinois',
  'Ohio',
  'Georgia',
  'Washington',
  'Arizona',
  'Colorado',
  'Oregon',
  'Nevada',
]
const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Japan',
  'Australia',
  'Brazil',
  'India',
  'Sweden',
  'Netherlands',
  'Spain',
]
const STREETS = [
  'Main St',
  'Oak Ave',
  'Maple Dr',
  'Cedar Ln',
  'Pine Rd',
  'Elm St',
  'Washington Ave',
  'Park Blvd',
  'Lake View Dr',
  'Sunset Blvd',
]
const COMPANIES = [
  'Acme',
  'Globex',
  'Initech',
  'Umbrella',
  'Soylent',
  'Hooli',
  'Vandelay',
  'Stark',
  'Wayne',
  'Wonka',
]
const COMPANY_SUFFIX = ['Inc', 'LLC', 'Group', 'Corp', 'Labs', 'Co']
const DOMAINS = ['example.com', 'test.dev', 'mail.example', 'sample.org', 'demo.io']

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)] as T
}
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function firstName(rng: Rng): string {
  return pick(rng, FIRST_NAMES)
}
function lastName(rng: Rng): string {
  return pick(rng, LAST_NAMES)
}
function fullName(rng: Rng): string {
  return `${firstName(rng)} ${lastName(rng)}`
}
function username(rng: Rng): string {
  return `${firstName(rng).toLowerCase()}${randInt(rng, 1, 999)}`
}
function email(rng: Rng): string {
  return `${firstName(rng).toLowerCase()}.${lastName(rng).toLowerCase()}@${pick(rng, DOMAINS)}`
}
function password(rng: Rng): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&*?'
  const base = [
    pick(rng, [...upper]),
    pick(rng, [...lower]),
    pick(rng, [...digits]),
    pick(rng, [...symbols]),
  ]
  const all = lower + upper + digits + symbols
  while (base.length < 12) base.push(pick(rng, [...all]))
  // Shuffle so the guaranteed classes aren't always in the first four slots.
  for (let i = base.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i)
    ;[base[i], base[j]] = [base[j] as string, base[i] as string]
  }
  return base.join('')
}
function uuid(rng: Rng): string {
  // RFC 4122 v4 built from the injected RNG (so tests stay deterministic).
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-'
    else if (i === 14) out += '4'
    else if (i === 19) out += hex[(randInt(rng, 0, 15) & 0x3) | 0x8]
    else out += hex[randInt(rng, 0, 15)]
  }
  return out
}
function phone(rng: Rng): string {
  return `+1-${randInt(rng, 200, 999)}-555-${pad(randInt(rng, 0, 9999), 4)}`
}
function address(rng: Rng): string {
  return `${randInt(rng, 1, 9999)} ${pick(rng, STREETS)}`
}
function postalCode(rng: Rng): string {
  return pad(randInt(rng, 0, 99999), 5)
}
function dateValue(rng: Rng): string {
  const y = randInt(rng, 2015, 2025)
  const m = randInt(rng, 1, 12)
  const d = randInt(rng, 1, 28)
  return `${y}-${pad(m, 2)}-${pad(d, 2)}`
}
function datetimeValue(rng: Rng): string {
  return `${dateValue(rng)}T${pad(randInt(rng, 0, 23), 2)}:${pad(randInt(rng, 0, 59), 2)}:${pad(randInt(rng, 0, 59), 2)}Z`
}
function integer(rng: Rng): number {
  return randInt(rng, 1, 10000)
}
function float(rng: Rng): number {
  return Number((rng() * 1000).toFixed(4))
}
function decimal(rng: Rng): number {
  return Number((rng() * 1000).toFixed(2))
}
function url(rng: Rng): string {
  return `https://www.${pick(rng, DOMAINS)}/${username(rng)}`
}
function company(rng: Rng): string {
  return `${pick(rng, COMPANIES)} ${pick(rng, COMPANY_SUFFIX)}`
}

/** The generator registry — the single source of truth for supported keys. */
export const GENERATORS: Record<GeneratorKey, (rng: Rng) => FakeValue> = {
  firstName,
  lastName,
  fullName,
  username,
  email,
  password,
  uuid,
  phone,
  address,
  city: (rng) => pick(rng, CITIES),
  state: (rng) => pick(rng, STATES),
  country: (rng) => pick(rng, COUNTRIES),
  postalCode,
  date: dateValue,
  datetime: datetimeValue,
  boolean: (rng) => rng() < 0.5,
  integer,
  float,
  decimal,
  url,
  company,
}

export const GENERATOR_KEYS = Object.keys(GENERATORS) as GeneratorKey[]

export function isGeneratorKey(key: string): key is GeneratorKey {
  return key in GENERATORS
}

/** Produce a value for a generator key. `rng` defaults to `Math.random`. */
export function generate(key: GeneratorKey, rng: Rng = Math.random): FakeValue {
  return GENERATORS[key](rng)
}
