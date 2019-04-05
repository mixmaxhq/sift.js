import sift from '..';
import {asyncFilter} from './support/utils';

describe('custom operations', () => {
  it('can add a custom $mod operation', () => {
    const filter = sift(
      {$mod2: 2},
      {
        expressions: {
          $mod2(a, b) {
            return Boolean(a % b);
          },
        },
      }
    );

    const values = [1, 2, 3, 4, 5];

    expect(values.filter(filter)).toEqual([3, 4, 5]);
  });

  it('supports custom async operations', async () => {
    const values = [{userId: 'abc'}, {userId: 'bcd'}, {userId: 'def'}];
    const docs = [{_id: 'abc', detail: {name: 'Unval'}}, {_id: 'bcd', detail: {name: 'Val'}}];

    async function findOne(collection, id) {
      await process.nextTick;
      if (collection !== 'users') return null;
      return docs.find(({_id}) => _id === id) || null;
    }

    const predicate = sift(
      {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
      {
        expressions: {
          async $query(params, value) {
            const doc = await findOne(params.collection, value);
            return sift(params.condition)(doc);
          },
        },
      }
    );

    await expect(asyncFilter(values, predicate)).resolves.toEqual([{userId: 'bcd'}]);
  });
});
