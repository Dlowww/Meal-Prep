/*
 * Talks to Spoonacular. Your API key comes from this phone's saved settings
 * and is sent only to api.spoonacular.com.
 */
(function (root) {
  'use strict';

  var BASE = 'https://api.spoonacular.com';

  function friendlyError(status) {
    if (status === 401) return "Spoonacular didn't accept your API key. Check it on the Targets screen (no spaces, the whole code).";
    if (status === 402) return "You've used up today's free Spoonacular searches. The allowance resets each day, so try again tomorrow. Recipes you've already found and picked still work.";
    if (status === 429) return 'Too many searches at once. Wait a minute and try again.';
    if (status >= 500) return 'Spoonacular is having trouble right now. Try again in a few minutes.';
    return 'Something went wrong talking to Spoonacular (error ' + status + '). Try again.';
  }

  function get(path, params, apiKey) {
    if (!apiKey) return Promise.reject(new Error('Add your Spoonacular API key on the Targets screen first.'));
    var qs = new URLSearchParams(params || {});
    qs.set('apiKey', apiKey);
    return fetch(BASE + path + '?' + qs.toString())
      .catch(function () {
        throw new Error("Couldn't reach Spoonacular. Check that your phone is online and try again.");
      })
      .then(function (res) {
        if (!res.ok) throw new Error(friendlyError(res.status));
        return res.json();
      });
  }

  var api = {
    searchRecipes: function (params, apiKey) { return get('/recipes/complexSearch', params, apiKey); },
    recipeInfo: function (id, apiKey) { return get('/recipes/' + encodeURIComponent(id) + '/information', { includeNutrition: 'false' }, apiKey); },
    friendlyError: friendlyError
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpoonacularApi = api;
})(this);
