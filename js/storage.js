/*
 * Saves the app's data in this phone's browser (localStorage).
 * Nothing is ever sent anywhere. If storage is unavailable (for example a
 * private window), the app still works; it just won't remember things.
 */
(function (root) {
  'use strict';

  var KEY = 'mealprep.v1';

  function defaults() {
    return {
      version: 1,
      // Example numbers so the screen isn't empty on first open.
      targets: { calories: 2400, protein: 180, carbs: 240, fat: 80 },
      usingExampleTargets: true,
      breakfastPct: 25,
      afterDinnerPct: 25,
      servings: { lunch: 5, dinner: 5 },
      diet: { type: '', intolerances: [], exclude: '' },
      budget: null,
      apiKey: '',
      // Chosen recipes for this week: { recipe } or null.
      plan: { lunch: null, dinner: null },
      // Last recipe search, kept so reopening the app doesn't use up searches.
      search: null,
      // Grocery ticks, kept for the current pair of recipes.
      grocery: { checked: {}, sig: '' },
      groceryPantryOpen: false,
      // Saved recipes: [{ recipe, savedAt }], newest first.
      favorites: []
    };
  }

  // Fill in anything missing from older saves, so new features never crash on old data.
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(saved).forEach(function (k) {
      var b = base[k];
      var s = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) {
        base[k] = merge(b, s);
      } else if (s !== undefined) {
        base[k] = s;
      }
    });
    return base;
  }

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      return merge(defaults(), raw ? JSON.parse(raw) : null);
    } catch (e) {
      return defaults();
    }
  }

  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = { KEY: KEY, defaults: defaults, merge: merge, load: load, save: save };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Store = api;
})(this);
