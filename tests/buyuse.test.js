const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/grocery.js');
const R = require('../js/recipes.js');

const ing = (name, amount, unit, aisle = '', id = null) => ({ id, name, amount, unit, aisle });
const find = (list, name) => { for (const s of list.sections) for (const it of s.items) if (it.name === name) return it; return null; };
// Exactly how the recipe page writes an ingredient amount.
const recipePage = (amount, unit) => { const a = R.formatAmount(amount, unit); return unit ? a + ' ' + R.unitLabel(unit, amount) : a; };

test('"You\'ll use" matches the recipe page exactly', () => {
  const lines = [ing('white rice', 1.5, 'cups', 'Pasta and Rice', 20444), ing('olive oil', 1.75, 'Tbsp', 'Oil, Vinegar, Salad Dressing', 4053),
    ing('chicken breast', 1.55, 'lb', 'Meat', 5062), ing('onion', 2, '', 'Produce', 11282), ing('garlic', 3, 'cloves', 'Produce', 11215)];
  const list = G.build({ lunch: { ingredients: lines } });
  for (const l of lines) assert.equal(find(list, l.name).use, recipePage(l.amount, l.unit), l.name);
  assert.equal(find(list, 'white rice').useLunch, '1½ cups');
});

test('lunch + dinner in the same unit add up in that unit; the split matches each recipe page', () => {
  const list = G.build({
    lunch: { ingredients: [ing('white rice', 1, 'cup', 'Pasta and Rice', 20444)] },
    dinner: { ingredients: [ing('white rice', 1.5, 'cups', 'Pasta and Rice', 20444)] }
  });
  const it = find(list, 'white rice');
  assert.equal(it.use, '2½ cups');
  assert.equal(it.useLunch, '1 cup');
  assert.equal(it.useDinner, '1½ cups');
});

test('different units are converted to the handiest one', () => {
  const list = G.build({
    lunch: { ingredients: [ing('chicken broth', 4, 'Tbsp', 'Canned and Jarred', 6194)] },
    dinner: { ingredients: [ing('chicken broth', 1, 'cup', 'Canned and Jarred', 6194)] }
  });
  assert.equal(find(list, 'chicken broth').use, '1¼ cups');
});

test('add-ons are added to the matching recipe ingredient', () => {
  const list = G.build({
    lunch: { ingredients: [ing('chicken breast', 1.5, 'lb', 'Meat', 5062)] },
    dinner: { ingredients: [], addon: { key: 'chicken', name: 'boneless skinless chicken breast', grams: 1.75 * 453.592, amount: 1.75, unit: 'lb' } }
  });
  const it = find(list, 'chicken breast');
  assert.equal(it.use, '3¼ lb');
  assert.equal(it.useLunch, '1½ lb');
  assert.equal(it.useDinner, '1¾ lb');
});

test('"Buy" says what to put in the cart', () => {
  const list = G.build({ lunch: { ingredients: [
    ing('white rice', 1.5, 'cups', 'Pasta and Rice'),               // -> 1 bag (2 lb)
    ing('tomato sauce', 26, 'oz', 'Pasta and Rice'),                 // -> 2 cans (15 oz each)
    ing('chicken breast', 3.1, 'lb', 'Meat'),                        // -> by weight, rounded up
    ing('red bell pepper', 3, '', 'Produce'),                        // -> 3 (each)
    ing('onion', 2, '', 'Produce'),                                  // -> 2 (sold by weight, counted)
    ing('garlic', 6, 'cloves', 'Produce'),                           // -> 1 head
    ing('eggs', 4, 'large', 'Milk, Eggs, Other Dairy'),              // -> 1 dozen
    ing('chicken broth', 2, 'cups', 'Canned and Jarred'),            // -> 1 carton (32 fl oz)
    ing('spaghetti', 12, 'oz', 'Pasta and Rice'),                    // -> 1 box (16 oz)
    ing('olive oil', 2, 'Tbsp', 'Oil, Vinegar, Salad Dressing')      // pantry: no buy line
  ] } });
  assert.equal(find(list, 'white rice').buy, 'Buy 1 bag (2 lb)');
  assert.equal(find(list, 'tomato sauce').buy, 'Buy 2 cans (15 oz each)');
  assert.equal(find(list, 'chicken breast').buy, 'Buy 3¼ lb');
  assert.equal(find(list, 'red bell pepper').buy, 'Buy 3');
  assert.equal(find(list, 'onion').buy, 'Buy 2');
  assert.equal(find(list, 'garlic').buy, 'Buy 1 head');
  assert.equal(find(list, 'eggs').buy, 'Buy 1 dozen');
  assert.equal(find(list, 'chicken broth').buy, 'Buy 1 carton (32 fl oz)');
  assert.equal(find(list, 'spaghetti').buy, 'Buy 1 box (16 oz)');
  assert.equal(find(list, 'olive oil').buy, '');
  assert.equal(find(list, 'olive oil').use, '2 Tbsp');
});

test('"to taste" items say as needed', () => {
  const list = G.build({ lunch: { ingredients: [ing('salt', 0, '', 'Spices and Seasonings')] } });
  assert.equal(find(list, 'salt').use, 'as needed');
});

test('items the recipe already counts in packages are bought in those packages', () => {
  const list = G.build({ lunch: { ingredients: [ing('gochujang glaze', 2.25, 'jars', 'Condiments'), ing('black beans', 1.5, 'cans', 'Canned and Jarred')] } });
  assert.equal(find(list, 'gochujang glaze').buy, 'Buy 3 jars');
  assert.equal(find(list, 'gochujang glaze').use, '2¼ jars');
  assert.equal(find(list, 'black beans').buy, 'Buy 2 cans');
});
