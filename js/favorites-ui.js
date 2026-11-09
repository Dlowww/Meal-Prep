/*
 * Favorites screen: saved recipes, scored against your current targets,
 * ready to use as this week's lunch or dinner without searching.
 */
(function () {
  'use strict';

  var R = window.Recipes;
  var F = window.Favorites;
  var App = window.App;
  var screen = document.getElementById('screen-favorites');
  var ui = { undo: null, flash: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function options() {
    var s = App.state;
    return { budget: Number(s.budget) || 0, totalPortions: (s.servings.lunch || 0) + (s.servings.dinner || 0), diet: s.diet };
  }
  function pickedId(meal) { var p = App.state.plan[meal]; return p && p.recipe ? p.recipe.id : null; }

  function card(fav) {
    var r = fav.recipe;
    var e = R.evaluate(r, App.mealTargets().lunch, options());
    var img = safeUrl(r.image), link = safeUrl(r.sourceUrl);
    var cls = e.matchPct >= 85 ? 'good' : e.matchPct >= 70 ? 'close' : 'off';
    var c = e.checks;
    var status = [];
    var buttons = ['lunch', 'dinner'].map(function (meal) {
      var label = meal === 'lunch' ? 'Lunch' : 'Dinner';
      if (pickedId(meal) === r.id) {
        status.push('This week\'s ' + meal);
        return '<button type="button" class="btn btn-secondary" disabled>✓ ' + label + '</button>';
      }
      return '<button type="button" class="btn btn-primary" data-use="' + meal + '" data-id="' + r.id + '">Use for ' + meal + '</button>';
    }).join('');

    return '<article class="rx-card fav-card">' +
      (img ? '<img class="rx-img fav-img" src="' + esc(img) + '" alt="" loading="lazy">' : '') +
      '<div class="rx-card-body">' +
        '<div class="rx-title-row"><h3 class="rx-title">' + esc(r.title) + '</h3>' + F.heartButton(r.id) + '</div>' +
        (status.length ? '<p class="fav-status">' + esc(status.join(' · ')) + '</p>' : '') +
        '<p class="fav-macros"><span class="match match-' + cls + '">' + e.matchPct + '% match</span>' +
          '<span>' + Math.round(c.protein.actual) + 'P · ' + Math.round(c.carbs.actual) + 'C · ' + Math.round(c.fat.actual) + 'F</span>' +
          '<span>' + R.formatMoney(e.costPerPortion) + ' a portion</span></p>' +
        (e.tuning ? '<p class="tuned-note"><b>Adjusted to fit:</b> ' + esc(R.tuningSummary(r, e.tuning)) + '</p>' : '') +
        '<div class="fav-actions">' + buttons + '</div>' +
        (link ? '<a class="ext-link" href="' + esc(link) + '" target="_blank" rel="noopener">Original recipe ↗</a>' : '') +
      '</div></article>';
  }

  function render() {
    var favs = F.list();
    var html = '<div class="rx-head"><h2 class="block-title">Favorites</h2>' +
      '<p class="hint">Recipes you\'ve saved. Matches are worked out for your current targets.</p></div>';
    if (ui.flash) html += '<p class="notice notice-info" role="status">' + ui.flash + '</p>';
    if (ui.undo) {
      html += '<p class="notice notice-info" role="status">Removed <b>' + esc(ui.undo.recipe.title) + '</b>. ' +
        '<button type="button" class="btn-inline" data-action="undo">Undo</button></p>';
    }
    if (!favs.length) {
      html += '<div class="search-start fav-empty">' +
        '<p>No favorites yet. Tap the <span class="heart-inline" aria-label="heart">♥</span> on any recipe to save it here, then reuse it any week without searching.</p>' +
        '<button type="button" class="btn btn-primary btn-wide" data-action="go-recipes">Browse recipes</button></div>';
    } else {
      html += '<div class="rx-list">' + favs.map(card).join('') + '</div>';
    }
    screen.innerHTML = html;
  }

  screen.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.fav) {
      ui.undo = F.remove(Number(el.dataset.fav));
      ui.flash = '';
      render();
      return;
    }
    if (el.dataset.use) {
      var meal = el.dataset.use, id = Number(el.dataset.id);
      if (F.useFor(id, meal)) {
        ui.undo = null;
        var title = F.find(id).recipe.title;
        ui.flash = '<b>' + esc(title) + '</b> is this week\'s ' + meal + '. ' +
          '<button type="button" class="btn-inline" data-action="view" data-meal="' + meal + '">See the recipe</button>';
        render();
      }
      return;
    }
    switch (el.dataset.action) {
      case 'undo': F.restore(ui.undo); ui.undo = null; render(); break;
      case 'view': ui.flash = ''; window.RecipesUI.showMeal(el.dataset.meal); break;
      case 'go-recipes': App.showTab('recipes'); break;
    }
  });

  document.addEventListener('screen:show', function (e) {
    if (e.detail === 'favorites') { ui.undo = null; ui.flash = ''; render(); }
  });

  window.FavoritesUI = { render: render };
})();
