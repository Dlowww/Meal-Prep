/*
 * Favorites: full recipes saved on this phone so they can be reused any week
 * without searching (and without using Spoonacular points).
 * Stored in App.state.favorites as [{ recipe, savedAt }], newest first.
 */
(function () {
  'use strict';

  var App = window.App;

  function list() {
    var s = App.state;
    if (!Array.isArray(s.favorites)) s.favorites = [];
    return s.favorites;
  }
  function find(id) { return list().filter(function (f) { return f.recipe && f.recipe.id === id; })[0] || null; }
  function isFavorite(id) { return !!find(id); }

  /** Saves a full recipe (with ingredients and steps). Newest goes first. */
  function add(recipe) {
    if (!recipe || recipe.id == null || isFavorite(recipe.id)) return;
    list().unshift({ recipe: recipe, savedAt: Date.now() });
    App.persist();
  }

  /** Removes a favorite and returns it (so it can be put back with undo). */
  function remove(id) {
    var l = list();
    for (var i = 0; i < l.length; i++) {
      if (l[i].recipe && l[i].recipe.id === id) {
        var removed = l.splice(i, 1)[0];
        removed.index = i;
        App.persist();
        return removed;
      }
    }
    return null;
  }

  function restore(entry) {
    if (!entry || isFavorite(entry.recipe.id)) return;
    var l = list();
    l.splice(Math.min(entry.index || 0, l.length), 0, { recipe: entry.recipe, savedAt: entry.savedAt });
    App.persist();
  }

  /** Makes a saved recipe this week's lunch or dinner. */
  function useFor(id, meal) {
    var f = find(id);
    if (!f) return false;
    App.state.plan[meal] = { recipe: f.recipe, chosenAt: Date.now() };
    App.persist();
    return true;
  }

  /** The heart button used on recipe cards and pages. */
  function heartButton(id, busy) {
    var on = isFavorite(id);
    return '<button type="button" class="heart' + (on ? ' is-on' : '') + '" data-fav="' + id + '" aria-pressed="' + on + '"' +
      ' aria-label="' + (on ? 'Remove from favorites' : 'Save to favorites') + '"' + (busy ? ' disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/></svg>' +
      '</button>';
  }

  window.Favorites = { list: list, find: find, isFavorite: isFavorite, add: add, remove: remove, restore: restore, useFor: useFor, heartButton: heartButton };
})();
