/*
 * Recipes screen: search, compare options, pick one lunch and one dinner,
 * and see the chosen recipe scaled up for the week's batch.
 */
(function () {
  'use strict';

  var R = window.Recipes;
  var API = window.SpoonacularApi;
  var App = window.App;
  var screen = document.getElementById('screen-recipes');
  var MORE_STEP = 5;
  var MEAL_LABEL = { lunch: 'lunch', dinner: 'dinner' };

  // Things that only matter while the app is open.
  var ui = { meal: 'lunch', changing: { lunch: false, dinner: false }, loading: false, choosing: null, error: '' };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : ''; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function state() { return App.state; }
  function target() { return App.mealTargets().lunch; }   // lunch and dinner targets are identical
  function rankOptions() {
    var s = state();
    return { budget: Number(s.budget) || 0, totalPortions: (s.servings.lunch || 0) + (s.servings.dinner || 0), diet: s.diet };
  }
  function currentKey() { return R.searchKey(state(), target()); }
  function searchIsCurrent() { var s = state().search; return !!(s && s.key === currentKey()); }
  function otherMeal(m) { return m === 'lunch' ? 'dinner' : 'lunch'; }
  function chosenId(m) { var p = state().plan[m]; return p && p.recipe ? p.recipe.id : null; }
  function fmtTarget(t) {
    return Math.round(t.calories) + ' cal · ' + Math.round(t.protein) + 'P · ' + Math.round(t.carbs) + 'C · ' + Math.round(t.fat) + 'F';
  }
  // True when the number is (close to) a whole number or a simple fraction like ½ or ⅓.
  function isNiceAmount(n) { return [4, 3].some(function (d) { return Math.abs(n * d - Math.round(n * d)) < 0.03; }); }
  function fmtServings(f) {
    var a = R.formatAmount(f, '');
    return a + ' recipe serving' + (f > 1.05 ? 's' : '');
  }

  // ---------- pieces ----------
  var MACRO_ROWS = [['calories', 'Calories', ' cal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']];
  function checksList(evaluation) {
    return '<ul class="checks">' + MACRO_ROWS.map(function (row) {
      var c = evaluation.checks[row[0]];
      var mark = c.status === 'good' ? '✓' : c.status === 'close' ? '≈' : (c.rel < 0 ? 'low' : 'high');
      return '<li class="check check-' + c.status + '" aria-label="' + esc(R.formatCheck(row[1], c, row[2])) + '">' +
        '<span class="check-label">' + (row[0] === 'calories' ? '' : '<i class="dot dot-' + row[0].charAt(0) + '"></i>') + row[1] + '</span>' +
        '<span class="check-val"><b>' + Math.round(c.actual) + row[2] + '</b> of ' + Math.round(c.target) + row[2] + '</span>' +
        '<span class="check-mark">' + mark + '</span></li>';
    }).join('') + '</ul>';
  }

  function matchPill(e) {
    var cls = e.matchPct >= 85 ? 'good' : e.matchPct >= 70 ? 'close' : 'off';
    var before = e.tuning && e.baseMatchPct < e.matchPct ? '<s>' + e.baseMatchPct + '%</s> → ' : '';
    return '<span class="match match-' + cls + '" aria-label="' + (before ? 'Was ' + e.baseMatchPct + '%, now ' : '') + e.matchPct + '% match">' +
      before + e.matchPct + '% match</span>';
  }

  function optionCard(e, meal) {
    var r = e.recipe;
    var img = safeUrl(r.image);
    var link = safeUrl(r.sourceUrl);
    var busy = ui.choosing === r.id;
    var meta = [
      '<span class="' + (e.overBudget ? 'over' : '') + '">' + R.formatMoney(e.costPerPortion) + ' per portion' + (e.overBudget ? ' (over budget)' : '') + '</span>',
      '<span>' + fmtServings(e.factor) + ' each</span>'
    ];
    if (r.readyInMinutes) meta.push('<span>' + r.readyInMinutes + ' min</span>');
    return '<article class="rx-card">' +
      (img ? '<img class="rx-img" src="' + esc(img) + '" alt="" loading="lazy">' : '<div class="rx-img rx-img-none"></div>') +
      '<div class="rx-card-body">' +
        '<div class="rx-title-row"><h3 class="rx-title">' + esc(r.title) + '</h3>' +
        matchPill(e) + '</div>' +
        (e.tuning ? '<p class="tuned-note"><b>Adjusted to fit:</b> ' + esc(R.tuningSummary(r, e.tuning)) + '</p>' : '') +
        checksList(e) +
        '<p class="rx-meta">' + meta.join('') + '</p>' +
        '<div class="rx-actions">' +
          '<button type="button" class="btn btn-primary" data-choose="' + r.id + '"' + (ui.choosing ? ' disabled' : '') + '>' +
            (busy ? 'Loading recipe…' : 'Use for ' + MEAL_LABEL[meal]) + '</button>' +
          (link ? '<a class="btn btn-link" href="' + esc(link) + '" target="_blank" rel="noopener">Original recipe ↗</a>' : '') +
        '</div>' +
      '</div></article>';
  }

  function chosenView(meal) {
    var s = state();
    var r = s.plan[meal].recipe;
    var portions = s.servings[meal];
    var plan = R.batchPlan(r, target(), portions, rankOptions());
    var e = plan.evaluation;
    var mult = plan.multiplier;
    var img = safeUrl(r.image);
    var link = safeUrl(r.sourceUrl);

    var ingredients = plan.ingredients.map(function (ing) {
      var amt = R.formatAmount(ing.amount, ing.unit);
      var qty = (amt ? amt + (ing.unit ? ' ' + R.unitLabel(ing.unit, ing.amount) : '') : '');
      return '<li' + (ing.change ? ' class="ing-changed"' : '') + '><span class="ing-qty">' + esc(qty || 'to taste') + '</span>' +
        '<span class="ing-name">' + esc(ing.name) +
          (ing.change ? '<span class="ing-tag">' + esc(ing.change) + '</span>' : '') +
          (ing.original ? '<small>Recipe says: ' + esc(ing.original) + '</small>' : '') +
        '</span></li>';
    }).join('');
    if (plan.addon) {
      ingredients += '<li class="ing-addon"><span class="ing-qty">' + esc(plan.addon.qty) + '</span>' +
        '<span class="ing-name">' + esc(plan.addon.name) +
          '<span class="ing-tag ing-tag-add">Add-on · more ' + (plan.addon.kind === 'carb' ? 'carbs' : plan.addon.kind) + '</span>' +
          '<small>Not in the original recipe. ' + esc(plan.addon.how) + '</small>' +
        '</span></li>';
    }
    var steps = (r.steps || []).map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('');
    var tuned = !!e.tuning;

    return '<article class="chosen">' +
      (img ? '<img class="chosen-img" src="' + esc(img) + '" alt="">' : '') +
      '<p class="eyebrow">This week\'s ' + meal + '</p>' +
      '<h3 class="chosen-title">' + esc(r.title) + '</h3>' +
      (link ? '<a class="ext-link" href="' + esc(link) + '" target="_blank" rel="noopener">Open the original recipe ↗</a>' : '') +

      '<section class="sub"><h4>Each portion</h4>' +
        (tuned ? '<p class="tune-banner"><span>Macro match</span><span><s>' + e.baseMatchPct + '%</s> as written → <b>' + e.matchPct + '%</b> with the changes below</span></p>' : '') +
        '<p class="hint">One portion is about ' + fmtServings(e.factor) + ' of the original recipe' + (tuned ? ', with some ingredients adjusted' : '') + ', sized to hit your calories.</p>' +
        checksList(e) + '</section>' +

      '<section class="sub batch-box">' +
        '<div><span class="batch-num">' + R.formatAmount(mult, '') + '×</span><span>the recipe</span></div>' +
        '<p>Make ' + (isNiceAmount(mult) ? '' : 'about ') + R.formatAmount(mult, '') + ' times the original recipe (it serves ' + r.servings + ') to get <b>' + portions + ' ' + meal + ' portions</b>' +
        (tuned ? ', using the adjusted amounts below' : '') + '. ' +
        'Estimated cost: <b>' + R.formatMoney(e.costPerPortion * portions) + '</b> for the batch (' + R.formatMoney(e.costPerPortion) + ' a portion).</p>' +
      '</section>' +

      '<section class="sub"><h4>Ingredients for ' + portions + ' portions</h4>' +
        (tuned ? '<p class="hint">Use these amounts. Highlighted ones were changed from the recipe to fit your macros.</p>' : '') +
        (ingredients ? '<ul class="ingredients">' + ingredients + '</ul>' : '<p class="hint">This recipe has no ingredient list. Check the original recipe.</p>') +
      '</section>' +

      '<section class="sub"><h4>Instructions</h4>' +
        (steps ? '<p class="hint">These are the original steps. Wherever they mention an amount, use the amounts above instead.</p><ol class="steps">' + steps + '</ol>'
               : '<p class="hint">No steps were included. Follow the original recipe.</p>') +
      '</section>' +

      '<button type="button" class="btn btn-secondary btn-wide" data-action="change">Choose a different ' + meal + '</button>' +
      '</article>';
  }

  function optionsView(meal) {
    var s = state();
    var html = '';
    if (s.plan[meal]) {
      html += '<p class="notice notice-info">You\'re keeping <b>' + esc(s.plan[meal].recipe.title) + '</b> until you pick a new one. ' +
        '<button type="button" class="btn-inline" data-action="cancel-change">Keep it</button></p>';
    }
    if (ui.error) html += '<p class="notice" role="alert">' + esc(ui.error) + '</p>';

    if (!searchIsCurrent()) {
      var changed = !!s.search;
      html += '<div class="search-start">' +
        '<p>' + (changed ? 'Your targets or filters changed since your last search.' :
          'We\'ll find main dishes that fit your targets and filters, then size each portion to your calories.') + '</p>' +
        '<button type="button" class="btn btn-primary btn-wide" data-action="search"' + (ui.loading ? ' disabled' : '') + '>' +
          (ui.loading ? 'Searching recipes…' : (changed ? 'Search again' : 'Find recipes')) + '</button>' +
        '<p class="hint">Each search uses a few of your free daily Spoonacular points.</p></div>';
      return html;
    }

    var ranked = R.rank(s.search.results, target(), rankOptions());
    var shown = (s.search.shown && s.search.shown[meal]) || MORE_STEP;
    var opts = R.optionsFor(meal, ranked, shown, chosenId(otherMeal(meal)));
    if (!opts.length) {
      html += '<p class="notice">No recipes matched. Try removing a filter or excluded ingredient on the Targets screen.</p>';
      return html;
    }
    html += '<p class="hint rx-count">Best matches first' + (s.budget ? ', favoring cheaper recipes' : '') + '.</p>';
    html += '<div class="rx-list">' + opts.map(function (e) { return optionCard(e, meal); }).join('') + '</div>';

    var canFetchMore = s.search.offset < s.search.total;
    var hasMoreLocal = R.optionsFor(meal, ranked, shown + 1, chosenId(otherMeal(meal))).length > opts.length;
    if (hasMoreLocal || canFetchMore) {
      html += '<button type="button" class="btn btn-secondary btn-wide" data-action="more"' + (ui.loading ? ' disabled' : '') + '>' +
        (ui.loading ? 'Finding more…' : 'Show more options') + '</button>';
    } else {
      html += '<p class="hint center">That\'s every recipe that fits. Loosen your filters for more.</p>';
    }
    return html;
  }

  // ---------- whole screen ----------
  function render() {
    var s = state();
    var t = target();
    var html = '<div class="rx-head"><h2 class="block-title">Recipes</h2>' +
      '<p class="hint">Each lunch and dinner portion: <b>' + fmtTarget(t) + '</b></p></div>';

    if (!s.apiKey) {
      html += '<div class="search-start"><p class="notice">To search for recipes, add your free Spoonacular API key first.</p>' +
        '<button type="button" class="btn btn-primary btn-wide" data-action="go-targets">Add my key on the Targets screen</button></div>';
      screen.innerHTML = html;
      return;
    }

    html += '<div class="seg" role="tablist" aria-label="Meal">' + ['lunch', 'dinner'].map(function (m) {
      var picked = !!s.plan[m];
      return '<button type="button" role="tab" class="seg-btn" data-meal="' + m + '" aria-selected="' + (ui.meal === m) + '">' +
        cap(m) + (picked ? ' <span class="seg-done" aria-label="chosen">✓</span>' : '') + '</button>';
    }).join('') + '</div>';

    html += '<div class="rx-body">' + (s.plan[ui.meal] && !ui.changing[ui.meal] ? chosenView(ui.meal) : optionsView(ui.meal)) + '</div>';
    screen.innerHTML = html;
  }

  // ---------- actions ----------
  function fetchPage(offset) {
    var s = state();
    var params = R.searchParams(s, target(), offset);
    return API.searchRecipes(params, s.apiKey).then(function (data) {
      return {
        results: (data.results || []).map(R.compactSearchResult),
        total: Number(data.totalResults) || 0
      };
    });
  }

  function search() {
    ui.loading = true; ui.error = ''; render();
    var key = currentKey();
    fetchPage(0).then(function (page) {
      state().search = { key: key, results: page.results, offset: page.results.length, total: page.total, shown: { lunch: MORE_STEP, dinner: MORE_STEP } };
      App.persist();
    }).catch(function (err) {
      ui.error = err.message;
    }).then(function () { ui.loading = false; render(); });
  }

  function more() {
    var s = state();
    var meal = ui.meal;
    var ranked = R.rank(s.search.results, target(), rankOptions());
    var want = s.search.shown[meal] + MORE_STEP;
    var enough = R.optionsFor(meal, ranked, want, chosenId(otherMeal(meal))).length >= want;
    s.search.shown[meal] = want;
    if (enough || s.search.offset >= s.search.total) { App.persist(); render(); return; }

    ui.loading = true; ui.error = ''; render();
    fetchPage(s.search.offset).then(function (page) {
      var seen = {};
      s.search.results.forEach(function (r) { seen[r.id] = true; });
      page.results.forEach(function (r) { if (!seen[r.id]) s.search.results.push(r); });
      s.search.offset += Math.max(page.results.length, 1);
      s.search.total = page.total;
      App.persist();
    }).catch(function (err) {
      ui.error = err.message;
    }).then(function () { ui.loading = false; render(); });
  }

  function choose(id) {
    var s = state();
    var meal = ui.meal;
    var fromSearch = s.search.results.filter(function (r) { return r.id === id; })[0];
    if (!fromSearch) return;
    ui.choosing = id; ui.error = ''; render();
    API.recipeInfo(id, s.apiKey).then(function (info) {
      s.plan[meal] = { recipe: R.compactRecipeDetail(info, fromSearch), chosenAt: Date.now() };
      ui.changing[meal] = false;
      App.persist();
      window.scrollTo(0, 0);
    }).catch(function (err) {
      ui.error = err.message;
    }).then(function () { ui.choosing = null; render(); });
  }

  screen.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.meal) { ui.meal = el.dataset.meal; ui.error = ''; render(); return; }
    if (el.dataset.choose) { choose(Number(el.dataset.choose)); return; }
    switch (el.dataset.action) {
      case 'search': search(); break;
      case 'more': more(); break;
      case 'change': ui.changing[ui.meal] = true; render(); window.scrollTo(0, 0); break;
      case 'cancel-change': ui.changing[ui.meal] = false; render(); break;
      case 'go-targets': App.showTab('targets'); setTimeout(function () { var k = document.getElementById('in-apikey'); if (k) k.focus(); }, 50); break;
    }
  });

  document.addEventListener('screen:show', function (e) { if (e.detail === 'recipes') render(); });

  window.RecipesUI = { render: render };
})();
