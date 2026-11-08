/*
 * Screen logic: reads what you type, saves it on this phone, and redraws the meal breakdown.
 */
(function () {
  'use strict';

  var MM = window.MealMath;
  var state = window.Store.load();

  var INTOLERANCES = ['Dairy', 'Egg', 'Gluten', 'Grain', 'Peanut', 'Seafood', 'Sesame', 'Shellfish', 'Soy', 'Sulfite', 'Tree Nut', 'Wheat'];
  var SERVINGS_MIN = 1, SERVINGS_MAX = 21;

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  // ---------- reading/writing nested values like "targets.protein" ----------
  function getPath(path) {
    return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, state);
  }
  function setPath(path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var obj = keys.reduce(function (o, k) { return o[k]; }, state);
    obj[last] = value;
  }

  // ---------- saving ----------
  var saveTimer = null, statusTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ok = window.Store.save(state);
      var el = $('#save-status');
      el.textContent = ok ? 'Saved on this phone' : "Couldn't save. Check that Chrome isn't in Incognito mode.";
      el.style.opacity = 1;
      clearTimeout(statusTimer);
      if (ok) statusTimer = setTimeout(function () { el.style.opacity = 0; }, 1800);
    }, 250);
  }

  // ---------- turning typed text into stored values ----------
  function clampServings(n) {
    n = Math.round(Number(n));
    if (!isFinite(n) || n < SERVINGS_MIN) return SERVINGS_MIN;
    return Math.min(SERVINGS_MAX, n);
  }
  function parseValue(input) {
    var path = input.dataset.path;
    var raw = input.value;
    if (path === 'apiKey') return raw.trim();
    if (input.type === 'text' || input.tagName === 'SELECT') return raw;
    if (raw === '') return null;
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return null;
    if (path === 'breakfastPct') return MM.clampPct(n);
    return n;
  }

  // ---------- drawing ----------
  function macroCell(label, cls, grams) {
    return '<div><dt><i class="dot ' + cls + '"></i>' + label + '</dt><dd>' + grams + 'g</dd></div>';
  }
  function mealCard(name, tag, meal, isMain) {
    var r = MM.roundMeal(meal);
    return '<li class="meal' + (isMain ? ' meal-main' : '') + '">' +
      '<div class="meal-head"><h3 class="meal-name">' + name + '</h3><span class="meal-tag">' + tag + '</span></div>' +
      '<div class="meal-cal">' + r.calories + '<small>cal</small></div>' +
      '<dl class="meal-macros">' +
        macroCell('Protein', 'dot-p', r.protein) +
        macroCell('Carbs', 'dot-c', r.carbs) +
        macroCell('Fat', 'dot-f', r.fat) +
      '</dl></li>';
  }

  function renderBreakdown() {
    var pct = MM.clampPct(state.breakfastPct);
    var split = MM.splitTargets(state.targets, pct);
    var mainPct = (100 - pct) / 2;
    var fmtPct = function (p) { return (Math.round(p * 10) / 10) + '%'; };

    $('#out-breakfast').textContent = pct + '%';
    $('#in-breakfast').style.setProperty('--fill', (pct / MM.MAX_BREAKFAST_PCT * 100) + '%');

    $('#meal-cards').innerHTML =
      mealCard('Breakfast', 'Eat fresh · ' + fmtPct(pct), split.breakfast, false) +
      mealCard('Lunch', 'Batch cook · ' + fmtPct(mainPct), split.lunch, true) +
      mealCard('Dinner', 'Batch cook · ' + fmtPct(mainPct), split.dinner, true);
    $('#breakdown-line').textContent = MM.formatBreakdown(split);

    var mismatch = MM.macroCalorieMismatch(state.targets);
    var check = $('#macro-check');
    if (mismatch) {
      check.hidden = false;
      check.textContent = 'Heads up: your protein, carbs and fat add up to ' + mismatch.fromMacros +
        ' cal, which is ' + Math.abs(mismatch.difference) + ' ' + (mismatch.difference > 0 ? 'more' : 'less') +
        ' than your calorie target. That\'s OK, but recipe portions are sized to your calorie target.';
    } else {
      check.hidden = true;
    }
    $('#example-note').hidden = !state.usingExampleTargets;
  }

  function renderChips() {
    var chosen = state.diet.intolerances || [];
    $('#intolerance-chips').innerHTML = INTOLERANCES.map(function (name, i) {
      var id = 'tol-' + i;
      return '<label class="chip" for="' + id + '"><input type="checkbox" id="' + id + '" value="' + name + '"' +
        (chosen.indexOf(name) !== -1 ? ' checked' : '') + '><span>' + name + '</span></label>';
    }).join('');
  }

  function fillInputs() {
    $$('[data-path]').forEach(function (input) {
      var v = getPath(input.dataset.path);
      input.value = v == null ? '' : v;
    });
  }

  // ---------- events ----------
  function onInput(e) {
    var input = e.target;
    if (!input.dataset || !input.dataset.path) return;
    var path = input.dataset.path;
    var value = parseValue(input);
    if (path.indexOf('servings.') === 0) {
      if (value == null) return;       // let them finish typing; fixed up on blur
      value = clampServings(value);
    }
    if (path.indexOf('targets.') === 0) state.usingExampleTargets = false;
    setPath(path, value);
    renderBreakdown();
    persist();
  }

  function onChange(e) {
    var input = e.target;
    // Tidy up number boxes once you leave them.
    if (input.dataset && input.dataset.path && input.dataset.path.indexOf('servings.') === 0) {
      var v = clampServings(input.value === '' ? getPath(input.dataset.path) : input.value);
      setPath(input.dataset.path, v);
      input.value = v;
      persist();
    }
    if (input.closest && input.closest('#intolerance-chips')) {
      state.diet.intolerances = $$('#intolerance-chips input:checked').map(function (c) { return c.value; });
      persist();
    }
  }

  function onStep(e) {
    var btn = e.target.closest('[data-step]');
    if (!btn) return;
    var path = btn.dataset.step;
    var v = clampServings((getPath(path) || 0) + Number(btn.dataset.delta));
    setPath(path, v);
    $('[data-path="' + path + '"]').value = v;
    persist();
  }

  function showTab(name) {
    $$('.tab').forEach(function (t) {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    $$('.screen').forEach(function (s) { s.hidden = s.dataset.screen !== name; });
    window.scrollTo(0, 0);
  }

  function init() {
    renderChips();
    fillInputs();
    renderBreakdown();

    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('click', onStep);
    $('.tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) showTab(tab.dataset.tab);
    });
    $('#toggle-key').addEventListener('click', function () {
      var input = $('#in-apikey');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show';
      this.setAttribute('aria-pressed', String(show));
    });
  }

  init();
})();
