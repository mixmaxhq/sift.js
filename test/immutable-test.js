import * as assert from 'assert';
import * as Immutable from 'immutable';

import sift from '..';
const ObjectID = require('bson').ObjectID;

describe('immutable filtering', function() {
  const topic = Immutable.List([1, 2, 3, 4, 5, 6, 6, 4, 3]);

  const persons = Immutable.fromJS([{person: {age: 3}}, {person: {age: 5}}, {person: {age: 8}}]);

  it('works with Immutable.Map in a Immutable.List', function() {
    assert.equal(persons.filter(sift({'person.age': {$gt: 4}})).size, 2);
  });
});
