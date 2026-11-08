// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const MM = require('../js/mealmath.js');
const Store = require('../js/storage.js');

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: expected ${b}, got ${a}`);

test('default 25% breakfast, rest split evenly (example from the brief)', () => {
  // 2400 cal / 180P / 240C / 80F
  const s = MM.splitTargets({ calories: 2400, protein: 180, carbs: 240, fat: 80 }, 25);
  assert.deepEqual(MM.roundMeal(s.breakfast), { calories: 600, protein: 45, carbs: 60, fat: 20 });
  assert.deepEqual(MM.roundMeal(s.lunch), { calories: 900, protein: 68, carbs: 90, fat: 30 });
  assert.deepEqual(MM.roundMeal(s.dinner), { calories: 900, protein: 68, carbs: 90, fat: 30 });
  assert.equal(
    MM.formatBreakdown(s),
    'Breakfast: 600 cal / 45P / 60C / 20F · Lunch: 900 cal / 68P / 90C / 30F · Dinner: 900 cal / 68P / 90C / 30F'
  );
});

test('the three meals always add back up to the daily total', () => {
  const daily = { calories: 2735, protein: 203, carbs: 251, fat: 97 };
  for (let pct = 0; pct <= 50; pct++) {
    const s = MM.splitTargets(daily, pct);
    for (const k of MM.MACROS) {
      close(s.breakfast[k] + s.lunch[k] + s.dinner[k], daily[k], `${k} at ${pct}%`);
      close(s.lunch[k], s.dinner[k], `lunch = dinner for ${k} at ${pct}%`);
      close(s.breakfast[k], daily[k] * pct / 100, `breakfast ${k} at ${pct}%`);
    }
  }
});

test('0% breakfast gives everything to lunch and dinner', () => {
  const s = MM.splitTargets({ calories: 2000, protein: 150, carbs: 200, fat: 60 }, 0);
  assert.deepEqual(MM.roundMeal(s.breakfast), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  assert.deepEqual(MM.roundMeal(s.lunch), { calories: 1000, protein: 75, carbs: 100, fat: 30 });
});

test('slider values outside 0-50% are pulled back into range', () => {
  assert.equal(MM.clampPct(80), 50);
  assert.equal(MM.clampPct(-5), 0);
  assert.equal(MM.clampPct('abc'), 25);
  const s = MM.splitTargets({ calories: 2000, protein: 0, carbs: 0, fat: 0 }, 90);
  close(s.breakfast.calories, 1000, 'capped at 50%');
});

test('blank or bad inputs count as zero instead of breaking', () => {
  const s = MM.splitTargets({ calories: '', protein: null, carbs: 'x', fat: -10 }, 25);
  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    for (const k of MM.MACROS) assert.equal(s[meal][k], 0);
  }
});

test('calories from macros use 4/4/9', () => {
  assert.equal(MM.caloriesFromMacros({ protein: 180, carbs: 240, fat: 80 }), 2400);
});

test('mismatch warning only when macros and calories disagree by more than 10%', () => {
  assert.equal(MM.macroCalorieMismatch({ calories: 2400, protein: 180, carbs: 240, fat: 80 }), null);
  assert.equal(MM.macroCalorieMismatch({ calories: 2200, protein: 180, carbs: 240, fat: 80 }), null); // 9% off
  assert.deepEqual(
    MM.macroCalorieMismatch({ calories: 1800, protein: 180, carbs: 240, fat: 80 }),
    { fromMacros: 2400, difference: 600 }
  );
  assert.equal(MM.macroCalorieMismatch({ calories: 0, protein: 180, carbs: 240, fat: 80 }), null);
});

test('saved data from an older version gets new defaults filled in', () => {
  const merged = Store.merge(Store.defaults(), { targets: { calories: 2000 }, servings: { lunch: 4 } });
  assert.equal(merged.targets.calories, 2000);
  assert.equal(merged.targets.protein, 180);   // default kept
  assert.equal(merged.servings.lunch, 4);
  assert.equal(merged.servings.dinner, 5);     // default kept
  assert.equal(merged.breakfastPct, 25);
});

test('after-dinner meal works like breakfast: 25% + 25% leaves 25% each for lunch and dinner', () => {
  const s = MM.splitTargets({ calories: 2400, protein: 180, carbs: 240, fat: 80 }, 25, 25);
  const quarter = { calories: 600, protein: 45, carbs: 60, fat: 20 };
  assert.deepEqual(MM.roundMeal(s.breakfast), quarter);
  assert.deepEqual(MM.roundMeal(s.lunch), quarter);
  assert.deepEqual(MM.roundMeal(s.dinner), quarter);
  assert.deepEqual(MM.roundMeal(s.afterDinner), quarter);
  assert.equal(
    MM.formatBreakdown(s),
    'Breakfast: 600 cal / 45P / 60C / 20F · Lunch: 600 cal / 45P / 60C / 20F · ' +
    'Dinner: 600 cal / 45P / 60C / 20F · After dinner: 600 cal / 45P / 60C / 20F'
  );
});

test('all four meals add back up to the daily total at every slider combination', () => {
  const daily = { calories: 2735, protein: 203, carbs: 251, fat: 97 };
  for (let b = 0; b <= 50; b += 5) {
    for (let a = 0; a <= 50; a += 5) {
      const s = MM.splitTargets(daily, b, a);
      for (const k of MM.MACROS) {
        close(s.breakfast[k] + s.lunch[k] + s.dinner[k] + s.afterDinner[k], daily[k], `${k} at ${b}/${a}`);
        close(s.afterDinner[k], daily[k] * a / 100, `after dinner ${k} at ${a}%`);
        close(s.lunch[k], s.dinner[k], `lunch = dinner for ${k}`);
      }
    }
  }
});

test('different shares: 20% breakfast + 15% after dinner', () => {
  const s = MM.splitTargets({ calories: 2000, protein: 160, carbs: 200, fat: 60 }, 20, 15);
  assert.deepEqual(MM.roundMeal(s.breakfast), { calories: 400, protein: 32, carbs: 40, fat: 12 });
  assert.deepEqual(MM.roundMeal(s.afterDinner), { calories: 300, protein: 24, carbs: 30, fat: 9 });
  assert.deepEqual(MM.roundMeal(s.lunch), { calories: 650, protein: 52, carbs: 65, fat: 20 }); // 19.5 -> 20
});

test('after dinner at 0% is left out of the summary line', () => {
  const s = MM.splitTargets({ calories: 2400, protein: 180, carbs: 240, fat: 80 }, 25, 0);
  assert.ok(!MM.formatBreakdown(s).includes('After dinner'));
  assert.equal(MM.roundMeal(s.lunch).calories, 900);
});

test('older saved data gets the new 25% after-dinner default', () => {
  const merged = Store.merge(Store.defaults(), { breakfastPct: 30 });
  assert.equal(merged.afterDinnerPct, 25);
  assert.equal(merged.breakfastPct, 30);
});
