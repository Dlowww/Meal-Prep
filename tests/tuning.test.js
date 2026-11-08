const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tuning.js');
const R = require('../js/recipes.js');

const target = { calories: 600, protein: 45, carbs: 60, fat: 20 };

// A recipe with per-serving ingredient nutrition, like Spoonacular returns with addRecipeNutrition.
// Rows: [id, name, calories, protein, carbs, fat] per recipe serving.
function recipe(rows, extra = {}) {
  const per = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  rows.forEach(r => { per.calories += r[2]; per.protein += r[3]; per.carbs += r[4]; per.fat += r[5]; });
  return Object.assign({ id: 1, title: 'Test', servings: 4, pricePerServing: 250, perServing: per, ingNut: rows }, extra);
}

// Too much fat, not enough protein: a chicken dish heavy on oil and cheese.
const fatty = recipe([
  [1, 'chicken breast', 150, 28, 0, 3.3],
  [2, 'olive oil', 180, 0, 0, 20],
  [3, 'cheddar cheese', 115, 7, 0.4, 9.5],
  [4, 'white rice', 200, 4, 44, 0.4],
  [5, 'garlic powder', 5, 0.2, 1, 0],
  [6, 'spinach', 10, 1, 1.5, 0.2],
]);

test('only main macro ingredients can be changed', () => {
  assert.equal(T.classify('chicken breast'), 'protein');
  assert.equal(T.classify('boneless skinless chicken thighs'), 'protein');
  assert.equal(T.classify('olive oil'), 'fat');
  assert.equal(T.classify('shredded cheddar cheese'), 'fat');
  assert.equal(T.classify('jasmine rice'), 'carb');
  assert.equal(T.classify('sweet potatoes'), 'carb');
  assert.equal(T.classify('eggs'), 'protein');
  assert.equal(T.classify('black beans'), 'protein');
  for (const n of ['garlic powder', 'chicken broth', 'soy sauce', 'green beans', 'eggplant', 'rice vinegar', 'spinach', 'onion', 'salt', 'cooking spray'])
    assert.equal(T.classify(n), null, n);
});

test('tuning brings a fatty recipe much closer to the targets', () => {
  const t = T.tune(fatty, target, {});
  assert.ok(t.tuned);
  assert.ok(t.error < t.baseError - 0.15, `error ${t.baseError.toFixed(3)} -> ${t.error.toFixed(3)}`);
  // Expected direction: more chicken, less oil and cheese.
  assert.ok(t.mults['id:1'] > 1, 'more chicken');
  assert.ok(t.mults['id:2'] < 1, 'less oil');
  // Spices and veg are never touched.
  assert.equal(t.mults['id:5'], undefined);
  assert.equal(t.mults['id:6'], undefined);
});

test('every change stays between ½× and 2×', () => {
  const t = T.tune(fatty, { calories: 600, protein: 80, carbs: 20, fat: 15 }, {});
  for (const m of Object.values(t.mults)) assert.ok(m >= 0.5 - 1e-9 && m <= 2 + 1e-9, m);
});

test('a recipe that already matches is left alone', () => {
  const good = recipe([[1, 'chicken breast', 150, 30, 0, 3], [2, 'rice', 330, 7.5, 60, 0.6], [3, 'olive oil', 120, 0, 0, 13.3]]);
  // Scale target to this recipe's exact balance.
  const per = good.perServing;
  const exact = { calories: 600, protein: per.protein * 600 / per.calories, carbs: per.carbs * 600 / per.calories, fat: per.fat * 600 / per.calories };
  const t = T.tune(good, exact, {});
  assert.equal(t.tuned, false);
  assert.deepEqual(t.mults, {});
  assert.equal(t.addon, null);
});

test('an add-on is suggested when the ingredients alone cannot get there', () => {
  // Pasta with tomato sauce: almost no protein to scale up.
  const pasta = recipe([[1, 'spaghetti', 400, 14, 80, 2], [2, 'tomato sauce', 80, 3, 15, 1], [3, 'olive oil', 120, 0, 0, 13.5]]);
  const t = T.tune(pasta, target, {});
  assert.ok(t.addon, 'expected an add-on');
  const a = T.addonByKey(t.addon.key);
  assert.equal(a.kind, 'protein');
  assert.ok(t.error < t.baseError - 0.2);
});

test('add-ons respect diet, allergies and excluded ingredients', () => {
  const keys = d => T.allowedAddons(d).map(a => a.key);
  assert.ok(!keys({ type: 'vegetarian' }).includes('chicken'));
  assert.ok(!keys({ type: 'vegetarian' }).includes('shrimp'));
  assert.ok(keys({ type: 'vegetarian' }).includes('tofu'));
  assert.ok(!keys({ type: 'vegan' }).includes('eggwhites'));
  assert.ok(!keys({ type: 'vegan' }).includes('yogurt'));
  assert.ok(!keys({ type: 'ketogenic' }).includes('rice'));
  assert.ok(!keys({ type: '', intolerances: ['Soy'] }).includes('tofu'));
  assert.ok(!keys({ type: '', intolerances: ['Shellfish'] }).includes('shrimp'));
  assert.ok(!keys({ type: '', intolerances: ['Egg'] }).includes('eggwhites'));
  assert.ok(!keys({ type: '', intolerances: ['Dairy'] }).includes('yogurt'));
  assert.ok(!keys({ type: '', exclude: 'chicken, avocado' }).includes('chicken'));
  assert.ok(!keys({ type: '', exclude: 'chicken, avocado' }).includes('avocado'));

  const pasta = recipe([[1, 'spaghetti', 400, 14, 80, 2], [2, 'tomato sauce', 80, 3, 15, 1]]);
  const vegan = T.tune(pasta, target, { type: 'vegan', intolerances: [] });
  if (vegan.addon) assert.ok(['tofu', 'beans', 'rice', 'potato', 'oil', 'avocado'].includes(vegan.addon.key), vegan.addon.key);
});

test('tuned nutrition adds up: fixed parts + scaled ingredients + add-on', () => {
  const t = T.tune(fatty, target, {});
  const parts = T.parts(fatty);
  const expect = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  parts.forEach(p => { const m = t.mults[p.key] || 1; for (const k in expect) expect[k] += p.v[k] * m; });
  if (t.addon) { const v = T.addonVector(T.addonByKey(t.addon.key), t.addon.grams); for (const k in expect) expect[k] += v[k]; }
  for (const k in expect) assert.ok(Math.abs(expect[k] - t.perServing[k]) < 1e-6, k);
});

test('ingredients listed twice are changed together', () => {
  const r = recipe([[2, 'olive oil', 120, 0, 0, 13.5], [1, 'chicken breast', 150, 28, 0, 3.3], [2, 'olive oil', 60, 0, 0, 6.8]]);
  assert.equal(T.parts(r).length, 2);
});

test('change labels read plainly', () => {
  assert.equal(T.changeLabel(1.3, 'chicken breast'), '+30% · more protein');
  assert.equal(T.changeLabel(0.5, 'olive oil'), '−50% · less fat');
  assert.equal(T.changeLabel(1.25, 'jasmine rice'), '+25% · more carbs');
  assert.equal(T.changeLabel(1.01, 'olive oil'), '');
});

test('batch plan: final amounts include the portion size, batch size and tuning', () => {
  const detail = Object.assign({}, fatty, {
    ingredients: [
      { id: 1, name: 'chicken breast', amount: 1, unit: 'lb', original: '1 lb chicken' },
      { id: 2, name: 'olive oil', amount: 4, unit: 'Tbsp', original: '4 tbsp olive oil' },
      { id: 5, name: 'garlic powder', amount: 1, unit: 'tsp', original: '1 tsp garlic powder' },
    ]
  });
  const plan = R.batchPlan(detail, target, 5, {});
  const e = plan.evaluation;
  const mult = e.factor * 5 / 4;
  const chicken = plan.ingredients[0], oil = plan.ingredients[1], garlic = plan.ingredients[2];
  assert.ok(Math.abs(chicken.amount - 1 * mult * e.tuning.mults['id:1']) < 1e-9);
  assert.ok(Math.abs(oil.amount - 4 * mult * e.tuning.mults['id:2']) < 1e-9);
  assert.ok(Math.abs(garlic.amount - 1 * mult) < 1e-9);     // untouched, just batch-scaled
  assert.match(chicken.change, /^\+\d+% · more protein$/);
  assert.match(oil.change, /^−\d+% · less fat$/);
  assert.equal(garlic.change, '');
  // Calories still hit the target exactly after tuning.
  assert.ok(Math.abs(e.scaled.calories - 600) < 1e-9);
  assert.ok(e.matchPct > e.baseMatchPct);
});

test('add-on amounts are shown in shopping units', () => {
  const chicken = T.addonByKey('chicken'), rice = T.addonByKey('rice'), beans = T.addonByKey('beans'), oil = T.addonByKey('oil'), avo = T.addonByKey('avocado');
  assert.equal(R.formatAddonAmount(chicken, 567), '1¼ lb');
  assert.equal(R.formatAddonAmount(chicken, 227), '8 oz');
  assert.equal(R.formatAddonAmount(rice, 370), '2 cups');
  assert.equal(R.formatAddonAmount(beans, 380), '1½ cans (15 oz, drained)');
  assert.equal(R.formatAddonAmount(oil, 27), '2 Tbsp');
  assert.equal(R.formatAddonAmount(avo, 300), '2 avocados');
});

test('ranking uses the tuned match, so a fixable recipe can beat a so-so one', () => {
  // As written, "so-so" is closer; but "fatty" can be tuned into a near-perfect match.
  const soso = recipe([[11, 'pork chops', 300, 30, 0, 19], [12, 'potatoes', 300, 6, 60, 0.6]], { id: 2 });
  const plain = R.rank([fatty, soso], target, { tune: false });
  const tuned = R.rank([fatty, soso], target, {});
  const tunedFatty = tuned.find(e => e.recipe.id === 1);
  assert.ok(tunedFatty.matchPct >= 90, String(tunedFatty.matchPct));
  assert.ok(tunedFatty.matchPct > plain.find(e => e.recipe.id === 1).matchPct);
});

test('reads per-ingredient nutrition from Spoonacular data', () => {
  const rows = R.ingredientNutrition({ ingredients: [
    { id: 5062, name: 'chicken breast', amount: 4, unit: 'oz', nutrients: [
      { name: 'Calories', amount: 136.08, unit: 'kcal' }, { name: 'Protein', amount: 25.36, unit: 'g' },
      { name: 'Carbohydrates', amount: 0, unit: 'g' }, { name: 'Fat', amount: 2.95, unit: 'g' }, { name: 'Sodium', amount: 50, unit: 'mg' } ] } ] });
  assert.deepEqual(rows, [[5062, 'chicken breast', 136.08, 25.36, 0, 2.95]]);
  assert.deepEqual(R.ingredientNutrition(undefined), []);
});
