/**
 * A tiny strict-object validator for the wire boundary.
 *
 * The Host deliberately imports NO third-party schema library: a profile
 * plugin cannot assume that `zod` (or any other package) is resolvable from
 * the DSH installation, and the Gateway only requires each codec to expose a
 * `create()` factory whose result has `parse()`. These validators reject
 * unknown keys, wrong types, and out-of-range values with a `TypeError` that
 * the Gateway reports as `gateway/input-invalid`.
 *
 * The Client face builds the identical shape from the seeded `zod` module, so
 * both sides agree on names and strictness.
 * @module dsh-smart-session-title/validate
 */

/** Marker for a value that no valid payload can satisfy. */
const INVALID = Symbol('invalid')

/**
 * One string rule.
 * @param options - minimum and maximum length.
 * @returns a validator function.
 */
function stringRule({ min = 1, max = 200, optional = false } = {}) {
  return value => {
    if (value === undefined && optional) return undefined
    if (typeof value !== 'string') throw new TypeError('expected a string')
    if (value.length < min || value.length > max) throw new TypeError(`string length must be ${String(min)}..${String(max)}`)
    return value
  }
}

/**
 * One number rule.
 * @param options - whether the value may be absent.
 * @returns a validator function.
 */
function numberRule({ optional = false } = {}) {
  return value => {
    if (value === undefined && optional) return undefined
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('expected a finite number')
    return value
  }
}

/**
 * One boolean rule.
 * @returns a validator function.
 */
function booleanRule() {
  return value => {
    if (typeof value !== 'boolean') throw new TypeError('expected a boolean')
    return value
  }
}

/**
 * An array of one element rule.
 * @param element - element validator.
 * @param options - minimum and maximum length.
 * @returns a validator function.
 */
function arrayRule(element, { min = 0, max = 50 } = {}) {
  return value => {
    if (!Array.isArray(value)) throw new TypeError('expected an array')
    if (value.length < min || value.length > max) throw new TypeError(`array length must be ${String(min)}..${String(max)}`)
    return value.map((item, index) => {
      try {
        return element(item)
      } catch (error) {
        throw new TypeError(`[${String(index)}]: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }
}

/**
 * A strict object: every declared field is validated and every undeclared
 * field is rejected.
 * @param fields - `name → validator`; a validator returning undefined marks an optional field.
 * @returns a validator function.
 */
function objectRule(fields) {
  const names = Object.keys(fields)
  return value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('expected an object')
    const keys = Object.keys(value)
    for (const key of keys) {
      if (!names.includes(key)) throw new TypeError(`unexpected field ${JSON.stringify(key)}`)
    }
    const result = {}
    for (const name of names) {
      const validated = fields[name](value[name])
      if (validated !== undefined) result[name] = validated
    }
    return result
  }
}

/**
 * Wrap one rule as a strict codec usable by the Typert Gateway.
 * @param typeSymbol - stable type symbol recorded on the descriptor.
 * @param rule - the validator function.
 * @returns a strict codec with a `create()` factory.
 */
export function strictCodec(typeSymbol, rule) {
  return {
    mode: 'strict',
    typeSymbol,
    create() {
      return {
        parse(value) {
          const validated = rule(value)
          if (validated === INVALID) throw new TypeError('value is not acceptable')
          return validated
        },
      }
    },
  }
}

/**
 * Build every wire rule once, so Host and Client cannot drift.
 * @returns named validators.
 */
export function rules() {
  const id = () => stringRule({ min: 1, max: 200 })
  const previewRow = objectRule({
    sessionId: id(),
    oldTitle: stringRule({ min: 0, max: 400 }),
    title: stringRule({ min: 0, max: 400 }),
    status: stringRule({ min: 1, max: 32 }),
  })
  const resultRow = objectRule({
    sessionId: id(),
    status: stringRule({ min: 1, max: 32 }),
    title: stringRule({ min: 0, max: 400, optional: true }),
    reason: stringRule({ min: 1, max: 64, optional: true }),
  })
  return {
    previewBatchInput: objectRule({ workspaceId: id() }),
    previewBatchResult: objectRule({
      previewId: id(),
      expiresAt: numberRule(),
      rows: arrayRule(previewRow, { min: 0, max: 50 }),
    }),
    confirmBatchInput: objectRule({
      previewId: id(),
      sessionIds: arrayRule(id(), { min: 1, max: 50 }),
    }),
    confirmBatchResult: objectRule({
      previewId: id(),
      rows: arrayRule(resultRow, { min: 0, max: 50 }),
    }),
    cancelBatchInput: objectRule({ previewId: id() }),
    cancelBatchResult: objectRule({ previewId: id(), cancelled: booleanRule() }),
    renameSessionInput: objectRule({ sessionId: id() }),
    renameSessionResult: objectRule({
      sessionId: id(),
      status: stringRule({ min: 1, max: 32 }),
      title: stringRule({ min: 0, max: 400 }),
    }),
  }
}
