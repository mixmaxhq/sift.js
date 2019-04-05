/*
 *
 * Copryright 2018, Craig Condon
 * Licensed under MIT
 *
 * Filter JavaScript objects with mongodb queries
 */

import {
  get,
  has,
  isFunction,
  isRegExp,
  isObject,
  maybeAsyncEvery,
  maybeAsyncSome,
  maybeAsyncThen,
} from './utils';

/**
 */

function comparable(value) {
  if (value instanceof Date) {
    return value.getTime();
  } else if (Array.isArray(value)) {
    return value.map(comparable);
  } else if (value && typeof value.toJSON === 'function') {
    return value.toJSON();
  } else {
    return value;
  }
}

/**
 */

function or(validator) {
  return function(params, inputValue) /*: boolean*/ {
    if (!Array.isArray(inputValue) || !inputValue.length) {
      return validator(params, inputValue);
    }
    for (let i = 0, n = inputValue.length; i < n; i++) {
      if (validator(params, get(inputValue, i))) return true;
    }
    return false;
  };
}

/**
 */

function and(validator) {
  return function(params, inputValue) /*: boolean*/ {
    if (!Array.isArray(inputValue) || !inputValue.length) {
      return validator(params, inputValue);
    }
    for (let i = 0, n = inputValue.length; i < n; i++) {
      if (!validator(params, get(inputValue, i))) return false;
    }
    return true;
  };
}

const typemap = new Map([
  // Types that may be used verbatim.
  ...[
    'number',
    'string',
    'object',
    'array',
    'binData',
    'objectId',
    'date',
    'null',
    'regex',
    'int',
    'long',
  ].map((v) => [v, v]),

  ['double', 'number'],
  ['bool', 'boolean'],
  ['javascript', 'function'],

  [1, 'number'],
  [2, 'string'],
  [3, 'object'],
  [4, 'array'],
  [5, 'binData'],
  [7, 'objectId'],
  [8, 'boolean'],
  [9, 'date'],
  [10, 'null'],
  [11, 'regex'],
  [13, 'function'],
  [16, 'int'],
  [18, 'long'],
]);

const expressions = Object.assign(Object.create(null), {
  /**
   */

  $eq: or((validator, inputValue) => validator(inputValue)),

  /**
   */

  $ne: and((validator, inputValue) => !validator(inputValue)),

  /**
   */

  $gt: or((expected, inputValue) => compare(comparable(inputValue), expected) > 0),

  /**
   */

  $gte: or((expected, inputValue) => compare(comparable(inputValue), expected) >= 0),

  /**
   */

  $lt: or((expected, inputValue) => compare(comparable(inputValue), expected) < 0),

  /**
   */

  $lte: or((expected, inputValue) => compare(comparable(inputValue), expected) <= 0),

  /**
   */

  $mod: or(([divisor, expectedRemainder], inputValue) => inputValue % divisor == expectedRemainder),

  /**
   * @param {Array} expected The expected values to look for.
   * @param {*} inputValue The value to look at/in for the expected values.
   */

  $in(expected, inputValue) {
    if (Array.isArray(inputValue)) {
      const aSet = new Set(expected);
      for (let i = inputValue.length; i--; ) {
        if (aSet.has(comparable(get(inputValue, i)))) {
          return true;
        }
      }

      return false;
    }

    const comparableB = comparable(inputValue);
    if (comparableB === inputValue && typeof inputValue === 'object') {
      for (let i = expected.length; i--; ) {
        if (
          String(expected[i]) === String(inputValue) &&
          String(inputValue) !== '[object Object]'
        ) {
          return true;
        }
      }
    }

    /*
      Handles documents that are undefined, whilst also
      having a 'null' element in the parameters to $in.
    */
    if (typeof comparableB === 'undefined') {
      for (let i = expected.length; i--; ) {
        if (expected[i] == null) {
          return true;
        }
      }
    }

    /*
      Handles the case of {'field': {$in: [/regexp1/, /regexp2/, ...]}}
    */
    return maybeAsyncThen(
      maybeAsyncSome(expected, (query, i) => {
        const validator = createRootValidator(query, undefined);
        return maybeAsyncThen(
          validator(inputValue, i, expected),
          (result) =>
            !!result &&
            String(result) !== '[object Object]' &&
            String(inputValue) !== '[object Object]'
        );
      }),
      (result) => result || expected.indexOf(comparableB) >= 0
    );
  },

  /**
   */

  $nin(expected, value, key, object) {
    return maybeAsyncThen(expressions.$in(expected, value, key, object), (contained) => !contained);
  },

  /**
   */

  $not(validator, value, key, object) {
    return maybeAsyncThen(validator(value, key, object), (result) => !result);
  },

  /**
   */

  $type(expectedType, value) {
    if (typeof expectedType === 'string') {
      switch (expectedType) {
        case 'null':
          return value === null;
        case 'object':
          return !!value && typeof value === 'object' && isVanillaObject(value);
        case 'regex':
          return isRegExp(value);
        case 'array':
          return Array.isArray(value);
        case 'number':
        case 'boolean':
        case 'string':
          return typeof value === expectedType;
        case 'int':
          return (value | 0) === value;
        case 'long':
          return Number.isSafeInteger(value);
        case 'date':
          return value instanceof Date || toString.call(value) === '[object Date]';
        case 'objectId':
          return (
            !!value &&
            typeof value === 'object' &&
            !!value.constructor &&
            value.constructor.name === 'ObjectID' &&
            typeof value.toHexString === 'function' &&
            'generationTime' in value
          );
        case 'binData':
          return Buffer.isBuffer(value);
        default:
          /* istanbul ignore next */
          throw new Error(`internal error: unknown type alias: ${expectedType}`);
      }
    }
    return (
      value !== void 0 && (value instanceof expectedType || value.constructor === expectedType)
    );
  },

  /**
   */

  $all(validators, value, key, object) {
    return expressions.$and(validators, value, key, object);
  },

  /**
   */

  $size(expectedSize, value) {
    return !!value && expectedSize === value.length;
  },

  /**
   */

  $or(validators, value, key, object) {
    return maybeAsyncSome(validators, (validator) => validator(value, key, object));
  },

  /**
   */

  $nor(validators, value, key, object) {
    return maybeAsyncThen(expressions.$or(validators, value, key, object), (result) => !result);
  },

  /**
   */

  $and(validators, value, key, object) {
    return maybeAsyncEvery(validators, (validator) => validator(value, key, object));
  },

  /**
   */

  $regex: or((regex, value) => typeof value === 'string' && regex.test(value)),

  /**
   * @param {function(V): boolean | Promise<boolean>}
   * @param {V} value
   * @param {string} key
   */

  $where(condition, value, key, object) {
    return condition.call(value, value, key, object);
  },

  /**
   */

  $elemMatch(validator, value, key, object) {
    if (Array.isArray(value)) {
      return maybeAsyncSome(value, (term) => validator(term, key, object));
    }
    return validator(value, key, object);
  },

  /**
   */

  $exists(expectedPresence, value, key, object) {
    return has(object, key) === expectedPresence;
  },
});

/**
 */

const prepare = Object.assign(Object.create(null), {
  /**
   */

  $eq(expression) {
    if (expression instanceof RegExp) {
      return (inputValue) => typeof inputValue === 'string' && expression.test(inputValue);
    }
    if (isFunction(expression)) {
      return expression;
    }
    if (Array.isArray(expression) && !expression.length) {
      // Special case of expression == []
      return (inputValue) => Array.isArray(inputValue) && !inputValue.length;
    }
    if (expression === null) {
      return (inputValue) => inputValue == null;
    }

    return (inputValue) => compare(comparable(inputValue), comparable(expression)) === 0;
    };
  },

  /**
   */

  $ne(expression) {
    return prepare.$eq(expression);
  },

  /**
   */

  $and(expressionList, query, parseSub) {
    return expressionList.map(parseSub);
  },

  /**
   */

  $all(expressionList, query, parseSub) {
    return prepare.$and(expressionList, query, parseSub);
  },

  /**
   */

  $or(expressionList, query, parseSub) {
    return expressionList.map(parseSub);
  },

  /**
   */

  $nor(expressionList, query, parseSub) {
    return expressionList.map(parseSub);
  },

  /**
   */

  $not(expression, query, parseSub) {
    return parseSub(expression);
  },

  /**
   */

  $regex(regexParam, query) {
    return new RegExp(regexParam, query.$options);
  },

  /**
   */

  $where(operator) {
    return typeof operator === 'string' ? new Function('obj', 'return ' + operator) : operator;
  },

  /**
   */

  $elemMatch(matchExpression, query, parseSub) {
    return parseSub(matchExpression);
  },

  /**
   */

  $exists(flag) {
    return !!flag;
  },

  /**
   */

  $type(expectedType) {
    if (typeof expectedType !== 'string') return expectedType;
    const resolvedType = typemap.get(expectedType);
    if (!resolvedType) throw new Error(`unknown type alias: ${expectedType}`);
    return resolvedType;
  },
});

/**
 */

function createValidator(params, validator) {
  return function(b, k, o) {
    return validator(params, b, k, o);
  };
}

/**
 */

function nestedValidator({path, validator, query}, inputValue) {
  const values = [];
  findValues(inputValue, path, 0, inputValue, values);

  if (values.length === 1) {
    const [[value, key, object]] = values;
    return validator(value, key, object);
  }

  // If the query contains $ne, need to test all elements ANDed together
  const inclusive = query && typeof query.$ne !== 'undefined';
  let allValid = inclusive;
  for (let i = 0; i < values.length; i++) {
    const [value, key, object] = values[i];
    const isValid = validator(value, key, object);
    if (inclusive) {
      allValid &= isValid;
    } else {
      allValid |= isValid;
    }
  }
  return allValid;
}

/**
 */

function findValues(current, keypath, index, object, values) {
  if (index === keypath.length || current == void 0) {
    values.push([current, keypath[index - 1], object]);
    return;
  }

  const k = get(keypath, index);

  // ensure that if current is an array, that the current key
  // is NOT an array index. This sort of thing needs to work:
  // sift({'foo.0':42}, [{foo: [42]}]);
  if (Array.isArray(current) && isNaN(Number(k))) {
    for (let i = 0, n = current.length; i < n; i++) {
      findValues(get(current, i), keypath, index, current, values);
    }
  } else {
    findValues(get(current, k), keypath, index + 1, current, values);
  }
}

/**
 */

function createNestedValidator(keypath, validator, query) {
  const arg = {path: keypath, validator, query};
  return (val) => nestedValidator(arg, val);
}

/**
 * flatten the query
 */

function isVanillaObject(value) {
  return value && value.constructor === Object;
}

function parse(options) {
  return function parseSub(query) {
    query = comparable(query);

    if (!query || !isVanillaObject(query)) {
      // cross browser support
      query = {$eq: query};
    }

    if (isExactObject(query)) {
      return createValidator(query, isEqual);
    }

    const validators = [];

    for (const key in query) {
      if (key === '$options') {
        continue;
      }

      let a = query[key];

      const expression =
        expressions[key] ||
        (options &&
          options.expressions &&
          has(options.expressions, key) &&
          options.expressions[key]);

      if (expression) {
        if (prepare[key]) a = prepare[key](a, query, parseSub);
        validators.push(createValidator(comparable(a), expression));
      } else if (key[0] === '$') {
        throw new Error(`Unknown operation ${key}`);
      } else {
        const keyParts = key.split('.');
        validators.push(createNestedValidator(keyParts, parseSub(a, key), a));
      }
    }

    return validators.length === 1 ? validators[0] : createValidator(validators, expressions.$and);
  };
}

function isEqual(a, b) {
  if (Object.prototype.toString.call(a) !== Object.prototype.toString.call(b)) {
    return false;
  }

  if (isObject(a)) {
    const aKeys = Object.keys(a),
      bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }

    const aKeySet = new Set(aKeys);
    for (const key of bKeys) {
      if (!aKeySet.delete(key)) {
        return false;
      }
    }

    for (const key of aKeys) {
      if (!isEqual(a[key], b[key])) {
        return false;
      }
    }

    return true;
  } else if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0, n = a.length; i < n; i++) {
      if (!isEqual(a[i], b[i])) {
        return false;
      }
    }

    return true;
  } else {
    return a === b;
  }
}

function getAllKeys(value, keys) {
  if (!isObject(value)) {
    return keys;
  }
  for (const key in value) {
    keys.push(key);
    getAllKeys(value[key], keys);
  }
  return keys;
}

function isExactObject(value) {
  const allKeysHash = getAllKeys(value, []).join(',');
  return !/[$.]/.test(allKeysHash);
}

/**
 */

function createRootValidator(query, options) {
  const validator = parse(options)(query);
  if (options && options.select) {
    return function(b, k, o) {
      return validator(options.select(b), k, o);
    };
  }
  return validator;
}

/**
 */

export default function sift(query, options) {
  return createRootValidator(query, options);
}

/**
 */

export function compare(a, b) {
  if (a === b) return 0;
  if (typeof a === typeof b) {
    if (a > b) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
  }
}
