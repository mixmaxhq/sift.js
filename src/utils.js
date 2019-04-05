const {toString} = Object.prototype;

export const isObject = (value) => toString.call(value) === '[object Object]';
export const isFunction = (value) => typeof value === 'function';
export const isRegExp = (value) =>
  value instanceof RegExp || toString.call(value) === '[object RegExp]';

function isPromise(value) {
  return !!value && typeof value === 'object' && typeof value.then === 'function';
}

export function maybeAsyncThen(value, fn) {
  if (isPromise(value)) {
    return value.then(fn);
  }
  return fn(value);
}

export function get(obj, key) {
  return isFunction(obj.get) ? obj.get(key) : obj[key];
}

export function maybeAsyncEvery(a, fn) {
  const promises = [];
  for (let i = 0, n = a.length; i < n; ++i) {
    const item = get(a, i),
      result = fn(item, i, a);
    if (isPromise(result)) {
      promises.push(result);
    } else if (!result) {
      if (promises.length) {
        for (const promise of promises) {
          promise.catch(() => {});
        }
      }
      return false;
    }
  }
  if (!promises.length) return true;
  return new Promise((resolve, reject) => {
    Promise.all(
      promises.map((promise) =>
        promise.then((v) => {
          if (!v) resolve(false);
          return v;
        })
      )
    ).then(() => resolve(true), reject);
  });
}

const negate = (value) => maybeAsyncThen(value, (result) => !result);

export function maybeAsyncSome(a, fn) {
  return negate(maybeAsyncEvery(a, (...args) => negate(fn(...args))));
}

const hasOwnProperty = Object.prototype.hasOwnProperty;
export function has(obj, key) {
  return hasOwnProperty.call(obj, key);
}
