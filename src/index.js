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
  return function(a, b) /*: Promise<boolean>*/ {
    if (!Array.isArray(b) || !b.length) {
      return validator(a, b);
    }
    return maybeAsyncSome(b, (item) => validator(a, item));
  };
}

/**
 */

function and(validator) {
  return function(a, b) /*: Promise<boolean>*/ {
    if (!Array.isArray(b) || !b.length) {
      return validator(a, b);
    }
    return maybeAsyncEvery(b, (item) => validator(a, item));
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

  $eq: or(function(a, b) {
    return a(b);
  }),

  /**
   */

  $ne: and(function(a, b) {
    return !a(b);
  }),

  /**
   */

  $gt: or(function(a, b) {
    return compare(comparable(b), a) > 0;
  }),

  /**
   */

  $gte: or(function(a, b) {
    return compare(comparable(b), a) >= 0;
  }),

  /**
   */

  $lt: or(function(a, b) {
    return compare(comparable(b), a) < 0;
  }),

  /**
   */

  $lte: or(function(a, b) {
    return compare(comparable(b), a) <= 0;
  }),

  /**
   */

  $mod: or(function(a, b) {
    return b % a[0] == a[1];
  }),

  /**
   */

  $in(a, b) {
    if (Array.isArray(b)) {
      const aSet = new Set(a);
      for (let i = b.length; i--; ) {
        if (aSet.has(comparable(get(b, i)))) {
          return true;
        }
      }

      return false;
    }

    const comparableB = comparable(b);
    if (comparableB === b && typeof b === 'object') {
      for (let i = a.length; i--; ) {
        if (String(a[i]) === String(b) && String(b) !== '[object Object]') {
          return true;
        }
      }
    }

    /*
      Handles documents that are undefined, whilst also
      having a 'null' element in the parameters to $in.
    */
    if (typeof comparableB === 'undefined') {
      for (let i = a.length; i--; ) {
        if (a[i] == null) {
          return true;
        }
      }
    }

    /*
      Handles the case of {'field': {$in: [/regexp1/, /regexp2/, ...]}}
    */
    return maybeAsyncThen(
      maybeAsyncSome(a, (query, i) => {
        const validator = createRootValidator(query, undefined);
        return maybeAsyncThen(validator(b, i, a), (result) => {
          return (
            !!result && String(result) !== '[object Object]' && String(b) !== '[object Object]'
          );
        });
      }),
      (result) => result || a.indexOf(comparableB) >= 0
    );
  },

  /**
   */

  $nin(a, b, k, o) {
    return maybeAsyncThen(expressions.$in(a, b, k, o), (contained) => !contained);
  },

  /**
   */

  $not(validator, b, k, o) {
    return maybeAsyncThen(validator(b, k, o), (result) => !result);
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

  $all(a, b, k, o) {
    return expressions.$and(a, b, k, o);
  },

  /**
   */

  $size(a, b) {
    return !!b && a === b.length;
  },

  /**
   */

  $or(a, b, k, o) {
    return maybeAsyncSome(a, (validator) => validator(b, k, o));
  },

  /**
   */

  $nor(a, b, k, o) {
    return maybeAsyncThen(expressions.$or(a, b, k, o), (result) => !result);
  },

  /**
   */

  $and(validators, b, k, o) {
    return maybeAsyncEvery(validators, (validator) => validator(b, k, o));
  },

  /**
   */

  $regex: or(function(a, b) {
    return typeof b === 'string' && a.test(b);
  }),

  /**
   */

  $where(a, b, k, o) {
    return a.call(b, b, k, o);
  },

  /**
   */

  $elemMatch(validator, b, k, o) {
    if (Array.isArray(b)) {
      return maybeAsyncSome(b, (term) => validator(term));
    }
    return validator(b, k, o);
  },

  /**
   */

  $exists(a, b, k, o) {
    return has(o, k) === a;
  },
});

/**
 */

const prepare = Object.assign(Object.create(null), {
  /**
   */

  $eq(a) {
    if (a instanceof RegExp) {
      return function(inputValue) {
        return typeof inputValue === 'string' && a.test(inputValue);
      };
    } else if (isFunction(a)) {
      return a;
    } else if (Array.isArray(a) && !a.length) {
      // Special case of a == []
      return function(b) {
        return Array.isArray(b) && !b.length;
      };
    } else if (a === null) {
      return function(b) {
        //will match both null and undefined
        return b == null;
      };
    }

    return function(b) {
      return compare(comparable(b), comparable(a)) === 0;
    };
  },

  /**
   */

  $ne(a) {
    return prepare.$eq(a);
  },

  /**
   */

  $and(a, query, parseSub) {
    return a.map(parseSub);
  },

  /**
   */

  $all(a, query, parseSub) {
    return prepare.$and(a, query, parseSub);
  },

  /**
   */

  $or(a, query, parseSub) {
    return a.map(parseSub);
  },

  /**
   */

  $nor(a, query, parseSub) {
    return a.map(parseSub);
  },

  /**
   */

  $not(a, query, parseSub) {
    return parseSub(a);
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

  $elemMatch(a, query, parseSub) {
    return parseSub(a);
  },

  /**
   */

  $exists(a) {
    return !!a;
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

function nestedValidator(a, b) {
  const values = [];
  findValues(b, a.path, 0, b, values);

  // just for consistency with previous implementation
  const validator = values.length ? a.validator : null;
  if (values.length === 1) {
    const first = values[0];
    return validator(first[0], first[1], first[2]);
  }

  // If the query contains $ne, need to test all elements ANDed together
  const inclusive = a && a.query && typeof a.query.$ne !== 'undefined';
  let allValid = inclusive;
  for (let i = 0; i < values.length; i++) {
    const result = values[i];
    const isValid = validator(result[0], result[1], result[2]);
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
  return function(val) {
    return nestedValidator(arg, val);
  };
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
