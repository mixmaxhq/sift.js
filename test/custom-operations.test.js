import sift from '../src/index';
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

  describe('async', () => {
    const values = [{userId: 'abc'}, {userId: 'bcd'}, {userId: 'def'}];
    const docs = [{_id: 'abc', detail: {name: 'Unval'}}, {_id: 'bcd', detail: {name: 'Val'}}];

    async function findOne(collection, id) {
      await process.nextTick;
      if (collection !== 'users') return null;
      return docs.find(({_id}) => _id === id) || null;
    }

    const expressions = {
      async $query({collection, condition}, value) {
        const doc = await findOne(collection, value);
        return sift(condition, {expressions})(doc);
      },
    };

    const filter = (query, v = values) => asyncFilter(v, sift(query, {expressions}));

    it('supports custom async operations', async () => {
      await expect(
        filter({
          userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}},
        })
      ).resolves.toEqual([{userId: 'bcd'}]);
    });

    it('supports custom async operations inside other operations', async () => {
      await expect(
        filter({
          $and: [
            {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
            () => true,
          ],
        })
      ).resolves.toEqual([{userId: 'bcd'}]);

      await expect(
        filter({
          $or: [
            {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
            () => false,
          ],
        })
      ).resolves.toEqual([{userId: 'bcd'}]);

      await expect(
        filter({
          $all: [
            {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
            () => true,
            () => true,
          ],
        })
      ).resolves.toEqual([{userId: 'bcd'}]);

      await expect(
        filter({
          $nor: [
            {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
            {userId: 'def'},
          ],
        })
      ).resolves.toEqual([{userId: 'abc'}]);

      await expect(
        filter({
          $not: {userId: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}}},
        })
      ).resolves.toEqual([{userId: 'abc'}, {userId: 'def'}]);

      await expect(
        filter(
          {
            users: {
              $elemMatch: {
                userA: {$query: {collection: 'users', condition: {'detail.name': 'Val'}}},
                userB: {$query: {collection: 'users', condition: {'detail.name': 'Unval'}}},
              },
            },
          },
          [
            {
              users: [{userA: 'bcd', userB: 'abc'}, {userA: 'def', userB: 'abc'}],
            },
            {
              users: [{userA: 'def', userB: 'abc'}, {userA: 'bcd', userB: 'def'}],
            },
            {
              users: [{userA: 'abc', userB: 'bcd'}],
            },
          ]
        )
      ).resolves.toEqual([{users: [{userA: 'bcd', userB: 'abc'}, {userA: 'def', userB: 'abc'}]}]);

      await expect(filter({$where: async ({userId}) => userId === 'bcd'})).resolves.toEqual([
        {userId: 'bcd'},
      ]);
    });
  });
});
