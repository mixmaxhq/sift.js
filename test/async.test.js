import sift from '../src/index';
import {asyncFilter} from './support/utils';

describe('async support', () => {
  [
    [
      'can use a simple async $eq filter',
      {
        async $eq(value) {
          return value > 2;
        },
      },
      [1, 2, 3, 4, 5],
      [3, 4, 5],
    ],

    [
      'can use a simple async $and filter',
      {
        $and: [async (value) => value > 2, async (value) => value < 5],
      },
      [1, 2, 3, 4, 5],
      [3, 4],
    ],
  ].forEach(([description, query, values, result]) => {
    it(description, async () => {
      const filteredValues = await asyncFilter(values, sift(query));
      expect(filteredValues).toEqual(result);
    });
  });
});
