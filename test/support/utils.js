export async function asyncFilter(values, predicate) {
  const filtered = await Promise.all(values.map(predicate));
  return values.filter((value, index) => filtered[index]);
}
