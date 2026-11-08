/*
 * Grocery screen: the combined shopping list for both batches, with ticks
 * that are saved on this phone.
 */
(function () {
  'use strict';

  var G = window.Grocery;
  var R = window.Recipes;
  var App = window.App;
  var screen = document.getElementById('screen-grocery');
  var confirmReset = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function state() { return App.state; }

  function groceryState() {
    var s = state();
    if (!s.grocery || typeof s.grocery !== 'object') s.grocery = { checked: {}, sig: '' };
    if (!s.grocery.checked) s.grocery.checked = {};
    return s.grocery;
  }

  /** Ticks belong to a particular pair of recipes; swapping a recipe starts a fresh list. */
  function planSignature() {
    var p = state().plan || {};
    return [p.lunch && p.lunch.recipe ? p.lunch.recipe.id : '-', p.dinner && p.dinner.recipe ? p.dinner.recipe.id : '-'].join('|');
  }

  function itemHtml(it, checked) {
    var split = '';
    if (it.meals.length === 2) {
      split = '<span class="g-split">Lunch ' + esc(it.lunch.text) + ' · Dinner ' + esc(it.dinner.text) + '</span>';
    } else if (it.meals.length === 1) {
      split = '<span class="g-split"><span class="g-tag g-tag-' + it.meals[0] + '">' + (it.meals[0] === 'lunch' ? 'Lunch' : 'Dinner') + '</span></span>';
    }
    return '<li class="g-item' + (checked ? ' is-checked' : '') + '">' +
      '<label class="g-row">' +
        '<input type="checkbox" class="g-check" data-key="' + esc(it.key) + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="g-box" aria-hidden="true"></span>' +
        '<span class="g-text">' +
          '<span class="g-line"><b class="g-qty">' + esc(it.total.text) + '</b> ' + esc(it.name) +
            (it.addon ? ' <span class="g-tag g-tag-addon">incl. add-on</span>' : '') + '</span>' +
          (it.total.note ? '<span class="g-note">' + esc(it.total.note) + '</span>' : '') +
          split +
        '</span>' +
      '</label></li>';
  }

  function sectionHtml(sec, checkedMap) {
    // Unticked first, ticked sink to the bottom.
    var items = sec.items.slice().sort(function (a, b) {
      return (checkedMap[a.key] ? 1 : 0) - (checkedMap[b.key] ? 1 : 0);
    });
    var left = items.filter(function (it) { return !checkedMap[it.key]; }).length;
    var list = '<ul class="g-list">' + items.map(function (it) { return itemHtml(it, !!checkedMap[it.key]); }).join('') + '</ul>';
    if (sec.key === 'pantry') {
      return '<details class="g-section g-pantry"' + (state().groceryPantryOpen ? ' open' : '') + '>' +
        '<summary><span class="g-sec-title">Pantry staples</span><span class="g-sec-count">' + left + ' to check</span></summary>' +
        '<p class="hint">You probably have these. Check you have enough.</p>' + list + '</details>';
    }
    return '<section class="g-section"><h3 class="g-sec-head"><span class="g-sec-title">' + esc(sec.label) + '</span>' +
      '<span class="g-sec-count">' + (left ? left + ' left' : 'done ✓') + '</span></h3>' + list + '</section>';
  }

  function costHtml(plans) {
    var s = state();
    var total = 0, parts = [];
    ['lunch', 'dinner'].forEach(function (m) {
      var p = plans[m];
      if (!p) return;
      var c = p.evaluation.costPerPortion * s.servings[m];
      total += c;
      parts.push((m === 'lunch' ? 'Lunch ' : 'Dinner ') + R.formatMoney(c));
    });
    var budget = Number(s.budget) || 0;
    var status = '';
    if (budget > 0) {
      status = total > budget
        ? '<p class="g-budget g-over" role="alert">Over your ' + R.formatMoney(budget) + ' budget by <b>' + R.formatMoney(total - budget) + '</b>. Try a cheaper recipe on the Recipes tab.</p>'
        : '<p class="g-budget g-under">Within your ' + R.formatMoney(budget) + ' budget (' + R.formatMoney(budget - total) + ' to spare) ✓</p>';
    }
    return '<div class="g-cost">' +
      '<div class="g-cost-main"><span class="g-cost-label">Estimated cost this week</span><span class="g-cost-num">' + R.formatMoney(total) + '</span></div>' +
      '<p class="g-cost-split">' + parts.join(' · ') + '</p>' + status +
      '<p class="hint">Estimates from Spoonacular; your store\'s prices will vary.</p></div>';
  }

  function render() {
    var s = state();
    var g = groceryState();
    var sig = planSignature();
    if (g.sig !== sig) { g.checked = {}; g.sig = sig; App.persist(); }

    var plans = { lunch: window.RecipesUI.planFor('lunch'), dinner: window.RecipesUI.planFor('dinner') };
    var html = '<div class="rx-head"><h2 class="block-title">Grocery list</h2>';

    if (!plans.lunch && !plans.dinner) {
      screen.innerHTML = html + '</div><div class="search-start"><p>Your list appears here once you pick this week\'s lunch and dinner.</p>' +
        '<button type="button" class="btn btn-primary btn-wide" data-action="go-recipes">Pick recipes</button></div>';
      return;
    }

    var titles = [];
    if (plans.lunch) titles.push('<b>' + s.servings.lunch + ' lunches</b>: ' + esc(s.plan.lunch.recipe.title));
    if (plans.dinner) titles.push('<b>' + s.servings.dinner + ' dinners</b>: ' + esc(s.plan.dinner.recipe.title));
    html += '<p class="hint g-for">Everything for ' + titles.join('<br>') + '</p></div>';

    var missing = !plans.lunch ? 'lunch' : !plans.dinner ? 'dinner' : '';
    if (missing) {
      html += '<p class="notice notice-info">No ' + missing + ' picked yet, so this list only covers ' + (missing === 'lunch' ? 'dinner' : 'lunch') + '. ' +
        '<button type="button" class="btn-inline" data-action="go-recipes">Pick a ' + missing + '</button></p>';
    }

    html += costHtml(plans);

    var list = G.build(plans);
    var shopKeys = [];
    list.sections.forEach(function (sec) { if (sec.key !== 'pantry') sec.items.forEach(function (it) { shopKeys.push(it.key); }); });
    var done = shopKeys.filter(function (k) { return g.checked[k]; }).length;
    html += '<p class="g-progress"><span>' + done + ' of ' + shopKeys.length + ' items in the cart</span>' +
      '<span class="g-bar"><span style="width:' + (shopKeys.length ? done / shopKeys.length * 100 : 0) + '%"></span></span></p>';

    html += list.sections.map(function (sec) { return sectionHtml(sec, g.checked); }).join('');

    if (Object.keys(g.checked).some(function (k) { return g.checked[k]; })) {
      html += '<button type="button" class="btn btn-link btn-wide g-reset" data-action="reset">' +
        (confirmReset ? 'Tap again to untick everything' : 'Untick everything') + '</button>';
    }
    screen.innerHTML = html;
  }

  screen.addEventListener('change', function (e) {
    var box = e.target;
    if (!box.classList || !box.classList.contains('g-check')) return;
    var g = groceryState();
    if (box.checked) g.checked[box.dataset.key] = true; else delete g.checked[box.dataset.key];
    confirmReset = false;
    App.persist();
    render();
  });

  screen.addEventListener('toggle', function (e) {
    if (e.target.classList && e.target.classList.contains('g-pantry')) {
      state().groceryPantryOpen = e.target.open;
      App.persist();
    }
  }, true);

  screen.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    if (el.dataset.action === 'go-recipes') { App.showTab('recipes'); return; }
    if (el.dataset.action === 'reset') {
      if (!confirmReset) { confirmReset = true; render(); return; }
      confirmReset = false;
      groceryState().checked = {};
      App.persist();
      render();
    }
  });

  document.addEventListener('screen:show', function (e) { if (e.detail === 'grocery') { confirmReset = false; render(); } });

  window.GroceryUI = { render: render };
})();
