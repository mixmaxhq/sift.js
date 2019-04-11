import sift from '../src/index';

describe('object matching', () => {
  const topic = [
    {
      name: 'craig',
      age: 90001,
      tags: ['coder', 'programmer', 'traveler', 'photographer'],
      address: {
        city: 'Minneapolis',
        state: 'MN',
        phone: '9999999999',
      },
      tags: ['photos', 'cook'],
      hobbies: [
        {
          name: 'programming',
          description: 'some desc',
        },
        {
          name: 'cooking',
        },
        {
          name: 'photography',
          places: ['haiti', 'brazil', 'costa rica'],
        },
        {
          name: 'backpacking',
        },
      ],
    },
    {
      name: 'tim',
      age: 90001,
      tags: ['traveler', 'photographer'],
      address: {
        city: 'St. Paul',
        state: 'MN',
        phone: '765765756765',
      },
      tags: ['dj'],
      hobbies: [
        {
          name: 'biking',
          description: 'some desc',
        },
        {
          name: 'DJ',
        },
        {
          name: 'photography',
          places: ['costa rica'],
        },
      ],
    },
  ];

  it('has sifted through photography in brazil count of 1', () => {
    const sifted = topic.filter(
      sift({
        hobbies: {
          name: 'photography',
          places: {
            $in: ['brazil'],
          },
        },
      })
    );
    expect(sifted).toHaveLength(1);
  });
  it('has sifted through photography in brazil, haiti, and costa rica count of 1', () => {
    const sifted = topic.filter(
      sift({
        hobbies: {
          name: 'photography',
          places: {
            $all: ['brazil', 'haiti', 'costa rica'],
          },
        },
      })
    );
    expect(sifted).toHaveLength(1);
    expect(sifted[0]).toBe(topic[0]);
  });
  it('has a sifted hobbies of photography, cooking, or biking count of 2', () => {
    const sifted = topic.filter(
      sift({
        hobbies: {
          name: {
            $in: ['photography', 'cooking', 'biking'],
          },
        },
      })
    );
    expect(sifted).toHaveLength(2);
  });
  it('has sifted to complex count of 2', () => {
    const sifted = topic.filter(
      sift({
        hobbies: {
          name: 'photography',
          places: {
            $in: ['costa rica'],
          },
        },
        address: {
          state: 'MN',
          phone: {
            $exists: true,
          },
        },
      })
    );

    expect(sifted).toHaveLength(2);
  });
  it('has sifted to complex count of 0', () => {
    const sifted = topic.filter(
      sift({
        hobbies: {
          name: 'photos',
          places: {
            $in: ['costa rica'],
          },
        },
      })
    );
    expect(sifted).toHaveLength(0);
  });
  it('has sifted subobject hobbies count of 3', () => {
    const sifted = topic.filter(
      sift({
        'hobbies.name': 'photography',
      })
    );
    expect(sifted).toHaveLength(2);
  });
  it('has sifted dot-notation hobbies of photography, cooking, and biking count of 3', () => {
    const sifted = topic.filter(
      sift({
        'hobbies.name': {
          $in: ['photography', 'cooking', 'biking'],
        },
      })
    );
    expect(sifted).toHaveLength(2);
  });
  it('has sifted to complex dot-search count of 2', () => {
    const sifted = topic.filter(
      sift({
        'hobbies.name': 'photography',
        'hobbies.places': {
          $in: ['costa rica'],
        },
        'address.state': 'MN',
        'address.phone': {
          $exists: true,
        },
      })
    );
    expect(sifted).toHaveLength(2);
  });
  it('has sifted with selector function count of 2', () => {
    const sifted = topic.filter(
      sift(
        {
          name: 'photography',
          places: {
            $in: ['costa rica'],
          },
        },
        {
          select(item) {
            return item.hobbies;
          },
        }
      )
    );
    expect(sifted).toHaveLength(2);
  });

  describe('nesting', () => {
    it('$eq for nested object', () => {
      const sifted = loremArr.filter(sift({'sub.num': {$eq: 10}}));
      expect(sifted.length).toBeGreaterThan(0);
      for (const v of sifted) {
        expect(v).toHaveProperty('sub.num', 10);
      }
    });

    it('$ne for nested object', () => {
      const sifted = loremArr.filter(sift({'sub.num': {$ne: 10}}));
      expect(sifted.length).toBeGreaterThan(0);
      for (const v of sifted) {
        expect(v).not.toHaveProperty('sub.num', 10);
      }
    });

    it('$regex for nested object (one missing key)', () => {
      const persons = [
        {
          id: 1,
          prof: 'Mr. Moriarty',
        },
        {
          id: 2,
          prof: 'Mycroft Holmes',
        },
        {
          id: 3,
          name: 'Dr. Watson',
          prof: 'Doctor',
        },
        {
          id: 4,
          name: 'Mr. Holmes',
          prof: 'Detective',
        },
      ];
      const q = {name: {$regex: 'n'}};
      const sifted = persons.filter(sift(q));
      expect(sifted).toEqual([
        {
          id: 3,
          name: 'Dr. Watson',
          prof: 'Doctor',
        },
      ]);
    });
  });

  describe('arrays of objects', () => {
    const objects = [
      {
        things: [
          {
            id: 123,
          },
          {
            id: 456,
          },
        ],
      },
      {
        things: [
          {
            id: 123,
          },
          {
            id: 789,
          },
        ],
      },
    ];
    it('$eq for array of objects, matches if at least one exists', () => {
      const q = {
        'things.id': 123,
      };
      const sifted = objects.filter(sift(q));
      expect(sifted).toEqual(objects);
      const q2 = {
        'things.id': 789,
      };
      const sifted2 = objects.filter(sift(q2));
      expect(sifted2).toEqual([objects[1]]);
    });
    it('$ne for array of objects, returns if none of the array elements match the query', () => {
      const q = {
        'things.id': {
          $ne: 123,
        },
      };
      const sifted = objects.filter(sift(q));
      expect(sifted).toEqual([]);
      const q2 = {
        'things.id': {
          $ne: 789,
        },
      };
      const sifted2 = objects.filter(sift(q2));
      expect(sifted2).toHaveLength(1);
      expect(sifted2[0]).toBe(objects[0]);
    });
  });

  describe('$elemMatch', function() {
    const couples = [
      {
        name: 'SMITH',
        person: [
          {
            firstName: 'craig',
            gender: 'female',
            age: 29,
          },
          {
            firstName: 'tim',
            gender: 'male',
            age: 32,
          },
        ],
      },
      {
        name: 'JOHNSON',
        person: [
          {
            firstName: 'emily',
            gender: 'female',
            age: 35,
          },
          {
            firstName: 'jacob',
            gender: 'male',
            age: 32,
          },
        ],
      },
    ];

    it('can filter people', () => {
      let results = couples.filter(
        sift({person: {$elemMatch: {gender: 'female', age: {$lt: 30}}}})
      );
      expect(results[0]).toHaveProperty('name', 'SMITH');

      results = [couples[0]].filter(sift({person: {$elemMatch: {gender: 'male', age: {$lt: 30}}}}));
      expect(results).toHaveLength(0);
    });
  });

  describe('keypath', () => {
    const arr = [
      {
        a: {
          b: {
            c: 1,
            c2: 1,
          },
        },
      },
    ];
    it('can be used', () => {
      expect(sift({'a.b.c': 1})(arr[0])).toBe(true);
    });
  });
});

const loremArr = [
  {
    num: 1,
    pum: 1,
    sub: {
      num: 1,
      pum: 1,
    },
  },
  {
    num: 2,
    pum: 2,
    sub: {
      num: 2,
      pum: 2,
    },
  },
  {
    num: 3,
    pum: 3,
    sub: {
      num: 3,
      pum: 3,
    },
  },
  {
    num: 4,
    pum: 4,
    sub: {
      num: 4,
      pum: 4,
    },
  },
  {
    num: 5,
    pum: 5,
    sub: {
      num: 5,
      pum: 5,
    },
  },
  {
    num: 6,
    pum: 6,
    sub: {
      num: 6,
      pum: 6,
    },
  },
  {
    num: 7,
    pum: 7,
    sub: {
      num: 7,
      pum: 7,
    },
  },
  {
    num: 8,
    pum: 8,
    sub: {
      num: 8,
      pum: 8,
    },
  },
  {
    num: 9,
    pum: 9,
    sub: {
      num: 9,
      pum: 9,
    },
  },
  {
    num: 10,
    pum: 10,
    sub: {
      num: 10,
      pum: 10,
    },
  },
  {
    num: 11,
    pum: 11,
    sub: {
      num: 10,
      pum: 10,
    },
  },
];
