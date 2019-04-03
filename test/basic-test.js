import * as assert from 'assert';
import sift, {indexOf as siftIndexOf} from '..';

describe('basic support', function() {
  it("doesn't sort arrays", function() {
    const values = [9, 8, 7, 6, 5, 4, 3, 2, 1].filter(
      sift({
        $or: [3, 2, 1],
      })
    );

    assert.equal(values.length, 3);
    assert.equal(values[0], 3);
    assert.equal(values[1], 2);
    assert.equal(values[2], 1);
  });

  it('can create a custom selector, and use it', function() {
    const sifter = sift(
      {age: {$gt: 5}},
      {
        select: function(item) {
          return item.person;
        },
      }
    );

    const people = [{person: {age: 6}}],
      filtered = people.filter(sifter);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0], people[0]);
  });

  it('throws an error if the operation is invalid', function() {
    let err;
    try {
      sift({$aaa: 1})('b');
    } catch (e) {
      err = e;
    }

    assert.equal(err.message, 'Unknown operation $aaa');
  });

  it('can match empty arrays', function() {
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

    assert.equal(filtered.length, 2);
  });

  it('$ne: null does not hit when field is present', function() {
    const sifter = sift({age: {$ne: null}});

    const people = [{age: 'matched'}, {missed: 1}];
    const filtered = people.filter(sifter);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].age, 'matched');
  });

  it('$ne does not hit when field is different', function() {
    const sifter = sift({age: {$ne: 5}});

    const people = [{age: 5}],
      filtered = people.filter(sifter);

    assert.equal(filtered.length, 0);
  });

  it('$ne does hit when field exists with different value', function() {
    const sifter = sift({age: {$ne: 4}});

    const people = [{age: 5}],
      filtered = people.filter(sifter);

    assert.equal(filtered.length, 1);
  });

  it('$ne does hit when field does not exist', function() {
    const sifter = sift({age: {$ne: 5}});

    const people = [{}],
      filtered = people.filter(sifter);

    assert.equal(filtered.length, 1);
  });

  it('$eq matches objects that serialize to the same value', function() {
    let counter = 0;
    function Book(name) {
      this.name = name;
      this.copyNumber = counter;
      this.toJSON = function() {
        return this.name; // discard the copy when serializing.
      };
      counter += 1;
    }

    const warAndPeace = new Book('War and Peace');

    const sifter = sift({$eq: warAndPeace});

    const books = [new Book('War and Peace')];
    const filtered = books.filter(sifter);

    assert.equal(filtered.length, 1);
  });

  it('$neq does not match objects that serialize to the same value', function() {
    let counter = 0;
    function Book(name) {
      this.name = name;
      this.copyNumber = counter;
      this.toJSON = function() {
        return this.name; // discard the copy when serializing.
      };
      counter += 1;
    }

    const warAndPeace = new Book('War and Peace');

    const sifter = sift({$ne: warAndPeace});

    const books = [new Book('War and Peace')];
    const filtered = books.filter(sifter);

    assert.equal(filtered.length, 0);
  });

  // https://gist.github.com/jdnichollsc/00ea8cf1204b17d9fb9a991fbd1dfee6
  it('returns a period between start and end dates', function() {
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

    assert.equal(results.length, 2);
  });
});
