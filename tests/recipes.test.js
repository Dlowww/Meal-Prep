const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/recipes.js');

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

// Shaped like a real Spoonacular complexSearch result.
function apiRecipe(id, cal, p, c, f, extra = {}) {
  return Object.assign({
    id, title: 'Recipe ' + id, image: 'x.jpg', sourceUrl: 'https://example.com/' + id, servings: 4,
    pricePerServing: 250,
    nutrition: { nutrients: [
      { name: 'Calories', amount: cal, unit: 'kcal' },
      { name: 'Fat', amount: f, unit: 'g' },
      { name: 'Saturated Fat', amount: 3, unit: 'g' },
      { name: 'Carbohydrates', amount: c, unit: 'g' },
      { name: 'Protein', amount: p, unit: 'g' }
    ] }
  }, extra);
}
const target = { calories: 600, protein: 45, carbs: 60, fat: 20 };

test('reads per-serving nutrition from Spoonacular data', () => {
  assert.deepEqual(R.nutritionPerServing(apiRecipe(1, 480, 40, 45, 15)), { calories: 480, protein: 40, carbs: 45, fat: 15 });
});

test('portion is scaled so calories hit the target exactly', () => {
  const e = R.evaluate(R.compactSearchResult(apiRecipe(1, 480, 40, 45, 15)), target);
  near(e.factor, 1.25);
  near(e.scaled.calories, 600);
  near(e.scaled.protein, 50);
  near(e.scaled.carbs, 56.25);
  near(e.scaled.fat, 18.75);
  assert.equal(e.checks.calories.status, 'good');
});

test('the check line reads like "Protein: 52g of 55g target ✓"', () => {
  const check = R.macroCheck('protein', 52, 55);
  assert.equal(R.formatCheck('Protein', check, 'g'), 'Protein: 52g of 55g target ✓');
  assert.equal(R.formatCheck('Carbs', R.macroCheck('carbs', 40, 60), 'g'), 'Carbs: 40g of 60g target ↓');
  assert.equal(R.formatCheck('Fat', R.macroCheck('fat', 23, 20), 'g'), 'Fat: 23g of 20g target ≈');
});

test('a perfect macro match scores 100%', () => {
  const e = R.evaluate(R.compactSearchResult(apiRecipe(1, 300, 22.5, 30, 10)), target);
  assert.equal(e.matchPct, 100);
  near(e.score, 0);
});

test('ranking is weighted toward protein', () => {
  // Same size miss (25%) but on different macros: missing protein should rank worse.
  const lowProtein = R.compactSearchResult(apiRecipe(1, 600, 33.75, 60 + 11.25 * 4 / 4, 20));   // protein -25%
  const lowFat = R.compactSearchResult(apiRecipe(2, 600, 45, 60, 15));                           // fat -25%
  const ranked = R.rank([lowProtein, lowFat], target, { tune: false });
  assert.equal(ranked[0].recipe.id, 2);
});

test('extra protein is penalised less than missing protein', () => {
  const over = R.evaluate(R.compactSearchResult(apiRecipe(1, 600, 54, 60, 20)), target, { tune: false });   // +20% protein
  const under = R.evaluate(R.compactSearchResult(apiRecipe(2, 600, 36, 60, 20)), target, { tune: false });  // -20% protein
  assert.ok(over.score < under.score);
  assert.equal(over.checks.protein.status, 'good');
  assert.equal(under.checks.protein.status, 'close');
});

test('with a budget, the cheaper of two equal recipes ranks first', () => {
  const pricey = R.compactSearchResult(apiRecipe(1, 600, 45, 60, 20, { pricePerServing: 900 }));
  const cheap = R.compactSearchResult(apiRecipe(2, 600, 45, 60, 20, { pricePerServing: 300 }));
  const ranked = R.rank([pricey, cheap], target, { budget: 50, totalPortions: 10 });   // $5 per portion
  assert.equal(ranked[0].recipe.id, 2);
  assert.equal(ranked[1].overBudget, true);    // $9 > $5
  near(ranked[0].costPerPortion, 3);
  // Without a budget, cost does not matter.
  assert.equal(R.rank([pricey, cheap], target)[0].score, R.rank([pricey, cheap], target)[1].score);
});

test('cost per portion follows the portion size', () => {
  const e = R.evaluate(R.compactSearchResult(apiRecipe(1, 400, 30, 40, 13, { pricePerServing: 200 })), target);
  near(e.factor, 1.5);
  near(e.costPerPortion, 3);   // $2.00 per recipe serving × 1.5
});

test('lunch and dinner get alternating options with no repeats', () => {
  const ranked = [1, 2, 3, 4, 5, 6, 7].map(id => ({ recipe: { id } }));
  assert.deepEqual(R.optionsFor('lunch', ranked, 3).map(e => e.recipe.id), [1, 3, 5]);
  assert.deepEqual(R.optionsFor('dinner', ranked, 3).map(e => e.recipe.id), [2, 4, 6]);
  // Dinner's chosen recipe is never in lunch's list, so lunch is unchanged.
  assert.deepEqual(R.optionsFor('lunch', ranked, 3, 2).map(e => e.recipe.id), [1, 3, 5]);
  // Lunch's chosen recipe (1) is skipped for dinner, and dinner's list doesn't reshuffle.
  assert.deepEqual(R.optionsFor('dinner', ranked, 3, 1).map(e => e.recipe.id), [2, 4, 6]);
});

test('recipes without calorie data are dropped', () => {
  const bad = R.compactSearchResult({ id: 9, title: 'x', nutrition: { nutrients: [] } });
  assert.equal(R.rank([bad], target).length, 0);
});

test('batch multiplier: portion size × portions ÷ recipe servings', () => {
  // Recipe serves 4; my portion is 1.25 servings; I cook 5 portions -> 6.25 servings -> 1.5625× the recipe.
  near(R.batchMultiplier({ servings: 4 }, 1.25, 5), 1.5625);
});

test('amounts are shown as kitchen-friendly fractions', () => {
  assert.equal(R.formatAmount(2.27, 'cups'), '2¼');
  assert.equal(R.formatAmount(0.33, 'tsp'), '⅓');
  assert.equal(R.formatAmount(0.5, 'cup'), '½');
  assert.equal(R.formatAmount(1.97, 'lb'), '2');
  assert.equal(R.formatAmount(14.6, 'oz'), '15');
  assert.equal(R.formatAmount(0.02, 'tsp'), '⅛');
  assert.equal(R.formatAmount(453.6, 'g'), '454');
  assert.equal(R.formatAmount(3, ''), '3');
});

test('search parameters reflect diet, allergies, exclusions and calorie window', () => {
  const settings = { diet: { type: 'vegetarian', intolerances: ['Dairy', 'Tree Nut'], exclude: ' mushrooms, olives ,' } };
  const p = R.searchParams(settings, target, 40);
  assert.equal(p.diet, 'vegetarian');
  assert.equal(p.intolerances, 'dairy,tree nut');
  assert.equal(p.excludeIngredients, 'mushrooms,olives');
  assert.equal(p.minCalories, '360');
  assert.equal(p.maxCalories, '900');
  assert.equal(p.offset, '40');
  assert.equal(p.type, 'main course');

  const hp = R.searchParams({ diet: { type: 'high-protein', intolerances: [], exclude: '' } }, target, 0);
  assert.equal(hp.diet, undefined);        // not a Spoonacular diet
  assert.equal(hp.sort, 'protein');
  assert.equal(hp.intolerances, undefined);
});

test('search key changes when settings that affect results change', () => {
  const s = { diet: { type: '', intolerances: [], exclude: '' }, budget: null, servings: { lunch: 5, dinner: 5 } };
  const k1 = R.searchKey(s, target);
  assert.equal(R.searchKey(JSON.parse(JSON.stringify(s)), target), k1);
  assert.notEqual(R.searchKey(Object.assign({}, s, { budget: 60 }), target), k1);
  assert.notEqual(R.searchKey(s, Object.assign({}, target, { protein: 50 })), k1);
});

test('full recipe details keep ingredients (US measures) and steps', () => {
  const info = {
    id: 5, title: 'Chicken Bowl', servings: 4, sourceUrl: 'https://x', image: 'i.jpg', pricePerServing: 300,
    extendedIngredients: [
      { id: 1, name: 'chicken breast', nameClean: 'chicken breast', aisle: 'Meat', amount: 454, unit: 'g', original: '1 lb chicken breast',
        measures: { us: { amount: 1, unitShort: 'lb' }, metric: { amount: 454, unitShort: 'g' } } }
    ],
    analyzedInstructions: [{ name: '', steps: [{ number: 1, step: 'Cook  the chicken.' }, { number: 2, step: 'Serve.' }] }]
  };
  const d = R.compactRecipeDetail(info, R.compactSearchResult(apiRecipe(5, 480, 40, 45, 15)));
  assert.deepEqual(d.ingredients[0], { id: 1, name: 'chicken breast', aisle: 'Meat', amount: 1, unit: 'lb', original: '1 lb chicken breast' });
  assert.deepEqual(d.steps, ['Cook the chicken.', 'Serve.']);
  assert.deepEqual(d.perServing, { calories: 480, protein: 40, carbs: 45, fat: 15 });
});

test('units read naturally: 1½ cups, 1 can, 2 cloves, lb unchanged', () => {
  assert.equal(R.unitLabel('cup', 1.5), 'cups');
  assert.equal(R.unitLabel('cups', 1), 'cup');
  assert.equal(R.unitLabel('cans', 0.75), 'can');
  assert.equal(R.unitLabel('clove', 2), 'cloves');
  assert.equal(R.unitLabel('bunch', 2), 'bunches');
  assert.equal(R.unitLabel('large', 3), 'large');
  assert.equal(R.unitLabel('lb', 3), 'lb');
  assert.equal(R.unitLabel('Tbsp', 2), 'Tbsp');
  assert.equal(R.unitLabel('', 2), '');
});
