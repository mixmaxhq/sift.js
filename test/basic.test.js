import sift from '../src/index';

describe('basic support', () => {
  it("doesn't sort arrays", () => {
    const values = [9, 8, 7, 6, 5, 4, 3, 2, 1].filter(
      sift({
        $or: [3, 2, 1],
      })
    );

    expect(values.length).toBe(3);
    expect(values[0]).toBe(3);
    expect(values[1]).toBe(2);
    expect(values[2]).toBe(1);
  });

  it('can create a custom selector, and use it', () => {
    const sifter = sift(
      {age: {$gt: 5}},
      {
        select(item) {
          return item.person;
        },
      }
    );

    const people = [{person: {age: 6}}],
      filtered = people.filter(sifter);

    expect(filtered.length).toBe(1);
    expect(filtered[0]).toBe(people[0]);
  });

  it('throws an error if the operation is invalid', () => {
    let err;
    try {
      sift({$aaa: 1})('b');
    } catch (e) {
      err = e;
    }

    expect(err.message).toBe('Unknown operation $aaa');
  });

  it('can match empty arrays', () => {
    const statusQuery = {
      $or: [
        {status: {$exists: false}},
        {status: []},
        {status: {$in: ['urgent', 'completed', 'today']}},
      ],
    };

    const filtered = [{status: []}, {status: ['urgent']}, {status: ['nope']}].filter(
      sift(statusQuery)
    );

    expect(filtered).toHaveLength(2);
  });

  it('$ne: null does not hit when field is present', () => {
    const sifter = sift({age: {$ne: null}});

    const people = [{age: 'matched'}, {missed: 1}];
    const filtered = people.filter(sifter);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toHaveProperty('age', 'matched');
  });

  it('$ne does not hit when field is different', () => {
    const sifter = sift({age: {$ne: 5}});

    const people = [{age: 5}],
      filtered = people.filter(sifter);

    expect(filtered).toHaveLength(0);
  });

  it('$ne does hit when field exists with different value', () => {
    const sifter = sift({age: {$ne: 4}});

    const people = [{age: 5}],
      filtered = people.filter(sifter);

    expect(filtered).toHaveLength(1);
  });

  it('$ne does hit when field does not exist', () => {
    const sifter = sift({age: {$ne: 5}});

    const people = [{}],
      filtered = people.filter(sifter);

    expect(filtered).toHaveLength(1);
  });

  it('$eq matches objects that serialize to the same value', () => {
    let counter = 0;
    class Book {
      constructor(name) {
        this.name = name;
        this.copyNumber = counter++;
      }

      toJSON() {
        return this.name; // discard the copy when serializing.
      }
    }

    const warAndPeace = new Book('War and Peace');

    const sifter = sift({$eq: warAndPeace});

    const books = [new Book('War and Peace')];
    const filtered = books.filter(sifter);

    expect(filtered).toHaveLength(1);
  });

  it('$neq does not match objects that serialize to the same value', () => {
    let counter = 0;
    class Book {
      constructor(name) {
        this.name = name;
        this.copyNumber = counter++;
      }

      toJSON() {
        return this.name; // discard the copy when serializing.
      }
    }

    const warAndPeace = new Book('War and Peace');

    const sifter = sift({$ne: warAndPeace});

    const books = [new Book('War and Peace')];
    const filtered = books.filter(sifter);

    expect(filtered).toHaveLength(0);
  });

  // https://gist.github.com/jdnichollsc/00ea8cf1204b17d9fb9a991fbd1dfee6
  it('returns a period between start and end dates', () => {
    const product = {
      productTypeCode: 'productTypeEnergy',
      quantities: [
        {
          period: {
            startDate: new Date('2017-01-13T05:00:00.000Z'),
            endDate: new Date('2017-01-31T05:00:00.000Z'),
            dayType: {
              normal: true,
              holiday: true,
            },
            specificDays: ['monday', 'wednesday', 'friday'],
            loadType: {
              high: true,
              medium: false,
              low: false,
            },
          },
          type: 'DemandPercentage',
          quantityValue: '44',
        },
        {
          period: {
            startDate: new Date('2017-01-13T05:00:00.000Z'),
            endDate: new Date('2017-01-31T05:00:00.000Z'),
            dayType: {
              normal: true,
              holiday: true,
            },
            loadType: {
              high: false,
              medium: true,
              low: false,
            },
          },
          type: 'Value',
          quantityValue: '22',
        },
      ],
    };

    const period = {
      startDate: new Date('2017-01-08T05:00:00.000Z'),
      endDate: new Date('2017-01-29T05:00:00.000Z'),
      dayType: {
        normal: true,
        holiday: true,
      },
      loadType: {
        high: true,
        medium: false,
        low: true,
      },
      specificPeriods: ['3', '4', '5-10'],
    };

    const results = product.quantities.filter(
      sift({
        $and: [
          {'period.startDate': {$lte: period.endDate}},
          {'period.endDate': {$gte: period.startDate}},
        ],
      })
    );

    expect(results).toHaveLength(2);
  });
});
