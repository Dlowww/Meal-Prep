/*
 * Grocery list: combines the lunch and dinner batches into one shopping list.
 *
 *  - Same ingredient from both recipes (or an add-on) is merged into one line.
 *  - Units are converted so they can be added up (tbsp + cups, oz + lb...).
 *    Where we know how much a cup of something weighs, it's shown as a weight
 *    you can buy, with the cooking amount alongside: "8 oz cheddar (about 2 cups)".
 *  - Totals are rounded *up* a little so you never come home short.
 *  - Items are grouped by store section; pantry staples go in their own group.
 *
 * Works in the browser (window.Grocery) and in Node (for the tests).
 */
(function (root) {
  'use strict';

  var R = (typeof module !== 'undefined' && module.exports) ? require('./recipes.js') : root.Recipes;
  var Prices = (typeof module !== 'undefined' && module.exports) ? require('./prices.js') : root.Prices;

  var U = (typeof module !== 'undefined' && module.exports) ? require('./units.js') : root.Units;
  var MASS = U.MASS, VOLUME = U.VOLUME, NO_WEIGHT = U.NO_WEIGHT;
  var parseUnit = U.parseUnit, normName = U.normName, gramsPerCup = U.gramsPerCup;

  // ---------- store sections ----------
  var SECTIONS = [
    { key: 'produce', label: 'Produce', aisles: ['produce'] },
    { key: 'meat', label: 'Meat & seafood', aisles: ['meat', 'seafood'] },
    { key: 'dairy', label: 'Dairy, eggs & cold', aisles: ['milk, eggs, other dairy', 'cheese', 'refrigerated'] },
    { key: 'bakery', label: 'Bread & bakery', aisles: ['bakery/bread', 'bread'] },
    { key: 'grains', label: 'Pasta, rice & grains', aisles: ['pasta and rice', 'cereal'] },
    { key: 'canned', label: 'Canned & jarred', aisles: ['canned and jarred'] },
    { key: 'sauces', label: 'Sauces & condiments', aisles: ['condiments', 'ethnic foods', 'oil, vinegar, salad dressing', 'gourmet', 'health foods'] },
    { key: 'frozen', label: 'Frozen', aisles: ['frozen'] },
    { key: 'nuts', label: 'Nuts & dried fruit', aisles: ['nuts', 'dried fruits', 'savory snacks', 'sweet snacks'] },
    { key: 'baking', label: 'Baking', aisles: ['baking'] },
    { key: 'drinks', label: 'Drinks', aisles: ['beverages', 'alcoholic beverages', 'tea and coffee'] },
    { key: 'other', label: 'Other', aisles: [] },
    { key: 'pantry', label: 'Pantry staples', aisles: [] }
  ];

  var PANTRY_NAMES = /^(salt|kosher salt|sea salt|black pepper|pepper|salt and pepper|ground pepper|water|ice|olive oil|vegetable oil|canola oil|cooking oil|oil|avocado oil|coconut oil|sesame oil|cooking spray|nonstick cooking spray|garlic powder|onion powder|paprika|smoked paprika|cumin|ground cumin|chili powder|cayenne|cayenne pepper|red pepper flake|crushed red pepper|oregano|dried oregano|thyme|dried thyme|basil leaf|dried basil|rosemary|dried rosemary|cinnamon|ground cinnamon|italian seasoning|bay leaf|nutmeg|ground ginger|turmeric|curry powder|sugar|granulated sugar|brown sugar|flour|all purpose flour|baking soda|baking powder|vanilla|vanilla extract|vinegar|white vinegar|apple cider vinegar|soy sauce|honey|cornstarch)$/;
  var SKIP_NAMES = /^(water|ice|ice cube)$/;

  function sectionFor(aisle, norm) {
    if (PANTRY_NAMES.test(norm)) return 'pantry';
    var first = String(aisle || '').split(';')[0].trim().toLowerCase();
    if (first === 'spices and seasonings') return 'pantry';
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].aisles.indexOf(first) !== -1) return SECTIONS[i].key;
    if (/tofu|tempeh/.test(norm)) return 'produce';
    return 'other';
  }

  // Store sections for add-ons (they don't come from Spoonacular).
  var ADDON_AISLE = { chicken: 'Meat', eggwhites: 'Milk, Eggs, Other Dairy', yogurt: 'Milk, Eggs, Other Dairy', tofu: 'Produce',
    shrimp: 'Seafood', rice: 'Pasta and Rice', potato: 'Produce', beans: 'Canned and Jarred', oil: 'Oil, Vinegar, Salad Dressing', avocado: 'Produce' };

  // ---------- quantities ----------
  // A quantity is { mass: grams, volume: ml, counts: { unit: n }, unknown: bool }.
  function emptyQty() { return { mass: 0, volume: 0, counts: {}, unknown: false }; }
  function addLine(q, amount, unit) {
    var a = Number(amount) || 0;
    if (!(a > 0)) { q.unknown = true; return; }
    var u = parseUnit(unit);
    if (u.dim === 'mass') q.mass += a * u.factor;
    else if (u.dim === 'volume') q.volume += a * u.factor;
    else q.counts[u.unit] = (q.counts[u.unit] || 0) + a;
  }
  function isEmpty(q) { return !(q.mass > 0) && !(q.volume > 0) && !Object.keys(q.counts).length; }

  // ---------- formatting ----------
  // Round up to the next step, but ignore tiny overshoots (under 10% of a step), e.g. 11.04 oz -> 11 oz.
  function ceilTo(x, step) { return Math.ceil(x / step - 0.1) * step; }

  /** Weight to buy: under a pound in whole ounces, otherwise pounds to the nearest ¼ (always rounding up). */
  function formatWeight(grams, roundUp, preferOz) {
    var oz = grams / MASS.oz;
    // Jars, cans and sauces are labelled in ounces, so keep them in oz up to 4 lb.
    if (oz < 15.5 || (preferOz && oz < 64)) {
      var o = roundUp ? Math.max(1, ceilTo(oz, oz < 4 ? 0.5 : 1)) : oz;
      return R.formatAmount(o, 'oz') + ' oz';
    }
    var lb = oz / 16;
    return R.formatAmount(roundUp ? ceilTo(lb, 0.25) : lb, 'lb') + ' lb';
  }

  /** Volume in the handiest kitchen unit: cups, then Tbsp, then tsp. */
  function formatVolume(ml, roundUp) {
    var cups = ml / VOLUME.cup;
    if (cups >= 0.25 - 1e-9) {
      var c = roundUp ? ceilTo(cups, 0.25) : cups;
      return R.formatAmount(c, 'cup') + ' ' + R.unitLabel('cup', c);
    }
    var tbsp = ml / VOLUME.tbsp;
    if (tbsp >= 1 - 1e-9) return R.formatAmount(roundUp ? ceilTo(tbsp, 0.5) : tbsp, 'Tbsp') + ' Tbsp';
    var tsp = ml / VOLUME.tsp;
    return R.formatAmount(roundUp ? ceilTo(tsp, 0.25) : tsp, 'tsp') + ' tsp';
  }

  function formatCounts(counts, roundUp) {
    return Object.keys(counts).map(function (unit) {
      var n = counts[unit];
      // You can't buy half an onion or half a clove: shopping totals round up to whole ones.
      if (roundUp) n = Math.max(1, ceilTo(n, 1));
      var amt = R.formatAmount(n, unit);
      return unit ? amt + ' ' + R.unitLabel(unit, n) : amt;
    });
  }

  /**
   * How to show a quantity.
   *  shopping: true  -> buyable units, rounded up (main line)
   *  shopping: false -> exact, for the lunch/dinner split
   * Returns { text, note } where note is the cooking amount, e.g. "about 2 cups".
   */
  function describe(q, norm, opts) {
    var shopping = !!(opts && opts.shopping);
    var pantry = !!(opts && opts.pantry);
    var parts = [], note = '';
    var gpc = pantry ? null : gramsPerCup(norm);
    var mass = q.mass, volume = q.volume;

    if (gpc && volume > 0) {
      // Show as a weight to buy, with the cooking measure alongside.
      var totalGrams = mass + volume / VOLUME.cup * gpc;
      parts.push(formatWeight(totalGrams, shopping));
      note = 'about ' + formatVolume(totalGrams / gpc * VOLUME.cup, false);
      mass = 0; volume = 0;
    }
    if (mass > 0) parts.push(formatWeight(mass, shopping, !!(opts && opts.preferOz)));
    if (volume > 0) parts.push(formatVolume(volume, shopping && !pantry));
    parts = parts.concat(formatCounts(q.counts, shopping));
    if (!parts.length) return { text: q.unknown ? 'as needed' : '', note: '' };
    return { text: parts.join(' + '), note: note };
  }

  // ---------- building the list ----------
  /**
   * plans: { lunch: batchPlan | null, dinner: batchPlan | null }
   *   (batchPlan comes from Recipes.batchPlan: { ingredients, addon })
   * Returns { sections: [{ key, label, items: [...] }], itemCount }.
   * Each item: { key, name, section, total: {text, note}, lunch: {text}|null, dinner: {text}|null, meals: ['lunch', ...] }
   */
  function build(plans) {
    var groups = [], byId = {}, byName = {};

    function groupFor(id, name, aisle) {
      var norm = normName(name);
      var g = (id && byId[id]) || byName[norm];
      if (!g) {
        g = { key: id ? 'id:' + id : 'name:' + norm, name: name, norm: norm, aisle: aisle, id: id || null,
          total: emptyQty(), lunch: emptyQty(), dinner: emptyQty(), meals: {} };
        groups.push(g);
      }
      if (id && !byId[id]) byId[id] = g;
      if (!byName[norm]) byName[norm] = g;
      if (!g.aisle && aisle) g.aisle = aisle;
      return g;
    }

    ['lunch', 'dinner'].forEach(function (meal) {
      var plan = plans && plans[meal];
      if (!plan) return;
      (plan.ingredients || []).forEach(function (ing) {
        if (SKIP_NAMES.test(normName(ing.name))) return;
        var g = groupFor(ing.id, ing.name, ing.aisle);
        addLine(g.total, ing.amount, ing.unit);
        addLine(g[meal], ing.amount, ing.unit);
        g.meals[meal] = true;
      });
      if (plan.addon) {
        var a = plan.addon;
        var g2 = groupFor(null, a.name, ADDON_AISLE[a.key] || '');
        g2.total.mass += a.grams;
        g2[meal].mass += a.grams;
        g2.meals[meal] = true;
        g2.hasAddon = true;
      }
    });

    var sections = SECTIONS.map(function (s) { return { key: s.key, label: s.label, items: [] }; });
    var sectionMap = {};
    sections.forEach(function (s) { sectionMap[s.key] = s; });

    groups.forEach(function (g) {
      var sec = sectionFor(g.aisle, g.norm);
      var pantry = sec === 'pantry';
      var preferOz = sec === 'canned' || sec === 'sauces' || NO_WEIGHT.test(g.norm);
      var price = Prices.checkoutCost(g.total, g.name, sec);
      var meals = ['lunch', 'dinner'].filter(function (m) { return g.meals[m]; });
      sectionMap[sec].items.push({
        key: g.key,
        name: g.name,
        section: sec,
        meals: meals,
        addon: !!g.hasAddon,
        cost: price.cost,
        packs: price.packs || 0,
        packLabel: price.packLabel || '',
        priceKnown: price.known,
        total: describe(g.total, g.norm, { shopping: true, pantry: pantry, preferOz: preferOz }),
        lunch: g.meals.lunch ? describe(g.lunch, g.norm, { pantry: pantry, preferOz: preferOz }) : null,
        dinner: g.meals.dinner ? describe(g.dinner, g.norm, { pantry: pantry, preferOz: preferOz }) : null
      });
    });
    sections.forEach(function (s) { s.items.sort(function (a, b) { return a.name.localeCompare(b.name); }); });
    var nonEmpty = sections.filter(function (s) { return s.items.length; });
    // Checkout total: everything except pantry staples you probably already have.
    var total = 0, pantryTotal = 0, guessed = 0;
    nonEmpty.forEach(function (s) {
      s.items.forEach(function (it) {
        if (s.key === 'pantry') { pantryTotal += it.cost; return; }
        total += it.cost;
        if (!it.priceKnown) guessed++;
      });
    });
    return { sections: nonEmpty, itemCount: groups.length, total: total, pantryTotal: pantryTotal, guessedCount: guessed };
  }

  /** Plain list of the item keys, to tell whether the list has changed. */
  function signature(plans) {
    return ['lunch', 'dinner'].map(function (m) {
      var p = plans && plans[m];
      return p && p.recipeId ? p.recipeId : '-';
    }).join('|');
  }

  var api = {
    SECTIONS: SECTIONS,
    parseUnit: parseUnit,
    normName: normName,
    gramsPerCup: gramsPerCup,
    sectionFor: sectionFor,
    emptyQty: emptyQty,
    addLine: addLine,
    isEmpty: isEmpty,
    describe: describe,
    formatWeight: formatWeight,
    formatVolume: formatVolume,
    build: build,
    signature: signature
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Grocery = api;
})(this);
