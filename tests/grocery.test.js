const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/grocery.js');

const ing = (name, amount, unit, aisle = '', id = null) => ({ id, name, amount, unit, aisle });
const plan = (ingredients, addon = null) => ({ ingredients, addon });
const find = (list, name) => {
  for (const s of list.sections) for (const it of s.items) if (it.name === name) return it;
  return null;
};

test('2 lb chicken + 1 lb chicken = 3 lb chicken (lunch + dinner merged)', () => {
  const list = G.build({
    lunch: plan([ing('chicken breast', 2, 'lb', 'Meat', 5062)]),
    dinner: plan([ing('chicken breast', 1, 'lb', 'Meat', 5062)])
  });
  const it = find(list, 'chicken breast');
  assert.equal(it.total.text, '3 lb');
  assert.equal(it.lunch.text, '2 lb');
  assert.equal(it.dinner.text, '1 lb');
  assert.deepEqual(it.meals, ['lunch', 'dinner']);
  assert.equal(it.section, 'meat');
  assert.equal(list.itemCount, 1);
});

test('the same ingredient in different units is added up correctly', () => {
  // 12 oz + 1.5 lb = 36 oz = 2.25 lb
  let list = G.build({ lunch: plan([ing('ground beef', 12, 'oz', 'Meat', 10023572)]), dinner: plan([ing('ground beef', 1.5, 'lbs', 'Meat', 10023572)]) });
  assert.equal(find(list, 'ground beef').total.text, '2¼ lb');
  // 4 Tbsp + 1 cup of broth = 1¼ cups
  list = G.build({ lunch: plan([ing('chicken broth', 4, 'Tbsp', 'Canned and Jarred', 6194)]), dinner: plan([ing('chicken broth', 1, 'cup', 'Canned and Jarred', 6194)]) });
  assert.equal(find(list, 'chicken broth').total.text, '1¼ cups');
  // 6 tsp + 1 Tbsp of soy sauce = 3 Tbsp (pantry, not rounded up)
  list = G.build({ lunch: plan([ing('soy sauce', 6, 'tsp', 'Ethnic Foods', 16124)]), dinner: plan([ing('soy sauce', 1, 'Tbsp', 'Ethnic Foods', 16124)]) });
  assert.equal(find(list, 'soy sauce').total.text, '3 Tbsp');
});

test('names that differ only in wording are merged, even without ids', () => {
  const list = G.build({
    lunch: plan([ing('Boneless Skinless Chicken Breasts', 1, 'lb', 'Meat')]),
    dinner: plan([ing('chicken breast', 8, 'oz', 'Meat')])
  });
  assert.equal(list.itemCount, 1);
  assert.equal(list.sections[0].items[0].total.text, '1½ lb');
});

test('cooking measures become shopping weights with the cup amount alongside', () => {
  // 1 cup shredded cheddar (113 g) + 4 oz cheddar (113 g) = 8 oz, about 2 cups
  const list = G.build({ lunch: plan([ing('cheddar cheese', 1, 'cup', 'Cheese', 1009)]), dinner: plan([ing('cheddar cheese', 4, 'oz', 'Cheese', 1009)]) });
  const it = find(list, 'cheddar cheese');
  assert.equal(it.total.text, '8 oz');
  assert.equal(it.total.note, 'about 2 cups');
  assert.equal(it.section, 'dairy');
});

test('rice in cups becomes pounds to buy', () => {
  // 3 cups dry rice ≈ 555 g ≈ 1.22 lb -> rounds up to 1¼ lb
  const list = G.build({ lunch: plan([ing('white rice', 3, 'cups', 'Pasta and Rice', 20444)]), dinner: null });
  const it = find(list, 'white rice');
  assert.equal(it.total.text, '1¼ lb');
  assert.equal(it.total.note, 'about 3 cups');
  assert.deepEqual(it.meals, ['lunch']);
  assert.equal(it.dinner, null);
});

test('liquids and seasonings stay in kitchen measures', () => {
  const list = G.build({ lunch: plan([ing('rice vinegar', 2, 'Tbsp', 'Ethnic Foods'), ing('chicken broth', 2, 'cups', 'Canned and Jarred')]) });
  assert.equal(find(list, 'rice vinegar').total.text, '2 Tbsp');
  assert.equal(find(list, 'chicken broth').total.text, '2 cups');
});

test('totals round up so you never come home short; the split is exact', () => {
  const list = G.build({ lunch: plan([ing('chicken thighs', 1.1, 'lb', 'Meat', 5091)]), dinner: plan([ing('chicken thighs', 1, 'lb', 'Meat', 5091)]) });
  const it = find(list, 'chicken thighs');
  assert.equal(it.total.text, '2¼ lb');        // 2.1 lb rounded up
  assert.equal(it.lunch.text, '1⅛ lb');         // 1.1 lb shown exactly (nearest ⅛)
  assert.equal(G.formatWeight(110, true), '4 oz');   // 3.9 oz -> 4 oz
  assert.equal(G.formatWeight(60, true), '2½ oz');   // 2.1 oz -> 2½ oz
});

test('counted items add up and packs round up to whole ones', () => {
  const list = G.build({
    lunch: plan([ing('onion', 1.5, '', 'Produce', 11282), ing('black beans', 1.25, 'cans', 'Canned and Jarred', 16018), ing('garlic', 2.5, 'cloves', 'Produce', 11215)]),
    dinner: plan([ing('onion', 1, 'large', 'Produce', 11282), ing('black beans', 0.5, 'can', 'Canned and Jarred', 16018), ing('garlic', 2, 'clove', 'Produce', 11215)])
  });
  assert.equal(find(list, 'black beans').total.text, '2 cans');     // 1.75 -> 2 whole cans
  assert.equal(find(list, 'garlic').total.text, '5 cloves');        // 4½ -> 5
  assert.equal(find(list, 'onion').total.text, '2 + 1 large');       // 1½ onions -> buy 2; different kinds of count stay separate
  assert.equal(find(list, 'onion').lunch.text, '1½');                // the split stays exact
});

test('add-ons merge with the same ingredient from a recipe', () => {
  const list = G.build({
    lunch: plan([ing('chicken breast', 1, 'lb', 'Meat', 5062)]),
    dinner: plan([ing('spaghetti', 1, 'lb', 'Pasta and Rice', 11420420)], { key: 'chicken', name: 'boneless skinless chicken breast', grams: 453.592 })
  });
  const it = find(list, 'chicken breast');
  assert.equal(it.total.text, '2 lb');
  assert.equal(it.dinner.text, '1 lb');
  assert.equal(it.addon, true);
  assert.equal(list.itemCount, 2);
});

test('an add-on on its own gets a sensible store section', () => {
  const list = G.build({ lunch: plan([], { key: 'beans', name: 'canned black beans', grams: 500 }) });
  assert.equal(list.sections[0].key, 'canned');
});

test('pantry staples go in their own section; water is left off', () => {
  const list = G.build({ lunch: plan([
    ing('salt', 1, 'tsp', 'Spices and Seasonings'), ing('olive oil', 2, 'Tbsp', 'Oil, Vinegar, Salad Dressing'),
    ing('smoked paprika', 2, 'tsp', 'Spices and Seasonings'), ing('water', 2, 'cups', ''), ing('broccoli', 2, 'cups', 'Produce')
  ]) });
  const keys = list.sections.map(s => s.key);
  assert.deepEqual(keys, ['produce', 'pantry']);                  // pantry always last
  assert.equal(find(list, 'water'), null);
  assert.equal(find(list, 'olive oil').section, 'pantry');
  assert.equal(find(list, 'olive oil').total.text, '2 Tbsp');      // pantry stays in spoons, not weight
  assert.equal(find(list, 'broccoli').total.text, '7 oz');         // 2 cups ≈ 182 g ≈ 6.4 oz -> 7 oz
});

test('"to taste" items still appear', () => {
  const list = G.build({ lunch: plan([ing('black pepper', 0, '', 'Spices and Seasonings')]) });
  assert.equal(find(list, 'black pepper').total.text, 'as needed');
});

test('sections follow the walk through the store', () => {
  const list = G.build({ lunch: plan([
    ing('cheddar cheese', 4, 'oz', 'Cheese'), ing('chicken breast', 1, 'lb', 'Meat'), ing('spinach', 2, 'cups', 'Produce'), ing('salt', 1, 'tsp', 'Spices and Seasonings')
  ]) });
  assert.deepEqual(list.sections.map(s => s.key), ['produce', 'meat', 'dairy', 'pantry']);
});

test('names are normalised sensibly', () => {
  assert.equal(G.normName('Boneless Skinless Chicken Breasts'), 'chicken breast');
  assert.equal(G.normName('white rice (dry)'), 'white rice');
  assert.equal(G.normName('Roma Tomatoes'), 'roma tomato');
  assert.equal(G.normName('cherries'), 'cherry');
  assert.equal(G.normName('extra-firm tofu'), 'tofu');
  assert.equal(G.normName('hummus'), 'hummus');
  assert.equal(G.normName('couscous'), 'couscous');
  assert.equal(G.normName('asparagus'), 'asparagus');
});

test('jars, cans and sauces stay in ounces; tiny overshoots are not rounded up', () => {
  const list = G.build({ lunch: plan([ing('tomato sauce', 26, 'oz', 'Pasta and Rice', 11549), ing('spaghetti', 11.04, 'oz', 'Pasta and Rice', 11420420)]) });
  assert.equal(find(list, 'tomato sauce').total.text, '26 oz');
  assert.equal(find(list, 'spaghetti').total.text, '11 oz');
  const big = G.build({ lunch: plan([ing('crushed tomatoes', 84, 'oz', 'Canned and Jarred')]) });
  assert.equal(find(big, 'crushed tomatoes').total.text, '5¼ lb');   // over 4 lb switches to pounds
});
