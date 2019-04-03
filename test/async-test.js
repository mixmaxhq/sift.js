import * as assert from 'assert';
import sift from '..';

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
      'can use a simple async $or filter',
      {
        $and: [async (value) => value > 2, async (value) => value < 5],
      },
      [1, 2, 3, 4, 5],
      [3, 4],
    ],
  ].forEach(function([description, query, values, result]) {
    it(description, async function() {
      const filteredValues = await asyncFilter(values, sift(query));
      assert.equal(JSON.stringify(filteredValues), JSON.stringify(result));
    });
  });
});

async function asyncFilter(values, predicate) {
  const filtered = await Promise.all(values.map(predicate));
  return values.filter((value, index) => filtered[index]);
}
