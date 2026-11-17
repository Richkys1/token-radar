// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail drawer with the model's own inputs, the live comparables
// behind each category multiple, and a model sandbox that re-ranks the board
// live. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: false, growthWeight: DATA.model.growth_weight, maturityFloor: DATA.model.maturity_floor };

  // Two rows a reader wants to hold next to each other, by slug, oldest first.
  var pickedForCompare = [];

  function csvSafe(value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (text.indexOf(',') < 0 && text.indexOf('"') < 0 && text.indexOf('\n') < 0) return text;
    return '"' + text.split('"').join('""') + '"';
  }

  function boardCsvText() {
    var head = ['rank', 'slug', 'name', 'category', 'chains', 'tvl_usd', 'implied_value_usd', 'category_multiple', 'multiple_source', 'growth_multiplier', 'maturity_multiplier', 'breadth_multiplier', 'watchlist'];
    var lines = [head.join(',')];
    DATA.rows.slice().sort(function (a, b) { return a.rank - b.rank; }).forEach(function (r) {
      lines.push([
        r.rank,
        csvSafe(r.slug),
        csvSafe(r.name),
        csvSafe(r.category || 'Other'),
        csvSafe((r.chains || []).join('; ')),
        r.tvl_usd,
        r.implied_value_usd,
        r.category_multiple,
        csvSafe(r.multiple_source),
        r.growth_multiplier,
        r.maturity_multiplier,
        r.breadth_multiplier,
        isWatchlist(r) ? 'yes' : 'no'
      ].join(','));
    });
    return lines.join('\n') + '\n';
  }

  function saveBoardCsv() {
    var blob = new Blob([boardCsvText()], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'token-radar-board.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // A header click walks its column up, then down, then hands the board back
  // to rank order, so the reader can always find the published ranking again.
  function cycleSort(key) {
    if (state.sort !== key) {
      state.sort = key;
      state.dir = 1;
    } else if (state.dir === 1) {
      state.dir = -1;
    } else if (key === 'implied') {
      state.dir = 1;
    } else {
      state.sort = 'implied';
      state.dir = -1;
    }
    render(); // the board redraws from the new order
  }

  function compareRow(slug) {
    var found = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) found = r; });
    return found;
  }

  function toggleCompare(slug, want) {
    var at = pickedForCompare.indexOf(slug);
    if (want && at < 0) {
      pickedForCompare.push(slug);
      if (pickedForCompare.length > 2) pickedForCompare.shift();
    } else if (!want && at >= 0) {
      pickedForCompare.splice(at, 1);
    }
    render(); // the tick and the panel stay in step
  }

  function compareTick(slug) {
    var box = el('input', {
      type: 'checkbox',
      'aria-label': 'Compare ' + slug,
      checked: pickedForCompare.indexOf(slug) >= 0 ? 'checked' : null,
      onclick: function (e) { e.stopPropagation(); },
      onkeydown: function (e) { e.stopPropagation(); },
      onchange: function (e) { toggleCompare(slug, e.target.checked); }
    });
    return box;
  }

  function compareFigure(label, value) {
    return el('div', { class: 'compare-figure' }, el('span', { text: label }), el('b', { class: 'num', text: value }));
  }

  function multipleNote(r) {
    if (r.multiple_source === 'category') return 'median of ' + r.comps_used + ' live ' + (r.category || 'Other') + ' protocols, shrunk toward the global median';
    return 'global median across ' + DATA.live_total + ' live protocols';
  }

  // The same three risk signals the farm plan's second step warns about,
  // shown at a glance on the board row: a steep seven-day fall, a protocol
  // younger than 90 days, or a single-chain deployment.
  function riskFlags(r) {
    var flags = [];
    if (r.change_7d !== null && r.change_7d !== undefined && r.change_7d <= -20) flags.push(['falling', 'TVL fell ' + Math.round(-r.change_7d) + '% in 7 days']);
    if (r.age_days !== null && r.age_days !== undefined && r.age_days < 90) flags.push(['new', 'listed less than 90 days ago']);
    if (!r.chains || r.chains.length <= 1) flags.push(['1 chain', 'deployed on a single chain']);
    return flags;
  }

  function compareCard(slug) {
    var r = compareRow(slug);
    if (!r) return el('div', { class: 'compare-card' }, el('p', { class: 'sub', text: 'That protocol is not on this board.' }));
    var steps = farmSteps(r);
    return el('div', { class: 'compare-card' },
      el('div', { class: 'compare-head' },
        el('div', null,
          el('span', { class: 'brand-name', text: 'Rank ' + r.rank + (isWatchlist(r) ? ' · watchlist' : ' · early radar') }),
          el('h3', { text: r.name })
        ),
        el('button', { class: 'button', type: 'button', text: 'Remove', onclick: function () { toggleCompare(slug, false); } })
      ),
      el('div', { class: 'compare-figures' },
        compareFigure('Implied value', fmtUsd(r.implied_value_usd)),
        compareFigure('TVL', fmtUsd(r.tvl_usd)),
        compareFigure('Category multiple', fmtMult(r.category_multiple)),
        compareFigure('Multiple source', multipleNote(r)),
        compareFigure('Growth multiplier', String(r.growth_multiplier)),
        compareFigure('Maturity multiplier', String(r.maturity_multiplier)),
        compareFigure('Breadth multiplier', String(r.breadth_multiplier)),
        compareFigure('Age with no token', fmtAge(r.age_days))
      ),
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) { return el('li', { text: s }); }))
    );
  }

  function comparePanel() {
    var picked = pickedForCompare.map(compareRow).filter(function (r) { return !!r; });
    if (picked.length === 0) {
      return el('section', { class: 'panel compare-empty' },
        el('h2', { text: 'Compare two protocols' }),
        el('p', { class: 'sub', text: 'Tick the box at the start of any two board rows and they appear here side by side, with their model figures and farm plans, so you can judge which one deserves the capital first.' })
      );
    }
    var cards = picked.map(function (r) { return compareCard(r.slug); });
    if (picked.length === 1) cards.push(el('div', { class: 'compare-card compare-waiting' }, el('p', { class: 'sub', text: 'One more tick fills this side: pick a second row from the board to set it against ' + picked[0].name + '.' })));
    return el('section', { class: 'panel compare-panel' },
      el('div', { class: 'compare-title' },
        el('h2', { text: picked.length === 2 ? 'Side by side: ' + picked[0].name + ' vs ' + picked[1].name : 'Side by side' }),
        el('button', { class: 'button', type: 'button', text: 'Clear compare', onclick: function () { pickedForCompare = []; render(); } })
      ),
      el('div', { class: 'compare-grid' }, cards)
    );
  }

  function toolStrip() {
    var chosen = pickedForCompare.length;
    var hint = chosen === 0 ? 'No protocols picked to compare yet.' : chosen === 1 ? 'One protocol picked: tick a second row to compare.' : 'Two protocols picked: see them side by side below the board.';
    return el('div', { class: 'toolstrip' },
      el('button', { class: 'button primary', type: 'button', text: 'Download board as CSV', onclick: function () { saveBoardCsv(); } }),
      el('span', { class: 'sub', text: 'Every row, in rank order, with its model figures.' }),
      el('span', { class: 'compare-count', text: hint })
    );
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. The sandbox overrides
  // two constants; the published board always uses the model's own values.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }
  function sandboxModel() {
    var m = {};
    for (var k in DATA.model) m[k] = DATA.model[k];
    m.growth_weight = state.growthWeight;
    m.maturity_floor = state.maturityFloor;
    return m;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote once with the position.';
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to the ' + name + ' chain and use it in one app there.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function riskStep(p) {
    var growth = p.change_7d === null || p.change_7d === undefined ? 0 : p.change_7d;
    if (growth <= -20) {
      return { text: 'TVL fell ' + Math.round(-growth) + '% in the last week — read the protocol\'s own announcements and check for an exploit or an ended incentive before you add more capital.', cost: 'nothing to check', time: '10 minutes' };
    }
    if (p.age_days !== null && p.age_days !== undefined && p.age_days < 90) {
      return { text: 'The protocol is less than 90 days old — start with half the position above, confirm the contracts are the ones its own page links to, and scale up only after a month.', cost: 'half the capital above', time: '15 minutes' };
    }
    if (!p.chains || p.chains.length <= 1) {
      return { text: 'The protocol runs on one chain (' + chainOf(p) + ') — keep a small balance there for gas and for the exit transaction, so a withdrawal never strands the position.', cost: 'about $5 of the chain asset', time: '5 minutes' };
    }
    return { text: 'Set a reminder for the next weekly action and the next snapshot, so the position stays active across snapshots.', cost: 'nothing but the reminder', time: '5 minutes' };
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      riskStep(p),
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function isWatchlist(r) { return !!r.watchlist; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function shownValue(r) { return state.sandbox ? impliedOf(r, sandboxModel()) : r.implied_value_usd; }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.category_multiple; bv = b.category_multiple; }
      else { av = shownValue(a); bv = shownValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, each passing the same exclusion test as the watchlist. Implied value is a model, not a promise — and never a prediction that a token will launch.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.total_implied_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var wl = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('label', { class: 'check', for: 'wl' }, wl, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { cycleSort(key); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { max = Math.max(max, shownValue(r)); });
    max = max || 1;
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var rankLabel = state.sandbox ? String(i + 1) : String(r.rank);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'compare-cell' }, compareTick(r.slug)),
        el('td', { class: 'num', text: rankLabel }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (isWatchlist(r) ? ' · watchlist' : '') }),
          riskFlags(r).length ? el('div', { class: 'flags' }, riskFlags(r).map(function (f) { return el('span', { class: 'flag ' + (f[0] === 'falling' ? 'flag-warn' : f[0] === 'new' ? 'flag-info' : 'flag-dim'), title: f[1], text: f[0] }); })) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.category_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownValue(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownValue(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'records no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: (state.sandbox ? 'Sandbox re-ranking: values recomputed from your sliders, not the published board. ' : 'Pre-token protocols, strongest implied value first. ') + 'Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Compare' }),
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Category multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model — and their market-cap-to-TVL ratios are the calibration behind every category multiple. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var calibRows = DATA.comps.slice(0, 12).map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtMult(c.median_multiple) }),
        el('td', { class: 'num', text: fmtMult(c.raw_median) }),
        el('td', { class: 'sub', text: c.top.map(function (t) { return t.name + ' ' + fmtMult(t.multiple); }).join(', ') })
      );
    });
    var gw = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(state.growthWeight), 'aria-label': 'Growth weight' });
    var gwOut = el('output', { text: String(state.growthWeight.toFixed(2)) });
    gw.addEventListener('input', function () { state.growthWeight = parseFloat(gw.value); gwOut.textContent = state.growthWeight.toFixed(2); state.sandbox = true; render(); });
    var mf = el('input', { type: 'range', min: '0.4', max: '0.8', step: '0.05', value: String(state.maturityFloor), 'aria-label': 'Maturity floor' });
    var mfOut = el('output', { text: String(state.maturityFloor.toFixed(2)) });
    mf.addEventListener('input', function () { state.maturityFloor = parseFloat(mf.value); mfOut.textContent = state.maturityFloor.toFixed(2); state.sandbox = true; render(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Back to the published model', onclick: function () { state.sandbox = false; state.growthWeight = DATA.model.growth_weight; state.maturityFloor = DATA.model.maturity_floor; render(); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'categoryMultiple = clamp( (n x medianCategory + ' + m.shrinkage_k + ' x medianGlobal) / (n + ' + m.shrinkage_k + '), ' + m.multiple_floor + ', ' + m.multiple_cap + ' )'
      ),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x categoryMultiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + min(chains - 1, ' + m.breadth_max_chains + ') x ' + m.breadth_per_chain + ') )'
      ),
      el('p', { class: 'sub', text: 'medianCategory is the median market-cap-to-TVL ratio of the live-token protocols in the same category, winsorized to [' + m.ratio_floor + ', ' + m.ratio_cap + '] so one wild comparable cannot set the price; n is their count, and a category with none takes the global median ' + fmtMult(DATA.global_multiple) + '. The blend is the honest part: a category with one or two comparables still uses what it knows instead of falling back to the global median whole. A lending protocol is not priced like a bridge, because the market does not price them alike. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('h3', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Move a slider and the board re-ranks from the same formula. The published board.json always keeps the model above; the sandbox is for checking how much the ranking depends on each weight.' }),
      el('div', { class: 'sandbox' },
        el('label', null, 'Growth weight', gw, gwOut),
        el('label', null, 'Maturity floor', mf, mfOut),
        el('div', null, reset, state.sandbox ? el('span', { class: 'badge', text: 'sandbox on' }) : null)
      ),
      el('h3', { text: 'Calibration: what the market pays per category' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Multiple used' }), el('th', { scope: 'col', text: 'Raw median' }), el('th', { scope: 'col', text: 'Highest comparables' }))),
          el('tbody', null, calibRows)
        )
      ),
      el('p', { class: 'note', text: 'A protocol is listed as pre-token only because its DefiLlama record carries no token — the record is not proof it has none. Nothing here predicts whether or when a token launches, and no farm step is financial advice.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var comp = null;
    DATA.comps.forEach(function (c) { if (c.category === (row.category || 'Other')) comp = c; });
    var growth = row.change_7d === null ? 0 : Math.min(DATA.model.growth_cap, Math.max(DATA.model.growth_floor, row.change_7d));
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatchlist(row) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    var multipleLabel = row.multiple_source === 'category'
      ? 'Category multiple (' + (row.category || 'Other') + ', ' + row.comps_used + ' live comps, shrunk toward global)'
      : 'Category multiple (' + (row.category || 'Other') + ' · global median, ' + DATA.live_total + ' live protocols)';
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: multipleLabel }), el('b', { class: 'num', text: fmtMult(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth (' + fmtPct(growth) + ')' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token on record' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    if (comp && row.multiple_source === 'category') {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'The category multiple is the median of these protocols, which already trade, shrunk toward the global median — the raw median is shown in the calibration table. Highest multiples first.' }),
        el('div', { class: 'table-wrap' },
          el('table', { class: 'calib' },
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
            el('tbody', null, comp.top.map(function (t) { return el('tr', null, el('td', { text: t.name }), el('td', { class: 'num', text: fmtMult(t.multiple) })); }))
          )
        )
      ));
    } else if (row.multiple_source === 'global') {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Live comparables in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'No live-token protocol in this category carries a market cap, so the multiple is the global median (' + fmtMult(DATA.global_multiple) + ') across all ' + DATA.live_total + ' live-token protocols in the snapshot — not a single comparable on record.' })
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(toolStrip());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(comparePanel());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
