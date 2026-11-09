/*
 * Built-in grocery prices: typical US supermarket prices (late 2026).
 * Anchored to the U.S. Bureau of Labor Statistics average retail prices where
 * they exist (e.g. boneless chicken breast $4.20/lb, ground beef $6.79/lb,
 * cheddar $6.13/lb, rice $1.12/lb, spaghetti $1.38/lb, eggs $2.27/dozen);
 * the rest are typical shelf prices for common package sizes.
 *
 * Two kinds of item:
 *   lb:    sold by weight (meat, loose produce): cost = pounds × price per lb
 *   pack:  sold in packages (cheese bags, pasta boxes, cans...): you buy whole
 *          packages, so 5 oz of an 8 oz bag still costs a whole bag at checkout
 *
 * Fields: m = name pattern, lb = $/lb  OR  price + packG (grams per package),
 *         eachG = grams in one "1 onion"/"1 egg", unitG = grams per named unit
 *         (e.g. clove), ml = true when the package is measured by volume (ml).
 *
 * Order matters: the first match wins, so specific names come before general
 * ones ("chicken broth" before "chicken", "peanut butter" before "butter").
 */
(function (root) {
  'use strict';

  var U = (typeof module !== 'undefined' && module.exports) ? require('./units.js') : root.Units;
  var LB = 453.592, OZ = 28.3495, FLOZ = 29.5735;

  var P = [
    // ----- pantry: oils, vinegars, spices, baking (priced only for "cost per portion") -----
    { m: /olive oil|avocado oil/, price: 8.99, packG: 500, ml: true },
    { m: /vegetable oil|canola oil|cooking oil|^oil$|coconut oil|sesame oil/, price: 4.99, packG: 1420, ml: true },
    { m: /cooking spray/, price: 3.49, packG: 170 },
    { m: /vinegar/, price: 2.49, packG: 473, ml: true },
    { m: /soy sauce|tamari|fish sauce|worcestershire/, price: 3.29, packG: 296, ml: true },
    { m: /^salt|kosher salt|sea salt/, price: 1.29, packG: 737 },
    { m: /powder|paprika|cumin|oregano|thyme|rosemary|cinnamon|nutmeg|turmeric|seasoning|cayenne|pepper flake|crushed red pepper|black pepper|^pepper$|bay leaf|dried basil|dried parsley|ground clove|allspice|coriander|cardamom/, price: 3.49, packG: 57 },
    { m: /flour/, price: 2.79, packG: 2268 },
    { m: /brown sugar|powdered sugar|^sugar|granulated sugar/, price: 3.99, packG: 1814 },
    { m: /honey/, price: 4.99, packG: 340 },
    { m: /maple syrup/, price: 8.99, packG: 355, ml: true },
    { m: /cornstarch|corn starch/, price: 2.29, packG: 454 },
    { m: /baking soda|baking powder|yeast/, price: 1.99, packG: 227 },
    { m: /vanilla/, price: 7.99, packG: 59, ml: true },

    // ----- liquids, sauces, condiments (specific names before the foods they mention) -----
    { m: /broth|stock|bouillon/, price: 2.79, packG: 946, ml: true },
    { m: /coconut milk|coconut cream/, price: 2.49, packG: 400, ml: true },
    { m: /almond milk|oat milk|soy milk/, price: 3.49, packG: 1893, ml: true },
    { m: /lemon juice/, price: 0.69, packG: 45, ml: true },     // ≈ juice of one lemon
    { m: /lime juice/, price: 0.39, packG: 30, ml: true },      // ≈ juice of one lime
    { m: /orange juice/, price: 3.99, packG: 1540, ml: true },
    { m: /marinara|pasta sauce|spaghetti sauce|pizza sauce/, price: 3.49, packG: 680 },
    { m: /tomato paste/, price: 1.19, packG: 170 },
    { m: /tomato sauce/, price: 1.19, packG: 425 },
    { m: /crushed tomato|diced tomato|stewed tomato|whole tomato|canned tomato|tomatoes with/, price: 1.49, packG: 411 },
    { m: /enchilada sauce/, price: 2.49, packG: 283 },
    { m: /salsa/, price: 3.49, packG: 454 },
    { m: /bbq sauce|barbecue sauce/, price: 2.99, packG: 510 },
    { m: /teriyaki|hoisin|stir fry sauce|oyster sauce/, price: 3.49, packG: 283 },
    { m: /sriracha|hot sauce|chili sauce|chili garlic/, price: 3.49, packG: 255 },
    { m: /pesto/, price: 4.49, packG: 170 },
    { m: /curry paste/, price: 3.99, packG: 113 },
    { m: /mayonnaise|mayo/, price: 5.49, packG: 850 },
    { m: /mustard/, price: 1.99, packG: 340 },
    { m: /ketchup/, price: 2.79, packG: 567 },
    { m: /peanut butter|almond butter/, price: 3.29, packG: 454 },
    { m: /tahini/, price: 6.99, packG: 454 },
    { m: /hummus/, price: 3.99, packG: 283 },
    { m: /dressing/, price: 3.49, packG: 473, ml: true },
    { m: /wine/, price: 9.99, packG: 750, ml: true },

    // ----- compound names that would otherwise match something else -----
    { m: /tortilla/, price: 3.29, packG: 360, eachG: 45 },          // 8-pack
    { m: /pita|naan|flatbread/, price: 3.29, packG: 360, eachG: 60 },
    { m: /egg noodle/, price: 2.49, packG: 340 },
    { m: /rice noodle|ramen|udon|soba|lo mein/, price: 2.99, packG: 397 },
    { m: /egg white/, price: 4.99, packG: 907, ml: true },
    { m: /green bean/, lb: 2.49 },
    { m: /sweet potato|yam/, lb: 1.29, eachG: 130 },
    { m: /bell pepper|red pepper|green pepper|yellow pepper|orange pepper/, price: 1.29, packG: 150, eachG: 150 },
    { m: /jalapeno|serrano|chile pepper|chili pepper/, price: 0.25, packG: 15, eachG: 15 },
    { m: /green onion|scallion|spring onion/, price: 0.99, packG: 100, eachG: 15, unitG: { stalk: 15, bunch: 100 } },
    { m: /cream cheese/, price: 2.99, packG: 227 },
    { m: /sour cream/, price: 2.49, packG: 454 },
    { m: /heavy cream|whipping cream|half and half|half-and-half/, price: 4.29, packG: 473, ml: true },
    { m: /cottage cheese/, price: 3.79, packG: 454 },
    { m: /greek yogurt/, price: 5.49, packG: 907 },
    { m: /yogurt/, price: 3.99, packG: 907 },
    { m: /ground chicken/, lb: 4.99 },
    { m: /ground turkey/, lb: 5.49 },
    { m: /ground pork/, lb: 4.99 },
    { m: /ground beef|hamburger|ground chuck|ground sirloin/, lb: 6.79 },
    { m: /chicken broth|chicken stock/, price: 2.79, packG: 946, ml: true },
    { m: /canned tuna|tuna in water|chunk light/, price: 1.49, packG: 142 },
    { m: /coleslaw/, price: 2.49, packG: 397 },
    { m: /mixed green|spring mix|salad mix/, price: 3.99, packG: 142 },
    { m: /cherry tomato|grape tomato/, price: 3.49, packG: 283 },

    // ----- meat & seafood (by the pound) -----
    { m: /chicken breast|chicken tender/, lb: 4.20, eachG: 225 },
    { m: /chicken thigh/, lb: 3.49, eachG: 115 },
    { m: /chicken drumstick|chicken leg|chicken wing/, lb: 1.99 },
    { m: /rotisserie chicken|cooked chicken|shredded chicken/, price: 7.99, packG: 900 },
    { m: /chicken/, lb: 2.99 },
    { m: /turkey breast|turkey/, lb: 6.99 },
    { m: /sirloin|ribeye|rib eye|new york strip|strip steak|filet|tenderloin steak/, lb: 14.10 },
    { m: /flank|skirt|flat iron/, lb: 12.99 },
    { m: /stew meat|beef stew|chuck|brisket|pot roast|roast beef/, lb: 8.99 },
    { m: /steak/, lb: 12.26 },
    { m: /beef/, lb: 7.88 },
    { m: /bacon/, price: 6.99, packG: 340 },
    { m: /pancetta|prosciutto/, price: 5.99, packG: 113 },
    { m: /sausage|chorizo|kielbasa|bratwurst/, lb: 4.99 },
    { m: /pork tenderloin/, lb: 4.49 },
    { m: /pork chop/, lb: 4.55 },
    { m: /pork shoulder|pork butt|carnitas/, lb: 3.49 },
    { m: /ham/, lb: 5.45 },
    { m: /pork/, lb: 4.49 },
    { m: /lamb/, lb: 11.99 },
    { m: /salmon/, lb: 11.99 },
    { m: /tuna/, lb: 14.99 },
    { m: /cod|halibut|haddock|pollock|mahi|snapper|sea bass/, lb: 10.99 },
    { m: /tilapia|catfish|swai|white fish|whitefish/, lb: 6.99 },
    { m: /shrimp|prawn/, lb: 9.99 },
    { m: /scallop/, lb: 22.99 },
    { m: /crab/, lb: 19.99 },
    { m: /fish/, lb: 9.99 },
    { m: /tofu/, price: 2.49, packG: 397 },
    { m: /tempeh/, price: 3.49, packG: 227 },

    // ----- dairy & eggs -----
    { m: /^egg$|^eggs$|large egg/, price: 2.27, packG: 600, eachG: 50 },   // dozen
    { m: /parmesan|parmigiano|pecorino|romano/, price: 4.99, packG: 142 },
    { m: /feta|goat cheese/, price: 4.29, packG: 170 },
    { m: /ricotta/, price: 3.99, packG: 425 },
    { m: /mozzarella|cheddar|monterey|jack|colby|swiss|provolone|gouda|mexican blend|italian blend|cheese/, price: 3.49, packG: 227 },
    { m: /butter/, price: 4.99, packG: 454 },
    { m: /milk/, price: 2.79, packG: 1893, ml: true },               // half gallon

    // ----- grains, bread, pasta -----
    { m: /jasmine rice|basmati rice/, price: 3.99, packG: 907 },
    { m: /brown rice/, price: 2.79, packG: 907 },
    { m: /rice/, price: 2.49, packG: 907 },
    { m: /quinoa/, price: 4.49, packG: 340 },
    { m: /couscous/, price: 2.99, packG: 283 },
    { m: /gnocchi/, price: 2.99, packG: 454 },
    { m: /spaghetti|penne|macaroni|linguine|fettuccine|rigatoni|fusilli|rotini|orzo|farfalle|bow tie|elbow|ziti|lasagna|angel hair|pasta|noodle/, price: 1.49, packG: 454 },
    { m: /oat/, price: 3.49, packG: 510 },
    { m: /breadcrumb|bread crumb|panko/, price: 2.49, packG: 227 },
    { m: /bun|roll|hoagie/, price: 2.99, packG: 340, eachG: 43 },
    { m: /bread|baguette/, price: 2.49, packG: 567, eachG: 28, unitG: { slice: 28 } },

    // ----- canned & dried beans, corn -----
    { m: /black bean|kidney bean|pinto bean|cannellini|white bean|navy bean|great northern|chickpea|garbanzo|refried bean|bean/, price: 1.19, packG: 380 },
    { m: /lentil/, price: 1.99, packG: 454 },
    { m: /corn/, price: 1.19, packG: 425, eachG: 100, unitG: { ear: 100 } },
    { m: /edamame/, price: 2.99, packG: 340 },
    { m: /\bpeas?\b/, price: 1.99, packG: 340 },

    // ----- produce -----
    { m: /garlic/, price: 0.69, packG: 50, eachG: 5, unitG: { clove: 5, head: 50, bulb: 50 } },
    { m: /red onion/, lb: 1.79, eachG: 150 },
    { m: /shallot/, lb: 4.99, eachG: 40 },
    { m: /leek/, price: 1.49, packG: 90, eachG: 90 },
    { m: /onion/, lb: 1.49, eachG: 150 },
    { m: /potato/, lb: 1.09, eachG: 213 },
    { m: /carrot/, price: 1.29, packG: 454, eachG: 61 },
    { m: /celery/, price: 1.99, packG: 450, eachG: 40, unitG: { stalk: 40, rib: 40 } },
    { m: /broccoli/, lb: 2.49, eachG: 300 },
    { m: /cauliflower/, price: 3.49, packG: 600, eachG: 600, unitG: { head: 600 } },
    { m: /spinach|arugula/, price: 3.49, packG: 142 },
    { m: /kale|collard|chard/, price: 2.29, packG: 250 },
    { m: /romaine|lettuce/, price: 3.99, packG: 600, eachG: 200, unitG: { head: 200 } },
    { m: /cabbage/, lb: 0.89, eachG: 900, unitG: { head: 900 } },
    { m: /mushroom/, price: 2.49, packG: 227 },
    { m: /zucchini|yellow squash|summer squash/, lb: 1.79, eachG: 200 },
    { m: /butternut|acorn squash|spaghetti squash|squash/, lb: 1.49, eachG: 900 },
    { m: /eggplant/, lb: 1.99, eachG: 450 },
    { m: /cucumber/, price: 0.89, packG: 300, eachG: 300 },
    { m: /asparagus/, lb: 3.99 },
    { m: /snap pea|snow pea/, price: 3.49, packG: 227 },
    { m: /tomato/, lb: 1.99, eachG: 150 },
    { m: /avocado/, price: 1.25, packG: 170, eachG: 170 },
    { m: /lemon/, price: 0.69, packG: 100, eachG: 100 },
    { m: /lime/, price: 0.39, packG: 67, eachG: 67 },
    { m: /cilantro|parsley|dill/, price: 0.99, packG: 60, unitG: { bunch: 60, sprig: 2, handful: 15 } },
    { m: /basil|mint|thyme sprig|rosemary sprig/, price: 2.49, packG: 21, unitG: { sprig: 1, leaf: 0.5, bunch: 21, handful: 10 } },
    { m: /ginger/, lb: 3.99, unitG: { piece: 15, inch: 15, knob: 30 } },
    { m: /banana/, lb: 0.66, eachG: 120 },
    { m: /apple/, lb: 1.99, eachG: 180 },
    { m: /blueberr|raspberr|blackberr/, price: 3.99, packG: 170 },
    { m: /strawberr/, price: 3.49, packG: 454 },
    { m: /mango/, price: 1.29, packG: 200, eachG: 200 },
    { m: /pineapple/, price: 2.99, packG: 900, eachG: 900 },
    { m: /orange/, lb: 1.72, eachG: 140 },

    // ----- nuts, seeds, dried fruit -----
    { m: /pine nut/, price: 5.99, packG: 57 },
    { m: /almond|walnut|pecan|pistachio|hazelnut/, price: 4.99, packG: 170 },
    { m: /cashew|peanut|macadamia/, price: 5.49, packG: 227 },
    { m: /sesame seed|chia|flax|sunflower seed|pumpkin seed|pepita/, price: 3.49, packG: 113 },
    { m: /raisin|cranberr|dried fruit|date/, price: 3.49, packG: 170 }
  ];

  // Rough fallbacks by store section, for anything not in the list above.
  var FALLBACK = {
    produce: { lb: 2.49, eachG: 150 }, meat: { lb: 6.99 }, dairy: { price: 3.49, packG: 227 },
    bakery: { price: 2.99, packG: 454 }, grains: { price: 2.29, packG: 454 }, canned: { price: 1.79, packG: 425 },
    sauces: { price: 3.49, packG: 340 }, frozen: { price: 2.99, packG: 340 }, nuts: { price: 5.49, packG: 227 },
    baking: { price: 3.29, packG: 454 }, drinks: { price: 3.99, packG: 1000, ml: true }, other: { price: 3.49, packG: 340 },
    pantry: { price: 3.49, packG: 113 }, any: { price: 3.49, packG: 340 }
  };
  var PACK_UNITS = ['can', 'jar', 'package', 'pkg', 'bag', 'box', 'bottle', 'carton', 'container', 'packet', 'tub', 'pouch', 'block', 'loaf'];
  var SIZE_WORDS = ['', 'large', 'medium', 'small', 'whole', 'each', 'piece', 'serving', 'fillet', 'breast', 'thigh'];

  function lookup(name) {
    var n = U.normName(name);
    for (var i = 0; i < P.length; i++) if (P[i].m.test(n)) return P[i];
    return null;
  }

  /**
   * Grams of an ingredient in a quantity { mass, volume, counts }.
   * Returns { grams, guessed } where guessed means some part had to be estimated.
   */
  function gramsOf(q, name, entry) {
    var norm = U.normName(name);
    var g = q.mass || 0, guessed = false;
    if (q.volume > 0) {
      var gpc = U.gramsPerCup(norm);
      if (entry && entry.ml) g += q.volume;                  // liquids: 1 ml ≈ 1 g
      else if (gpc) g += q.volume / U.VOLUME.cup * gpc;
      else { g += q.volume * 0.6; guessed = true; }            // spices, sauces: a rough average
    }
    Object.keys(q.counts || {}).forEach(function (unit) {
      var n = q.counts[unit];
      if (entry && entry.unitG && entry.unitG[unit]) g += n * entry.unitG[unit];
      else if (PACK_UNITS.indexOf(unit) !== -1 && entry && entry.packG) g += n * entry.packG;
      else if (SIZE_WORDS.indexOf(unit) !== -1 && entry && entry.eachG) g += n * entry.eachG;
      else if (entry && entry.packG) { g += n * entry.packG; guessed = true; }   // assume one package each
      else { g += n * 225; guessed = true; }                                     // ~½ lb each
    });
    return { grams: g, guessed: guessed };
  }

  function lineQty(amount, unit) {
    var q = { mass: 0, volume: 0, counts: {} };
    var a = Number(amount) || 0;
    if (!(a > 0)) return q;
    var u = U.parseUnit(unit);
    if (u.dim === 'mass') q.mass = a * u.factor;
    else if (u.dim === 'volume') q.volume = a * u.factor;
    else q.counts[u.unit] = a;
    return q;
  }

  function perGram(entry) {
    return entry.lb ? entry.lb / LB : entry.price / entry.packG;
  }

  /**
   * What you'd pay at the register for a grocery-list item.
   * q: { mass, volume, counts }; section: store section key (for fallbacks).
   * Returns { cost, packs, packLabel, known } — packs/packLabel only for packaged items.
   */
  function checkoutCost(q, name, section) {
    var entry = lookup(name);
    var known = !!entry;
    if (!entry) entry = FALLBACK[section] || FALLBACK.any;
    var r = gramsOf(q, name, entry);
    if (!(r.grams > 0)) return { cost: 0, known: known };
    if (entry.lb) return { cost: r.grams / LB * entry.lb, known: known && !r.guessed };
    var packs = Math.max(1, Math.ceil(r.grams / entry.packG - 0.08));   // ignore a sliver over (8% of a pack)
    return { cost: packs * entry.price, packs: packs, packLabel: packLabel(entry), known: known && !r.guessed };
  }

  /** "8 oz", "32 fl oz", "dozen" — the size of one package, for display. */
  function packLabel(entry) {
    if (entry.m.test('egg')) return 'dozen';
    if (entry.ml) {
      var floz = entry.packG / FLOZ;
      return floz >= 60 ? (Math.round(floz / 32 * 4) / 4) + ' qt' : Math.round(floz) + ' fl oz';
    }
    var oz = entry.packG / OZ;
    return oz >= 31.5 ? Math.round(oz / 16 * 4) / 4 + ' lb' : Math.round(oz) + ' oz';
  }

  /** Cost of just the amount used (for "cost per portion"), in dollars. */
  function usedCost(amount, unit, name) {
    var entry = lookup(name) || FALLBACK.any;
    var r = gramsOf(lineQty(amount, unit), name, entry);
    return r.grams * perGram(entry);
  }

  var api = { PRICES: P, lookup: lookup, gramsOf: gramsOf, checkoutCost: checkoutCost, usedCost: usedCost, packLabel: packLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Prices = api;
})(this);
