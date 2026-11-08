/*
 * Macro tuning: nudges a recipe's main ingredients (and, if needed, suggests
 * one simple add-on) so a portion lands closer to your protein, carbs and fat.
 *
 * How it works, in plain terms:
 *  - Each ingredient's nutrition per recipe serving comes from Spoonacular.
 *  - Only main macro ingredients can change (meat, rice, oil, cheese...), each
 *    between ½× and 2×. Spices, sauces and vegetables stay as written.
 *  - The portion is always re-sized so calories hit your target, so the job
 *    here is getting the *balance* of protein, carbs and fat right.
 *  - It tries many combinations and keeps the one with the best match, with a
 *    small preference for changing as little as possible.
 *
 * Works in the browser (window.Tuning) and in Node (for the tests).
 */
(function (root) {
  'use strict';

  var KEYS = ['calories', 'protein', 'carbs', 'fat'];
  var WEIGHTS = { protein: 0.5, carbs: 0.25, fat: 0.25 };
  var MIN_MULT = 0.5, MAX_MULT = 2, MULT_STEP = 0.05;
  var CHANGE_COST = 0.02;     // small penalty per change, so tiny gains don't reshape a recipe
  var ADDON_COST = 0.03;      // adding something new must be worth it
  var ADDON_WHEN_BELOW = 0.10;  // only try add-ons if the tuned recipe is still >10% off
  var ADDON_MIN_GAIN = 0.04;    // ...and only keep one that improves the match by 4+ points

  // ---------- macro error (shared with recipes.js) ----------
  /** Weighted relative miss on protein/carbs/fat. 0 = perfect. Extra protein counts half. */
  function macroError(scaled, target) {
    var err = 0, weightSum = 0;
    ['protein', 'carbs', 'fat'].forEach(function (k) {
      var t = target[k];
      if (!(t > 0)) return;
      var rel = (scaled[k] - t) / t;
      var e = (k === 'protein' && rel > 0) ? rel * 0.5 : Math.abs(rel);
      err += WEIGHTS[k] * e;
      weightSum += WEIGHTS[k];
    });
    return weightSum > 0 ? err / weightSum : 0;
  }

  /** Error after re-sizing the portion so calories hit the target. */
  function errorAtTarget(perServing, target) {
    if (!(perServing.calories > 0) || !(target.calories > 0)) return Infinity;
    var f = target.calories / perServing.calories;
    return macroError({ protein: perServing.protein * f, carbs: perServing.carbs * f, fat: perServing.fat * f }, target);
  }

  // ---------- which ingredients may change ----------
  var NEVER = /\b(broth|stock|bouillon|powder|sauce|salsa|paste|vinegar|spray|seasoning|extract|dressing|green beans?|string beans?|eggplants?|cream of tartar|baking|yeast|gelatin|zest|juice|syrup|honey|sugar|ketchup|mustard|flakes)\b/i;
  var KIND_PATTERNS = [
    ['protein', /\b(chicken|turkey|beef|steak|sirloin|brisket|pork|tenderloin|lamb|veal|bison|venison|sausages?|chorizo|ham|prosciutto|salmon|tuna|cod|tilapia|halibut|trout|mahi|haddock|pollock|snapper|sardines?|anchov(y|ies)|shrimps?|prawns?|scallops?|crab|lobster|fish|tofu|tempeh|seitan|eggs?|egg whites?|lentils?|chickpeas?|garbanzo|beans?|edamame|ground meat|meatballs?|greek yogurt|cottage cheese|protein powder)\b/i],
    ['fat', /\b(oil|butter|ghee|lard|cheese|cheddar|mozzarella|parmesan|parmigiano|feta|ricotta|gouda|gruyere|cream|sour cream|creme fraiche|mascarpone|avocados?|almonds?|cashews?|peanuts?|peanut butter|walnuts?|pecans?|pistachios?|pine nuts|hazelnuts?|macadamia|nuts|tahini|coconut milk|mayonnaise|mayo|bacon|pancetta)\b/i],
    ['carb', /\b(rice|quinoa|pasta|spaghetti|linguine|fettuccine|noodles?|macaroni|penne|rigatoni|fusilli|orzo|couscous|potato(es)?|sweet potato(es)?|yams?|bread|baguette|tortillas?|pitas?|buns?|rolls?|naan|oats|oatmeal|barley|farro|bulgur|gnocchi|corn|polenta|grits|lasagna noodles|wraps?)\b/i]
  ];

  /** 'protein' | 'carb' | 'fat' | null (null = leave it as written). */
  function classify(name) {
    var n = String(name || '');
    if (!n || NEVER.test(n)) return null;
    for (var i = 0; i < KIND_PATTERNS.length; i++) if (KIND_PATTERNS[i][1].test(n)) return KIND_PATTERNS[i][0];
    return null;
  }

  // ---------- add-ons ----------
  // Nutrition and rough US prices per 100 g. `max` and `step` are grams per recipe serving.
  var ADDONS = [
    { key: 'chicken', name: 'boneless skinless chicken breast', kind: 'protein', per100: [120, 22.5, 0, 2.6], price100: 0.88,
      max: 200, step: 10, show: 'weight', how: 'Season and bake or pan-sear it separately, then divide it among the portions or stir it in.',
      diets: ['', 'high-protein', 'ketogenic', 'paleo', 'gluten free', 'whole30', 'low fodmap'], allergens: [] },
    { key: 'eggwhites', name: 'liquid egg whites', kind: 'protein', per100: [52, 10.9, 0.7, 0.2], price100: 0.45, gramsPerUnit: 243, unit: 'cup',
      max: 250, step: 10, show: 'unit', how: 'Scramble them and serve alongside, or stir them in near the end of cooking.',
      diets: ['', 'high-protein', 'ketogenic', 'vegetarian', 'pescetarian', 'paleo', 'gluten free', 'whole30', 'low fodmap'], allergens: ['egg'] },
    { key: 'yogurt', name: 'plain nonfat Greek yogurt', kind: 'protein', per100: [59, 10.2, 3.6, 0.4], price100: 0.5, gramsPerUnit: 227, unit: 'cup',
      max: 200, step: 10, show: 'unit', how: 'Serve it on the side or spoon it on top as a sauce.',
      diets: ['', 'high-protein', 'ketogenic', 'vegetarian', 'pescetarian', 'gluten free'], allergens: ['dairy'] },
    { key: 'tofu', name: 'extra-firm tofu', kind: 'protein', per100: [144, 17.3, 2.8, 8.7], price100: 0.55, gramsPerUnit: 397, unit: 'block', unitNote: '14 oz',
      max: 200, step: 10, show: 'unit', how: 'Press it, cut into cubes, pan-fry until golden, then add it to the dish.',
      diets: ['', 'high-protein', 'ketogenic', 'vegetarian', 'vegan', 'pescetarian', 'gluten free', 'low fodmap'], allergens: ['soy'] },
    { key: 'shrimp', name: 'raw peeled shrimp', kind: 'protein', per100: [85, 20.1, 0, 0.5], price100: 2.2,
      max: 200, step: 10, show: 'weight', how: 'Sauté for 2–3 minutes until pink and stir in at the end.',
      diets: ['', 'high-protein', 'ketogenic', 'pescetarian', 'paleo', 'gluten free', 'whole30', 'low fodmap'], allergens: ['shellfish', 'seafood'] },
    { key: 'rice', name: 'white rice (dry)', kind: 'carb', per100: [365, 7.1, 80, 0.7], price100: 0.35, gramsPerUnit: 185, unit: 'cup',
      max: 80, step: 5, show: 'unit', how: 'Cook it and serve alongside.',
      diets: ['', 'high-protein', 'vegetarian', 'vegan', 'pescetarian', 'gluten free', 'low fodmap'], allergens: ['grain'] },
    { key: 'potato', name: 'potatoes', kind: 'carb', per100: [77, 2, 17.5, 0.1], price100: 0.25,
      max: 250, step: 10, show: 'weight', how: 'Roast or boil them and serve alongside.',
      diets: ['', 'high-protein', 'vegetarian', 'vegan', 'pescetarian', 'paleo', 'gluten free', 'whole30', 'low fodmap'], allergens: [] },
    { key: 'beans', name: 'canned black beans', kind: 'carb', per100: [91, 6, 16.6, 0.3], price100: 0.48, gramsPerUnit: 250, unit: 'can', unitNote: '15 oz, drained',
      max: 200, step: 10, show: 'unit', how: 'Rinse, drain and stir them in, or serve alongside.',
      diets: ['', 'high-protein', 'vegetarian', 'vegan', 'pescetarian', 'gluten free'], allergens: [] },
    { key: 'oil', name: 'olive oil', kind: 'fat', per100: [884, 0, 0, 100], price100: 1.2, gramsPerUnit: 13.5, unit: 'Tbsp',
      max: 15, step: 1, show: 'unit', how: 'Use it for cooking, or drizzle it over the portions.',
      diets: ['', 'high-protein', 'ketogenic', 'vegetarian', 'vegan', 'pescetarian', 'paleo', 'gluten free', 'whole30', 'low fodmap'], allergens: [] },
    { key: 'avocado', name: 'avocados', kind: 'fat', per100: [160, 2, 8.5, 14.7], price100: 1.0, gramsPerUnit: 136, unit: 'avocado',
      max: 100, step: 5, show: 'unit', how: 'Slice it onto each portion when you eat it (cut it fresh each day).',
      diets: ['', 'high-protein', 'ketogenic', 'vegetarian', 'vegan', 'pescetarian', 'paleo', 'gluten free', 'whole30'], allergens: [] }
  ];

  function addonByKey(key) { return ADDONS.filter(function (a) { return a.key === key; })[0] || null; }

  /** Add-ons allowed by your diet type, allergies and excluded ingredients. */
  function allowedAddons(diet) {
    var d = diet || {};
    var type = d.type || '';
    var tol = (d.intolerances || []).map(function (s) { return s.toLowerCase(); });
    var excl = String(d.exclude || '').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return ADDONS.filter(function (a) {
      if (a.diets.indexOf(type) === -1) return false;
      if (a.allergens.some(function (x) { return tol.indexOf(x) !== -1; })) return false;
      var label = (a.key + ' ' + a.name).toLowerCase();
      return !excl.some(function (x) { return label.indexOf(x) !== -1 || x.indexOf(a.key) !== -1; });
    });
  }

  function addonVector(addon, grams) {
    var f = grams / 100;
    return { calories: addon.per100[0] * f, protein: addon.per100[1] * f, carbs: addon.per100[2] * f, fat: addon.per100[3] * f };
  }

  // ---------- recipe parts ----------
  function zero() { return { calories: 0, protein: 0, carbs: 0, fat: 0 }; }
  function add(a, b, times) { var t = times == null ? 1 : times; KEYS.forEach(function (k) { a[k] += b[k] * t; }); return a; }
  function partKey(id, name) { return id ? 'id:' + id : 'name:' + String(name || '').toLowerCase(); }

  /**
   * The recipe's ingredients (per recipe serving), grouped so an ingredient
   * listed twice (e.g. oil for two steps) is treated as one.
   */
  function parts(recipe) {
    var list = recipe.ingNut || [];
    var byKey = {}, order = [];
    list.forEach(function (row) {
      var key = partKey(row[0], row[1]);
      if (!byKey[key]) { byKey[key] = { key: key, name: row[1], kind: classify(row[1]), v: zero() }; order.push(key); }
      add(byKey[key].v, { calories: row[2] || 0, protein: row[3] || 0, carbs: row[4] || 0, fat: row[5] || 0 });
    });
    return order.map(function (k) { return byKey[k]; });
  }

  // ---------- the search ----------
  function grid(min, max, step) {
    var out = [];
    for (var x = min; x <= max + 1e-9; x += step) out.push(Math.round(x * 1000) / 1000);
    return out;
  }
  var MULT_GRID = grid(MIN_MULT, MAX_MULT, MULT_STEP);

  /**
   * Coordinate search: improve one variable at a time, keep going while it helps.
   * vars: [{ grid, value, cost(value) }]; objective(values) -> number.
   */
  function optimise(vars, objective) {
    var values = vars.map(function (v) { return v.value; });
    var best = objective(values);
    for (var pass = 0; pass < 6; pass++) {
      var improved = false;
      for (var i = 0; i < vars.length; i++) {
        var keep = values[i];
        for (var g = 0; g < vars[i].grid.length; g++) {
          values[i] = vars[i].grid[g];
          var score = objective(values);
          if (score < best - 1e-12) { best = score; keep = values[i]; improved = true; }
        }
        values[i] = keep;
      }
      if (!improved) break;
    }
    return { values: values, score: best };
  }

  /**
   * Finds ingredient multipliers (and maybe one add-on) for this recipe.
   * Returns {
   *   mults: { partKey: multiplier }   (only changed ingredients),
   *   addon: null | { key, grams }      (grams per recipe serving),
   *   perServing: tuned nutrition per recipe serving (before portion sizing),
   *   baseError, error, tuned: bool
   * }
   */
  function tune(recipe, target, diet) {
    var base = recipe.perServing;
    var baseError = errorAtTarget(base, target);
    var plain = { mults: {}, addon: null, perServing: base, baseError: baseError, error: baseError, tuned: false };
    if (!(base && base.calories > 0) || !(target && target.calories > 0)) return plain;

    var all = parts(recipe);
    var adjustable = all.filter(function (p) { return p.kind && p.v.calories > 0; });
    // Everything we're not changing, including anything Spoonacular didn't itemise.
    var fixed = zero();
    add(fixed, base);
    adjustable.forEach(function (p) { add(fixed, p.v, -1); });
    KEYS.forEach(function (k) { if (fixed[k] < 0) fixed[k] = 0; });

    function totals(mults, addon, grams) {
      var t = zero();
      add(t, fixed);
      adjustable.forEach(function (p, i) { add(t, p.v, mults[i]); });
      if (addon && grams > 0) add(t, addonVector(addon, grams));
      return t;
    }
    function changeCost(mults) {
      return mults.reduce(function (s, m) { return s + CHANGE_COST * Math.abs(Math.log(m)); }, 0);
    }

    function run(addon) {
      var vars = adjustable.map(function () { return { grid: MULT_GRID, value: 1 }; });
      if (addon) vars.push({ grid: grid(0, addon.max, addon.step), value: 0 });
      var n = adjustable.length;
      var res = optimise(vars, function (vals) {
        var mults = vals.slice(0, n);
        var grams = addon ? vals[n] : 0;
        var e = errorAtTarget(totals(mults, addon, grams), target);
        return e + changeCost(mults) + (grams > 0 ? ADDON_COST : 0);
      });
      var mults = res.values.slice(0, n);
      var grams = addon ? res.values[n] : 0;
      return { mults: mults, grams: grams, error: errorAtTarget(totals(mults, addon, grams), target), score: res.score, addon: grams > 0 ? addon : null };
    }

    var best = adjustable.length ? run(null) : { mults: [], grams: 0, error: baseError, score: baseError, addon: null };

    if (best.error > ADDON_WHEN_BELOW) {
      allowedAddons(diet).forEach(function (a) {
        var r = run(a);
        if (r.addon && r.error <= best.error - ADDON_MIN_GAIN && r.score < best.score) best = r;
      });
    }

    var mults = {};
    adjustable.forEach(function (p, i) { if (Math.abs(best.mults[i] - 1) > 1e-9) mults[p.key] = best.mults[i]; });
    var addonOut = best.addon ? { key: best.addon.key, grams: best.grams } : null;
    var tunedTotals = totals(best.mults, best.addon, best.grams);
    var changed = Object.keys(mults).length > 0 || !!addonOut;
    return {
      mults: mults,
      addon: addonOut,
      perServing: changed ? tunedTotals : base,
      baseError: baseError,
      error: changed ? best.error : baseError,
      tuned: changed
    };
  }

  /** Multiplier for one detailed ingredient ({ id, name }) from a tune() result. */
  function multFor(tuning, ing) {
    if (!tuning || !tuning.mults) return 1;
    var m = tuning.mults[partKey(ing.id, ing.name)];
    if (m == null && ing.id) m = tuning.mults[partKey(null, ing.name)];
    return m == null ? 1 : m;
  }

  /** "+30% · more protein" / "−50% · less fat", or '' if unchanged. */
  function changeLabel(mult, name) {
    if (Math.abs(mult - 1) < 0.025) return '';
    var pct = Math.round((mult - 1) * 100);
    var kind = classify(name);
    var what = kind === 'carb' ? 'carbs' : kind || 'balance';
    return (pct > 0 ? '+' : '−') + Math.abs(pct) + '% · ' + (pct > 0 ? 'more ' : 'less ') + what;
  }

  var api = {
    MIN_MULT: MIN_MULT, MAX_MULT: MAX_MULT, ADDONS: ADDONS,
    macroError: macroError,
    errorAtTarget: errorAtTarget,
    classify: classify,
    allowedAddons: allowedAddons,
    addonByKey: addonByKey,
    addonVector: addonVector,
    partKey: partKey,
    parts: parts,
    tune: tune,
    multFor: multFor,
    changeLabel: changeLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tuning = api;
})(this);
