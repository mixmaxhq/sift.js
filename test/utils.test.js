import {maybeAsyncThen, maybeAsyncEvery} from '../src/utils';
import {identity} from './support/utils';

describe('async utils', () => {
  describe('maybeAsyncThen', () => {
    it('should support resolving promises', async () => {
      await expect(maybeAsyncThen(Promise.resolve(4), (v) => v * 2)).resolves.toBe(8);
    });

    it('should support plain values', () => {
      expect(maybeAsyncThen(4, (v) => v * 2)).toBe(8);
    });
  });

  describe('maybeAsyncEvery', () => {
    it('should check all truthy synchronous values', () => {
      expect(maybeAsyncEvery([], identity)).toBe(true);
      expect(maybeAsyncEvery([2, 3, true, {}], identity)).toBe(true);
      expect(maybeAsyncEvery([0, 2, 3, true], identity)).toBe(false);
    });

    it('should check async values', async () => {
      await expect(maybeAsyncEvery([false], async (v) => v)).resolves.toBe(false);
      await expect(maybeAsyncEvery([true], async (v) => v)).resolves.toBe(true);

      await expect(maybeAsyncEvery([Promise.resolve(false)], identity)).resolves.toBe(false);
      await expect(maybeAsyncEvery([Promise.resolve(true)], identity)).resolves.toBe(true);

      await expect(maybeAsyncEvery([0], async (v) => v)).resolves.toBe(false);
      await expect(maybeAsyncEvery([0], async (v) => v + 1)).resolves.toBe(true);

      await expect(maybeAsyncEvery([Promise.resolve(0)], identity)).resolves.toBe(false);
      await expect(maybeAsyncEvery([Promise.resolve(0)], async (v) => (await v) + 1)).resolves.toBe(
        true
      );

      await expect(
        Promise.resolve(
          maybeAsyncEvery([1, 2, 3, false], (v) => (v === false ? v : Promise.resolve(v)))
        )
      ).resolves.toBe(false);
    });

    it('should prevent unhandled rejections', async () => {
      await expect(
        Promise.resolve(maybeAsyncEvery([Promise.reject(new Error('oops')), false], identity))
      ).resolves.toBe(false);
    });
  });
});
