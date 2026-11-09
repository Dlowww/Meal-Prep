const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/prices.js');
const G = require('../js/grocery.js');
const R = require('../js/recipes.js');

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const qty = (mass = 0, volume = 0, counts = {}) => ({ mass, volume, counts });
const LB = 453.592, OZ = 28.3495;

test('names find the right price, specific before general', () => {
  const name = n => { const e = P.lookup(n); return e ? (e.lb ? e.lb + '/lb' : e.price + '/' + P.packLabel(e)) : null; };
  assert.equal(name('boneless skinless chicken breasts'), '4.2/lb');
  assert.equal(name('chicken broth'), '2.79/32 fl oz');
  assert.equal(name('peanut butter'), '3.29/16 oz');
  assert.equal(name('butter'), '4.99/16 oz');
  assert.equal(name('cream cheese'), '2.99/8 oz');
  assert.equal(name('shredded cheddar cheese'), '3.49/8 oz');
  assert.equal(name('rice vinegar'), '2.49/16 fl oz');
  assert.equal(name('white rice'), '2.49/2 lb');
  assert.equal(name('coconut milk'), '2.49/14 fl oz');
  assert.equal(name('garlic'), '0.69/2 oz');
  assert.equal(name('garlic powder'), '3.49/2 oz');
  assert.equal(name('green beans'), '2.49/lb');
  assert.equal(name('black beans'), '1.19/13 oz');
  assert.equal(name('eggs'), '2.27/dozen');
  assert.equal(name('eggplant'), '1.99/lb');
  assert.equal(name('corn tortillas'), '3.29/13 oz');
  assert.equal(name('sweet potato'), '1.29/lb');
  assert.equal(name('red pepper flakes'), '3.49/2 oz');
  assert.equal(name('red bell pepper'), '1.29/5 oz');
  assert.equal(name('dragonfruit'), null);
});

test('meat is priced by the pound', () => {
  const c = P.checkoutCost(qty(3 * LB), 'chicken breast', 'meat');
  near(c.cost, 12.60);
  assert.equal(c.known, true);
});

test('packaged items cost whole packages at checkout', () => {
  // 5 oz of shredded cheese -> one 8 oz bag
  let c = P.checkoutCost(qty(5 * OZ), 'cheddar cheese', 'dairy');
  near(c.cost, 3.49); assert.equal(c.packs, 1); assert.equal(c.packLabel, '8 oz');
  // 10 oz -> two bags
  c = P.checkoutCost(qty(10 * OZ), 'cheddar cheese', 'dairy');
  near(c.cost, 6.98); assert.equal(c.packs, 2);
  // a sliver over one pack doesn't buy a second (16.5 oz of pasta = 1 box)
  c = P.checkoutCost(qty(16.5 * OZ), 'spaghetti', 'grains');
  assert.equal(c.packs, 1);
});

test('cups, counts and cans are turned into what you buy', () => {
  // 3 cups dry rice ≈ 555 g -> one 2 lb bag
  near(P.checkoutCost(qty(0, 3 * 236.588), 'white rice', 'grains').cost, 2.49);
  // 6 garlic cloves = 30 g -> one head
  near(P.checkoutCost(qty(0, 0, { clove: 6 }), 'garlic', 'produce').cost, 0.69);
  // 14 cloves -> two heads
  near(P.checkoutCost(qty(0, 0, { clove: 14 }), 'garlic', 'produce').cost, 1.38);
  // 2 cans of black beans
  near(P.checkoutCost(qty(0, 0, { can: 2 }), 'black beans', 'canned').cost, 2.38);
  // 3 onions ≈ 450 g ≈ 1 lb at $1.49
  near(P.checkoutCost(qty(0, 0, { '': 3 }), 'onion', 'produce').cost, 1.48);
  // 4 eggs -> a dozen
  near(P.checkoutCost(qty(0, 0, { large: 4 }), 'eggs', 'dairy').cost, 2.27);
  // 4 cups of broth (946 ml) -> one 32 oz carton
  near(P.checkoutCost(qty(0, 4 * 236.588), 'chicken broth', 'canned').cost, 2.79);
});

test('unknown items get a rough price by store section and are flagged', () => {
  const c = P.checkoutCost(qty(200), 'dragonfruit', 'produce');
  assert.equal(c.known, false);
  assert.ok(c.cost > 0);
});

test('cost of what you use: a tablespoon of oil is cents, a pound of chicken is dollars', () => {
  near(P.usedCost(1, 'Tbsp', 'olive oil'), 0.27, 0.01);
  near(P.usedCost(1, 'lb', 'chicken breast'), 4.20);
  near(P.usedCost(1, 'tsp', 'garlic powder'), 0.18, 0.05);
});

test('grocery list total is the checkout total; pantry staples are kept separate', () => {
  const ing = (name, amount, unit, aisle, id = null) => ({ id, name, amount, unit, aisle });
  const list = G.build({
    lunch: { ingredients: [ing('chicken breast', 1.5, 'lb', 'Meat', 5062), ing('cheddar cheese', 0.75, 'cup', 'Cheese', 1009),
      ing('white rice', 1.5, 'cups', 'Pasta and Rice', 20444), ing('spinach', 4, 'cups', 'Produce', 10011457),
      ing('olive oil', 2, 'Tbsp', 'Oil, Vinegar, Salad Dressing', 4053), ing('garlic powder', 1, 'tsp', 'Spices and Seasonings')] },
    dinner: { ingredients: [ing('spaghetti', 0.66, 'lb', 'Pasta and Rice'), ing('tomato sauce', 26, 'oz', 'Pasta and Rice'),
      ing('olive oil', 2.5, 'Tbsp', 'Oil, Vinegar, Salad Dressing', 4053)],
      addon: { key: 'chicken', name: 'boneless skinless chicken breast', grams: 1.67 * 453.592 } }
  });
  // chicken 3.17 lb × 4.20 = 13.31, cheese 1 bag 3.49, rice 1 bag 2.49, spinach 1 bag 3.49,
  // spaghetti 1 box 1.49, tomato sauce 26 oz -> 2 cans 2.38   => ≈ 26.65
  near(list.total, 13.31 + 3.49 + 2.49 + 3.49 + 1.49 + 2.38, 0.05);
  assert.ok(list.pantryTotal > 0);          // oil and spices listed, not added to the total
  assert.equal(list.guessedCount, 0);
});

test('cost per portion uses the built-in prices and follows tuning', () => {
  const recipe = {
    id: 9, servings: 4, pricePerServing: 100,
    perServing: { calories: 600, protein: 45, carbs: 60, fat: 20 },
    ingredients: [{ id: 1, name: 'chicken breast', amount: 1, unit: 'lb' }, { id: 2, name: 'white rice', amount: 1, unit: 'cup' }]
  };
  // per serving: ¼ lb chicken ($1.05) + ¼ cup rice (46 g ≈ $0.13)
  near(R.servingCost(recipe, null), 1.05 + 46.25 * 2.49 / 907, 0.01);
  // with 50% more chicken
  near(R.servingCost(recipe, { mults: { 'id:1': 1.5 } }), 1.575 + 46.25 * 2.49 / 907, 0.01);
});

test('unknown items never crash, in every store section', () => {
  for (const section of G.SECTIONS.map(s => s.key).concat(['nonsense'])) {
    for (const q of [qty(300), qty(0, 500), qty(0, 0, { '': 2 }), qty(0, 0, { can: 1 }), qty(0, 0, { pinch: 1 }), qty()]) {
      const c = P.checkoutCost(q, 'mystery ingredient xyz', section);
      assert.ok(Number.isFinite(c.cost), section);
    }
  }
  // And the whole list builds with odd data: missing names, units and aisles.
  const list = G.build({ lunch: { ingredients: [
    { name: 'mystery sauce', amount: 2, unit: 'jars', aisle: 'Condiments' },
    { name: 'zzz', amount: 1, unit: 'serving', aisle: 'Gourmet' },
    { name: '', amount: 3, unit: '', aisle: '' },
    { name: 'thing', amount: null, unit: undefined, aisle: undefined },
    { name: 'frozen mystery', amount: 12, unit: 'oz', aisle: 'Frozen' }
  ] } });
  assert.ok(Number.isFinite(list.total) && list.total > 0);
  assert.ok(list.guessedCount >= 3);
});
