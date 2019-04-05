import * as Immutable from 'immutable';

import sift from '..';
const ObjectID = require('bson').ObjectID;

describe('immutable filtering', () => {
  const topic = Immutable.List([1, 2, 3, 4, 5, 6, 6, 4, 3]);

  const persons = Immutable.fromJS([{person: {age: 3}}, {person: {age: 5}}, {person: {age: 8}}]);

  it('works with Immutable.Map in a Immutable.List', () => {
    expect(persons.filter(sift({'person.age': {$gt: 4}}))).toHaveProperty('size', 2);
  });
});
