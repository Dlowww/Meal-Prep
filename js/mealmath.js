/*
 * Meal math: turns daily targets into breakfast / lunch / dinner targets.
 *
 * Rules:
 *  - Breakfast gets `breakfastPct` percent of every daily number (default 25).
 *  - The after-dinner meal works the same way with `afterDinnerPct` (default 25).
 *    Both are eaten fresh, not meal-prepped.
 *  - Whatever is left is split evenly between lunch and dinner (the batch-cooked meals).
 *
 * Numbers are kept exact here; rounding only happens when they are shown.
 * Works in the browser (window.MealMath) and in Node (for the tests).
 */
(function (root) {
  'use strict';

  var MACROS = ['calories', 'protein', 'carbs', 'fat'];
  var DEFAULT_BREAKFAST_PCT = 25;
  var DEFAULT_AFTER_DINNER_PCT = 25;
  var MIN_BREAKFAST_PCT = 0;
  var MAX_BREAKFAST_PCT = 50;

  function toNumber(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function clampPct(pct) {
    var n = Number(pct);
    if (!isFinite(n)) return DEFAULT_BREAKFAST_PCT;
    return Math.min(MAX_BREAKFAST_PCT, Math.max(MIN_BREAKFAST_PCT, n));
  }

  /**
   * Daily targets -> { breakfast, lunch, dinner, afterDinner },
   * each { calories, protein, carbs, fat }.
   * A missing afterDinnerPct counts as 0 (no after-dinner meal).
   */
  function splitTargets(daily, breakfastPct, afterDinnerPct) {
    var bShare = clampPct(breakfastPct) / 100;
    var aShare = (afterDinnerPct == null ? 0 : clampPct(afterDinnerPct)) / 100;
    var result = { breakfast: {}, lunch: {}, dinner: {}, afterDinner: {} };
    MACROS.forEach(function (key) {
      var total = toNumber(daily && daily[key]);
      var breakfast = total * bShare;
      var afterDinner = total * aShare;
      var eachMain = (total - breakfast - afterDinner) / 2;
      result.breakfast[key] = breakfast;
      result.lunch[key] = eachMain;
      result.dinner[key] = eachMain;
      result.afterDinner[key] = afterDinner;
    });
    return result;
  }

  /** Calories implied by macros: 4 per g protein, 4 per g carbs, 9 per g fat. */
  function caloriesFromMacros(m) {
    return toNumber(m.protein) * 4 + toNumber(m.carbs) * 4 + toNumber(m.fat) * 9;
  }

  /**
   * Compares typed calories with the calories the macros add up to.
   * Returns null when they agree within `tolerance` (default 10%), or when
   * something is missing; otherwise { fromMacros, difference }.
   */
  function macroCalorieMismatch(daily, tolerance) {
    var tol = tolerance == null ? 0.1 : tolerance;
    var cal = toNumber(daily.calories);
    var fromMacros = caloriesFromMacros(daily);
    if (!cal || !fromMacros) return null;
    var diff = fromMacros - cal;
    if (Math.abs(diff) / cal <= tol) return null;
    return { fromMacros: Math.round(fromMacros), difference: Math.round(diff) };
  }

  function roundMeal(meal) {
    return {
      calories: Math.round(meal.calories),
      protein: Math.round(meal.protein),
      carbs: Math.round(meal.carbs),
      fat: Math.round(meal.fat)
    };
  }

  /** "600 cal / 45P / 60C / 20F" */
  function formatMeal(meal) {
    var r = roundMeal(meal);
    return r.calories + ' cal / ' + r.protein + 'P / ' + r.carbs + 'C / ' + r.fat + 'F';
  }

  /** "Breakfast: 600 cal / 45P / 60C / 20F · Lunch: … · Dinner: … · After dinner: …" */
  function formatBreakdown(split) {
    var parts = [
      'Breakfast: ' + formatMeal(split.breakfast),
      'Lunch: ' + formatMeal(split.lunch),
      'Dinner: ' + formatMeal(split.dinner)
    ];
    if (split.afterDinner && split.afterDinner.calories > 0) {
      parts.push('After dinner: ' + formatMeal(split.afterDinner));
    }
    return parts.join(' · ');
  }

  var api = {
    MACROS: MACROS,
    DEFAULT_BREAKFAST_PCT: DEFAULT_BREAKFAST_PCT,
    DEFAULT_AFTER_DINNER_PCT: DEFAULT_AFTER_DINNER_PCT,
    MIN_BREAKFAST_PCT: MIN_BREAKFAST_PCT,
    MAX_BREAKFAST_PCT: MAX_BREAKFAST_PCT,
    clampPct: clampPct,
    splitTargets: splitTargets,
    caloriesFromMacros: caloriesFromMacros,
    macroCalorieMismatch: macroCalorieMismatch,
    roundMeal: roundMeal,
    formatMeal: formatMeal,
    formatBreakdown: formatBreakdown
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MealMath = api;
})(this);
