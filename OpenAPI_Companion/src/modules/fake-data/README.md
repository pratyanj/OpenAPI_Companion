# Fake Data Generator — Supported Data

One click fills the open request's **JSON body** with realistic, valid test data. It works entirely offline and never executes the request — you always review before sending.

## How a field is matched

For each field the generator decides what to produce in this order:

1. **By field name** — the name is normalized (lowercased, with `_`, `-`, and spaces removed) and matched against the keywords below. So `first_name`, `firstName`, and `first-name` all resolve the same way.
2. **By value type** — if the name matches nothing, a `true`/`false` value fills as a **boolean** and a numeric value fills as an **integer** or **float**.
3. **Otherwise → left unchanged.** Free-text / domain-specific fields we can't confidently type are never touched (your manual edits and structure stay intact).

> Matching is by **substring** unless the keyword is marked *(exact)* — e.g. `userEmail` matches `email`, but `user` only matches when it's the whole name.

## Supported generators (21)

| Data type    | Fills when the field name contains…                                                              | Example                        |
| ------------ | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| First name   | `firstname`, `givenname`, `fname` *(exact)*                                                       | `David`                        |
| Last name    | `lastname`, `surname`, `familyname`, `lname` *(exact)*                                            | `Rodriguez`                    |
| Full name    | `fullname`, `displayname`, `contactname`, `name` *(exact)*                                        | `David Rodriguez`              |
| Username     | `username`, `login`, `handle`, `user` *(exact)*                                                   | `david42`                      |
| Email        | `email`, `mail` *(exact)*                                                                         | `jane.smith@example.com`       |
| Password     | `password`, `passwd`, `secret`, `pwd` *(exact)*                                                   | `X7k!m2Qp9wZa`                 |
| UUID         | `id` *(exact)*, `uuid`, `guid`, ends with `_id`, or camelCase `…Id` (e.g. `userId`)               | `3f2a1c8e-…-v4`                |
| Phone        | `phone`, `mobile`, `cell`, `telephone`, `tel` *(exact)*                                           | `+1-415-555-0132`              |
| Address      | `address`, `street`                                                                              | `123 Main St`                  |
| City         | `city`, `town`                                                                                    | `Springfield`                  |
| State        | `state`, `province`, `region`                                                                     | `California`                   |
| Country      | `country`, `nation`                                                                               | `United States`               |
| Postal code  | `zip`, `postal`, `postcode`                                                                       | `94103`                        |
| Date         | `date`, `dob`, `birthday`, `birthdate`                                                            | `2023-06-14`                   |
| DateTime     | `datetime`, `timestamp`, `time` *(exact)*, ends with `time`, or `…At` (`createdAt`, `updatedAt`)  | `2023-06-14T09:31:07Z`         |
| Boolean      | starts with `is` / `has` / `can` / `should`, or contains `enabled` / `active` (or a bool value)   | `true`                         |
| Integer      | *(value fallback)* whole-number value                                                            | `4201`                         |
| Float        | *(value fallback)* fractional-number value                                                        | `123.4567`                     |
| Decimal      | `amount`, `price`, `cost`, `total`, `balance`, `salary`, `subtotal`, `discount`, `fee`/`tax` *(exact)* | `249.99`                  |
| URL          | `url`, `uri`, `website`, `link`, `homepage`                                                        | `https://www.example.com/…`    |
| Company      | `company`, `organization`, `organisation`, `employer`, `business`                                 | `Acme Inc`                     |

## Why is my field "unsupported"?

Fields whose name matches none of the keywords above **and** whose value isn't a boolean or number are shown as **unsupported** and left exactly as-is. This is intentional — we only generate realistic values for known types, never random junk into fields we don't understand.

Example: `"cancel_reason": "string"` → normalizes to `cancelreason`, matches no keyword, value is a plain string → **left unchanged**. There's no realistic "reason" type; the same applies to free-text like `description`, `notes`, `comment`, or domain codes like `survey_number` / `quotation_number`.

To fill such a field you can:

- **Rename it** to a recognized name if that fits your API (e.g. a person field called `requester` → `requesterName`).
- **Type it manually** — the rest of the request still auto-fills around it.
- Track the request for a **generic string fallback**, a listed [future enhancement](../../../docs/FEATURE_DESIGN/05_FAKE_DATA_GENERATOR.md#future-enhancements) (a lorem-style value for otherwise-unknown string fields).

## Behavior notes

- **Generate test data** fills only *placeholder* values (`""`, `"string"`, `0`, `null`), so it never clobbers something you typed. **Regenerate all** overwrites recognized fields too. Per-field ↻ always regenerates that one field.
- Nested objects and arrays are filled recursively (e.g. `emails: ["", ""]` fills both).
- The engine and its keyword rules live in [`generators.ts`](./generators.ts) and [`detect.ts`](./detect.ts) — this table is generated from those rules.
