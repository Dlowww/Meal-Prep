/*
 * Recipe matching: everything about scoring, scaling and formatting recipes.
 * No screen code and no internet here, so it can be tested on its own.
 * Works in the browser (window.Recipes) and in Node (for the tests).
 */
(function (root) {
  'use strict';

  var PAGE_SIZE = 40;          // recipes fetched per search
  var MIN_CAL_FACTOR = 0.6;    // only fetch recipes whose serving is 60%..150% of the meal target,
  var MAX_CAL_FACTOR = 1.5;    // so portions stay a sensible size
  var Tuning = (typeof module !== 'undefined' && module.exports) ? require('./tuning.js') : root.Tuning;
  var Prices = (typeof module !== 'undefined' && module.exports) ? require('./prices.js') : root.Prices;

  // ---------- reading Spoonacular data ----------
  var NUTRIENT_NAMES = { Calories: 'calories', Protein: 'protein', Carbohydrates: 'carbs', Fat: 'fat' };

  /** Per-serving { calories, protein, carbs, fat } from a Spoonacular recipe. */
  function nutritionPerServing(recipe) {
    var out = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    var list = recipe && recipe.nutrition && recipe.nutrition.nutrients;
    if (Array.isArray(list)) {
      list.forEach(function (n) {
        var key = NUTRIENT_NAMES[n.name];
        if (key) out[key] = Number(n.amount) || 0;
      });
    } else if (recipe && recipe.perServing) {
      return recipe.perServing;
    }
    return out;
  }

  /** Keeps only what the app needs from a search result. */
  function compactSearchResult(r) {
    return {
      id: r.id,
      title: r.title,
      image: r.image || '',
      sourceUrl: r.sourceUrl || r.spoonacularSourceUrl || '',
      servings: r.servings || 1,
      readyInMinutes: r.readyInMinutes || null,
      pricePerServing: Number(r.pricePerServing) || 0,   // US cents
      perServing: nutritionPerServing(r),
      ingNut: ingredientNutrition(r.nutrition)
    };
  }

  /**
   * Per-serving nutrition of each ingredient, as compact rows:
   * [id, name, calories, protein, carbs, fat, amount, unit]. Used for macro tuning and pricing.
   */
  function ingredientNutrition(nutrition) {
    var list = nutrition && nutrition.ingredients;
    if (!Array.isArray(list)) return [];
    var r2 = function (x) { return Math.round((Number(x) || 0) * 100) / 100; };
    return list.map(function (ing) {
      var v = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      (ing.nutrients || []).forEach(function (n) { var k = NUTRIENT_NAMES[n.name]; if (k) v[k] = Number(n.amount) || 0; });
      return [ing.id || null, ing.name || '', r2(v.calories), r2(v.protein), r2(v.carbs), r2(v.fat), Number(ing.amount) || 0, ing.unit || ''];
    });
  }

  function cleanStep(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  /** Full recipe (from /recipes/{id}/information) -> what we store for the chosen recipe. */
  function compactRecipeDetail(info, fromSearch) {
    var base = fromSearch || compactSearchResult(info);
    var steps = [];
    (info.analyzedInstructions || []).forEach(function (section) {
      (section.steps || []).forEach(function (s) { if (s.step) steps.push(cleanStep(s.step)); });
    });
    if (!steps.length && info.instructions) {
      steps = String(info.instructions).replace(/<[^>]+>/g, '\n').split(/\n+/).map(cleanStep).filter(Boolean);
    }
    var ingredients = (info.extendedIngredients || []).map(function (ing) {
      var us = (ing.measures && ing.measures.us) || {};
      return {
        id: ing.id || null,
        name: ing.nameClean || ing.name || '',
        aisle: ing.aisle || '',
        amount: Number(us.amount != null ? us.amount : ing.amount) || 0,
        unit: (us.unitShort != null ? us.unitShort : ing.unit) || '',
        original: ing.original || ''
      };
    });
    return {
      id: base.id,
      title: info.title || base.title,
      image: info.image || base.image,
      sourceUrl: info.sourceUrl || base.sourceUrl,
      servings: info.servings || base.servings || 1,
      readyInMinutes: info.readyInMinutes || base.readyInMinutes,
      pricePerServing: Number(info.pricePerServing) || base.pricePerServing,
      perServing: base.perServing,
      ingNut: (function () { var rows = ingredientNutrition(info.nutrition); return rows.length ? rows : (base.ingNut || []); })(),
      ingredients: ingredients,
      steps: steps
    };
  }

  // ---------- building the search ----------
  function cleanList(text) {
    return String(text || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** Query parameters for complexSearch, from the saved settings and one meal's target. */
  function searchParams(settings, mealTarget, offset) {
    var diet = settings.diet || {};
    var p = {
      type: 'main course',
      addRecipeInformation: 'true',
      addRecipeNutrition: 'true',
      instructionsRequired: 'true',
      number: String(PAGE_SIZE),
      offset: String(offset || 0),
      minCalories: String(Math.round(mealTarget.calories * MIN_CAL_FACTOR)),
      maxCalories: String(Math.round(mealTarget.calories * MAX_CAL_FACTOR))
    };
    if (diet.type === 'high-protein') {
      p.sort = 'protein';
      p.sortDirection = 'desc';
    } else {
      p.sort = 'popularity';
      if (diet.type) p.diet = diet.type;
    }
    if (diet.intolerances && diet.intolerances.length) {
      p.intolerances = diet.intolerances.map(function (s) { return s.toLowerCase(); }).join(',');
    }
    var excl = cleanList(diet.exclude);
    if (excl.length) p.excludeIngredients = excl.join(',');
    return p;
  }

  /**
   * A short fingerprint of everything that changes search results. If it
   * changes, saved results are out of date.
   */
  function searchKey(settings, mealTarget) {
    var d = settings.diet || {};
    return JSON.stringify(['v3',   // bump when search results need refetching (v3: per-ingredient amounts for pricing)
      Math.round(mealTarget.calories), Math.round(mealTarget.protein), Math.round(mealTarget.carbs), Math.round(mealTarget.fat),
      d.type || '', (d.intolerances || []).slice().sort(), cleanList(d.exclude).map(function (s) { return s.toLowerCase(); }).sort(),
      settings.budget || 0, settings.servings ? [settings.servings.lunch, settings.servings.dinner] : []
    ]);
  }

  // ---------- scaling and scoring ----------
  /** How many recipe servings make one of my portions (to hit the calorie target). */
  function portionFactor(perServing, mealTarget) {
    if (!perServing || !(perServing.calories > 0) || !(mealTarget.calories > 0)) return 1;
    return mealTarget.calories / perServing.calories;
  }

  function scaleNutrition(perServing, factor) {
    return {
      calories: perServing.calories * factor,
      protein: perServing.protein * factor,
      carbs: perServing.carbs * factor,
      fat: perServing.fat * factor
    };
  }

  /**
   * How one macro compares with its target.
   * status: 'good' (within 10%, or protein up to 25% over), 'close' (within 20%), 'off'.
   */
  function macroCheck(key, actual, target) {
    if (!(target > 0)) return { key: key, actual: actual, target: target, rel: 0, status: 'good' };
    var rel = (actual - target) / target;
    var abs = Math.abs(rel);
    var status;
    if (abs <= 0.10 || (key === 'protein' && rel > 0 && rel <= 0.25)) status = 'good';
    else if (abs <= 0.20) status = 'close';
    else status = 'off';
    return { key: key, actual: actual, target: target, rel: rel, status: status };
  }

  // Tuning is the slow part, so remember results while the app is open.
  var tuneCache = {};
  var tuneCacheSize = 0;
  function cachedTune(recipe, mealTarget, diet) {
    var key = recipe.id + '|' + [mealTarget.calories, mealTarget.protein, mealTarget.carbs, mealTarget.fat].map(Math.round).join(',') +
      '|' + JSON.stringify(diet || {}) + '|' + (recipe.ingNut || []).length;
    if (!tuneCache[key]) {
      if (tuneCacheSize > 2000) { tuneCache = {}; tuneCacheSize = 0; }
      tuneCache[key] = Tuning.tune(recipe, mealTarget, diet);
      tuneCacheSize++;
    }
    return tuneCache[key];
  }

  function toPct(err) { return Math.max(0, Math.round((1 - err) * 100)); }

  /**
   * Cost of one recipe serving (before portion sizing), in dollars, priced from
   * the built-in price list with any tuning applied. Falls back to Spoonacular's
   * own estimate only when we don't know the ingredient amounts.
   */
  function servingCost(recipe, tuning) {
    var total = 0, priced = false;
    if (recipe.ingredients && recipe.ingredients.length) {
      var servings = recipe.servings || 1;
      recipe.ingredients.forEach(function (ing) {
        if (!(ing.amount > 0)) return;
        total += Prices.usedCost(ing.amount / servings, ing.unit, ing.name) * Tuning.multFor(tuning, ing);
        priced = true;
      });
    } else if (recipe.ingNut && recipe.ingNut.length && recipe.ingNut[0].length > 6) {
      recipe.ingNut.forEach(function (row) {
        if (!(row[6] > 0)) return;
        var m = tuning && tuning.mults ? tuning.mults[Tuning.partKey(row[0], row[1])] : null;
        total += Prices.usedCost(row[6], row[7], row[1]) * (m == null ? 1 : m);
        priced = true;
      });
    }
    if (!priced) total = (recipe.pricePerServing || 0) / 100;
    if (tuning && tuning.addon) {
      var a = Tuning.addonByKey(tuning.addon.key);
      if (a) total += Prices.usedCost(tuning.addon.grams, 'g', a.name);
    }
    return total;
  }

  /**
   * Scores a recipe for one meal. Lower `score` is better.
   * options:
   *   budget, totalPortions  favor cheaper recipes
   *   diet                   your diet settings (decides which add-ons are allowed)
   *   tune: false            score the recipe exactly as written
   */
  function evaluate(recipe, mealTarget, options) {
    var opts = options || {};
    var base = recipe.perServing || nutritionPerServing(recipe);
    var tuning = opts.tune === false ? null : cachedTune(recipe, mealTarget, opts.diet);
    var per = tuning && tuning.tuned ? tuning.perServing : base;
    var factor = portionFactor(per, mealTarget);
    var scaled = scaleNutrition(per, factor);

    var err = Tuning.macroError(scaled, mealTarget);
    var baseErr = Tuning.errorAtTarget(base, mealTarget);
    var matchPct = toPct(err);

    var penalty = 0;
    if (factor > 2) penalty += (factor - 2) * 0.1;          // very big portions
    if (factor < 0.5) penalty += (0.5 - factor) * 0.2;      // very small portions

    var costPerPortion = servingCost(recipe, tuning && tuning.tuned ? tuning : null) * factor;   // dollars
    var perPortionBudget = null;
    if (opts.budget > 0 && opts.totalPortions > 0) {
      perPortionBudget = opts.budget / opts.totalPortions;
      var ratio = costPerPortion / perPortionBudget;
      penalty += Math.max(0, ratio - 1) * 0.6 + ratio * 0.1;
    }

    return {
      recipe: recipe,
      factor: factor,
      scaled: scaled,
      tuning: tuning && tuning.tuned ? tuning : null,
      baseMatchPct: toPct(baseErr),
      costPerPortion: costPerPortion,
      overBudget: perPortionBudget != null && costPerPortion > perPortionBudget,
      matchPct: matchPct,
      checks: {
        calories: macroCheck('calories', scaled.calories, mealTarget.calories),
        protein: macroCheck('protein', scaled.protein, mealTarget.protein),
        carbs: macroCheck('carbs', scaled.carbs, mealTarget.carbs),
        fat: macroCheck('fat', scaled.fat, mealTarget.fat)
      },
      score: err + penalty
    };
  }

  /** Scores and sorts recipes, best first. Recipes with no calorie data are dropped. */
  function rank(recipes, mealTarget, options) {
    return recipes
      .filter(function (r) { var p = r.perServing || nutritionPerServing(r); return p.calories > 0; })
      .map(function (r) { return evaluate(r, mealTarget, options); })
      .sort(function (a, b) { return a.score - b.score; });
  }

  /**
   * Lunch and dinner share one ranked list: lunch takes ranks 1, 3, 5…,
   * dinner takes 2, 4, 6…, so both get good options without repeats.
   * `excludeId` (the other meal's chosen recipe) is skipped.
   */
  function optionsFor(meal, ranked, count, excludeId) {
    // Alternate over the full list first, so choosing a lunch doesn't reshuffle dinner.
    var start = meal === 'dinner' ? 1 : 0;
    var out = [];
    for (var i = start; i < ranked.length && out.length < count; i += 2) {
      if (ranked[i].recipe.id !== excludeId) out.push(ranked[i]);
    }
    return out;
  }

  /** Total multiplier for the whole recipe: my portion size × number of portions ÷ recipe servings. */
  function batchMultiplier(recipe, factor, portions) {
    return factor * portions / (recipe.servings || 1);
  }

  /** How much of an add-on to buy, in friendly units: "1¼ lb", "2 cups", "1½ cans (15 oz, drained)". */
  function formatAddonAmount(addon, grams) {
    if (addon.show === 'weight') {
      var oz = grams / 28.35;
      if (oz < 15.5) return formatAmount(Math.max(oz, 0.5), 'oz') + ' oz';
      return formatAmount(oz / 16, 'lb') + ' lb';
    }
    var n = grams / addon.gramsPerUnit;
    var whole = ['can', 'block', 'avocado'].indexOf(addon.unit) !== -1;
    if (whole) n = Math.max(0.5, Math.round(n * 2) / 2);
    return formatAmount(n, addon.unit) + ' ' + unitLabel(addon.unit, n) + (addon.unitNote ? ' (' + addon.unitNote + ')' : '');
  }

  /**
   * Everything needed to cook the batch: the evaluation, the recipe multiplier,
   * each ingredient's final amount (with any tuning applied) and the add-on, if any.
   */
  function batchPlan(recipe, mealTarget, portions, options) {
    var e = evaluate(recipe, mealTarget, options);
    var mult = batchMultiplier(recipe, e.factor, portions);
    var ingredients = (recipe.ingredients || []).map(function (ing) {
      var m = Tuning.multFor(e.tuning, ing);
      return {
        id: ing.id, name: ing.name, aisle: ing.aisle, unit: ing.unit, original: ing.original,
        amount: ing.amount * mult * m,
        tuneMult: m,
        change: Tuning.changeLabel(m, ing.name)
      };
    });
    var addon = null;
    if (e.tuning && e.tuning.addon) {
      var a = Tuning.addonByKey(e.tuning.addon.key);
      if (a) {
        var grams = e.tuning.addon.grams * e.factor * portions;
        addon = { key: a.key, name: a.name, kind: a.kind, grams: grams, qty: formatAddonAmount(a, grams), how: a.how,
          gramsPerPortion: e.tuning.addon.grams * e.factor };
      }
    }
    return { evaluation: e, multiplier: mult, ingredients: ingredients, addon: addon };
  }

  /** Short summary of what tuning changed, for recipe cards: "+40% chicken breast, −50% olive oil, + rice". */
  function tuningSummary(recipe, tuning) {
    if (!tuning) return '';
    var bits = Tuning.parts(recipe)
      .filter(function (p) { return tuning.mults[p.key] != null && Math.abs(tuning.mults[p.key] - 1) >= 0.025; })
      .map(function (p) {
        var pct = Math.round((tuning.mults[p.key] - 1) * 100);
        return (pct > 0 ? '+' : '−') + Math.abs(pct) + '% ' + p.name;
      });
    if (tuning.addon) {
      var a = Tuning.addonByKey(tuning.addon.key);
      if (a) bits.push('add ' + a.name);
    }
    return bits.join(', ');
  }

  // ---------- formatting ----------
  var FRACTIONS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
  var METRIC_WEIGHT = /^(g|gram|grams|ml|milliliter|milliliters)$/i;

  /** 2.27 -> "2¼", 0.33 -> "⅓", 14.6 -> "15". */
  function formatAmount(n, unit) {
    n = Number(n) || 0;
    if (n <= 0) return '';
    if (METRIC_WEIGHT.test(unit || '') || n >= 10) return String(Math.round(n));
    var whole = Math.floor(n);
    var frac = n - whole;
    var best = FRACTIONS[0], bestDiff = Infinity;
    FRACTIONS.forEach(function (f) {
      var d = Math.abs(frac - f[0]);
      if (d < bestDiff) { bestDiff = d; best = f; }
    });
    if (best[0] === 1) { whole += 1; best = FRACTIONS[0]; }
    if (whole === 0 && !best[1]) return '⅛';            // tiny amounts
    return (whole ? String(whole) : '') + best[1];
  }

  // Units that need an "s" for more than one (cup -> cups) or none for one (cans -> can).
  var COUNT_UNITS = ['cup', 'can', 'clove', 'slice', 'piece', 'stalk', 'sprig', 'bunch', 'head', 'package', 'jar',
    'bottle', 'bag', 'box', 'container', 'fillet', 'breast', 'thigh', 'leaf', 'pinch', 'dash', 'handful', 'serving',
    'large', 'medium', 'small', 'avocado', 'block', 'stick', 'strip', 'scoop', 'pint', 'quart', 'gallon', 'packet', 'block', 'ear', 'loaf', 'link', 'rib'];
  var IRREGULAR = { bunch: 'bunches', box: 'boxes', leaf: 'leaves', pinch: 'pinches', dash: 'dashes', loaf: 'loaves',
    large: 'large', medium: 'medium', small: 'small' };

  function singular(u) {
    var lower = u.toLowerCase();
    for (var k in IRREGULAR) if (IRREGULAR[k] === lower) return k;
    return lower.replace(/s$/, '');
  }

  /** "cup" with 1½ -> "cups"; "cans" with 1 -> "can". Other units (lb, oz, tsp, Tbsp) are left as they are. */
  function unitLabel(unit, amount) {
    var u = String(unit || '').trim();
    if (!u) return '';
    var base = singular(u);
    if (COUNT_UNITS.indexOf(base) === -1) return u;
    var plural = amount > 1.0001;
    return plural ? (IRREGULAR[base] || base + 's') : base;
  }

  function formatMoney(dollars) {
    return '$' + (Math.round(dollars * 100) / 100).toFixed(2);
  }

  /** "Protein: 52g of 55g target ✓" */
  function formatCheck(label, check, unit) {
    var mark = check.status === 'good' ? '✓' : check.status === 'close' ? '≈' : (check.rel < 0 ? '↓' : '↑');
    return label + ': ' + Math.round(check.actual) + unit + ' of ' + Math.round(check.target) + unit + ' target ' + mark;
  }

  var api = {
    PAGE_SIZE: PAGE_SIZE,
    nutritionPerServing: nutritionPerServing,
    compactSearchResult: compactSearchResult,
    compactRecipeDetail: compactRecipeDetail,
    searchParams: searchParams,
    searchKey: searchKey,
    portionFactor: portionFactor,
    scaleNutrition: scaleNutrition,
    macroCheck: macroCheck,
    evaluate: evaluate,
    rank: rank,
    optionsFor: optionsFor,
    batchMultiplier: batchMultiplier,
    batchPlan: batchPlan,
    servingCost: servingCost,
    formatAddonAmount: formatAddonAmount,
    tuningSummary: tuningSummary,
    ingredientNutrition: ingredientNutrition,
    formatAmount: formatAmount,
    unitLabel: unitLabel,
    formatMoney: formatMoney,
    formatCheck: formatCheck
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Recipes = api;
})(this);
