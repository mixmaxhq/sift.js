import sift from '..';

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
});
