/*
 * Units and ingredient names, shared by the grocery list and the price list.
 *  - parseUnit: "Tbsps" -> tablespoons, "lbs" -> pounds, "cloves" -> a count of cloves
 *  - normName: "Boneless Skinless Chicken Breasts" -> "chicken breast"
 *  - gramsPerCup: how much a cup of something weighs, to turn cups into weights
 * Works in the browser (window.Units) and in Node (for the tests).
 */
(function (root) {
  'use strict';

  // ---------- units ----------
  var MASS = { g: 1, gram: 1, kg: 1000, kilogram: 1000, oz: 28.3495, ounce: 28.3495, lb: 453.592, pound: 453.592 };
  var VOLUME = { ml: 1, milliliter: 1, l: 1000, liter: 1000, tsp: 4.92892, teaspoon: 4.92892, tbsp: 14.7868, tablespoon: 14.7868,
    cup: 236.588, floz: 29.5735, 'fluid ounce': 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41 };
  var ALIASES = { t: 'tsp', ts: 'tsp', tsps: 'tsp', teaspoons: 'tsp', tbs: 'tbsp', tbl: 'tbsp', tbsps: 'tbsp', tablespoons: 'tbsp', T: 'tbsp',
    c: 'cup', cups: 'cup', lbs: 'lb', pounds: 'lb', ounces: 'oz', grams: 'g', kilograms: 'kg', kgs: 'kg', milliliters: 'ml', mls: 'ml',
    liters: 'l', litre: 'l', litres: 'l', 'fl oz': 'floz', 'fl. oz': 'floz', 'fl.oz': 'floz', 'fluid ounces': 'floz',
    pt: 'pint', pints: 'pint', qt: 'quart', quarts: 'quart', gal: 'gallon', gallons: 'gallon' };

  /** Turns a recipe unit into { dim: 'mass'|'volume'|'count', unit, factor } (factor to grams / ml). */
  function parseUnit(unit) {
    var raw = String(unit || '').trim();
    if (raw === 'T') raw = 'tbsp';
    var u = raw.toLowerCase().replace(/\.$/, '');
    u = ALIASES[u] || u;
    if (MASS[u]) return { dim: 'mass', unit: u, factor: MASS[u] };
    if (VOLUME[u]) return { dim: 'volume', unit: u, factor: VOLUME[u] };
    var single = u.replace(/(ches|shes|xes)$/, function (m) { return m.slice(0, -2); }).replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
    return { dim: 'count', unit: single, factor: 1 };
  }

  // ---------- names ----------
  var DROP_WORDS = /\b(boneless|skinless|fresh|raw|peeled|deveined|plain|nonfat|non-fat|fat-free|low-fat|lowfat|extra-firm|extra firm|firm|liquid|canned|uncooked|large|medium|small|chopped|diced|minced|sliced|shredded|grated|crumbled|cubed|packed|organic|lean|extra-virgin|extra virgin|frozen|whole|baby)\b/g;

  function singularWord(w) {
    if (w.length <= 3 || /(ss|us|is)$/.test(w)) return w;
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(ches|shes|xes)$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w)) return w.slice(0, -1);
    return w;
  }

  /** "Boneless Skinless Chicken Breasts" -> "chicken breast"; "white rice (dry)" -> "white rice". */
  function normName(name) {
    var n = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(DROP_WORDS, ' ').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!n) return String(name || '').toLowerCase().trim();
    var words = n.split(' ');
    words[words.length - 1] = singularWord(words[words.length - 1]);
    return words.join(' ');
  }

  // ---------- how much a cup weighs (grams), for showing weights you can buy ----------
  var DENSITY = [
    [/parmesan|parmigiano|pecorino/, 100], [/cream cheese/, 232], [/feta|goat cheese/, 150], [/ricotta|cottage cheese/, 246],
    [/cheddar|mozzarella|monterey|jack|colby|swiss|gouda|gruyere|provolone|cheese/, 113],
    [/greek yogurt|yogurt/, 245], [/sour cream/, 230], [/heavy cream|whipping cream/, 238], [/milk/, 245], [/butter/, 227],
    [/brown rice|white rice|jasmine rice|basmati rice|rice/, 185], [/quinoa/, 170], [/couscous/, 173], [/oats|oatmeal/, 80],
    [/lentil/, 192], [/black bean|kidney bean|pinto bean|cannellini|white bean|chickpea|garbanzo/, 172], [/edamame/, 155],
    [/spinach|arugula/, 30], [/kale/, 67], [/lettuce|romaine|mixed greens/, 47], [/cabbage/, 89], [/broccoli/, 91], [/cauliflower/, 107],
    [/bell pepper|red pepper|green pepper|yellow pepper/, 149], [/onion/, 160], [/carrot/, 128], [/celery/, 101], [/mushroom/, 70],
    [/cherry tomato|grape tomato/, 149], [/tomato/, 180], [/corn/, 145], [/\bpeas?\b/, 134], [/green bean/, 110], [/zucchini|squash/, 124],
    [/sweet potato/, 133], [/potato/, 150], [/cucumber/, 119], [/cilantro|parsley|basil/, 16],
    [/almond/, 143], [/walnut|pecan/, 117], [/cashew/, 137], [/peanut/, 146],
    [/chicken|turkey|beef|pork/, 140]
  ];
  // Liquids and seasonings stay in cups/spoons even if their name contains "rice", "chicken"...
  var NO_WEIGHT = /vinegar|sauce|broth|stock|bouillon|oil|powder|extract|paste|juice|wine|syrup|dressing|seasoning|spice|water|flake|salsa/;
  function gramsPerCup(norm) {
    if (NO_WEIGHT.test(norm)) return null;
    for (var i = 0; i < DENSITY.length; i++) if (DENSITY[i][0].test(norm)) return DENSITY[i][1];
    return null;
  }

  var api = {
    MASS: MASS, VOLUME: VOLUME, NO_WEIGHT: NO_WEIGHT,
    parseUnit: parseUnit, normName: normName, gramsPerCup: gramsPerCup
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Units = api;
})(this);
