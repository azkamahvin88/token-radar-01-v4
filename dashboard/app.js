// Launch Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Views: launch board (pre-token, by launch rank), all 758 by board
// rank, live comps. Sortable columns, category / chain / TVL / search filters,
// and a detail view per protocol with its fitted value and costed farm plan.
// Hash routing for deep links: #detail:<slug>, #filtered:<category>.

(function () {
  var data = window.RADAR;
  if (!data) return;
  var rows = data.rows;

  var state = { view: 'launch', sort: 'rank', dir: 1, category: '', chain: '', minTvl: 0, search: '' };

  function $(id) { return document.getElementById(id); }
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'k';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    var cls = n >= 0 ? 'pos' : 'neg';
    return '<span class="' + cls + '">' + (n >= 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Populate filter selects from the data itself.
  var cats = {};
  var chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-category').appendChild(o);
  });
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('f-chain').appendChild(o);
  });

  function visible() {
    var list = rows.filter(function (r) {
      if (state.view === 'launch' && r.status !== 'pre-token') return false;
      if (state.view === 'live' && r.status !== 'live') return false;
      if (state.view === 'excluded' && r.status !== 'excluded') return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.search) {
        var q = state.search.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.view === 'launch' && state.sort === 'rank' ? 'launch_rank' : state.sort;
    list.sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * state.dir;
      return (av - bv) * state.dir;
    });
    return list;
  }

  function render() {
    var list = visible();
    var show = list.slice(0, 100);
    var html = show.map(function (r) {
      var rankCell = state.view === 'launch' ? (r.launch_rank || r.rank) : r.rank;
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + rankCell + '</td>' +
        '<td><b>' + esc(r.name) + '</b> <span class="tag ' + (r.status === 'pre-token' ? 'pre' : r.status === 'live' ? 'live' : 'excl') + '">' +
        (r.status === 'pre-token' ? 'PRE-TOKEN' : r.status === 'live' ? 'LIVE' : 'NOT A LAUNCH') + '</span><br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + fmtUsd(r.farm_cost_usd) + '</td></tr>';
    }).join('');
    $('rows').innerHTML = html;
    $('count').textContent = 'Showing ' + show.length + ' of ' + list.length + ' matching rows · ' +
      data.meta.protocols + ' protocols in the snapshot · board rank is by implied value, launch rank within pre-token only.';
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function openDetail(slug, viaLink) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.classList.toggle('sel', tr.getAttribute('data-slug') === slug);
    });
    $('detail').hidden = false;
    if (viaLink) document.body.classList.add('focus-detail');
    window.scrollTo(0, 0);
    $('d-name').textContent = r.name + (r.status === 'pre-token' ? ' — launch candidate #' + r.launch_rank : r.status === 'excluded' ? ' — not a launch' : ' — token already trades');
    $('d-meta').textContent = (r.category || 'Uncategorised') + ' · ' + r.chains.join(', ') + ' · TVL ' + fmtUsd(r.tvl_usd) +
      ' · 7d ' + (r.change_7d === null ? 'n/a' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      ' · listed ' + (r.listed_at || 'unknown') + ' · board rank ' + r.rank + ' of ' + rows.length;
    $('d-value').textContent = fmtUsd(r.implied_value_usd);
    $('d-math').textContent = r.status === 'pre-token'
      ? 'Fitted launch value from the comps curve (log TVL ' + Math.log10(r.tvl_usd).toFixed(2) + '). Live-token protocols are ranked by market cap instead.'
      : r.status === 'excluded'
      ? 'Fitted value ' + fmtUsd(r.fitted_value_usd) + ' shown only as a comp — this protocol is a wrapped, staked, bridged or exchange product of a token that already trades, so there is no launch to farm.'
      : 'Market cap the token already carries' + (r.mcap_usd ? ' (' + fmtUsd(r.mcap_usd) + ')' : '') + '; fitted value ' + fmtUsd(r.fitted_value_usd) + ' shown as the comp.';
    $('d-cost').textContent = fmtUsd(r.farm_cost_usd);
    $('d-weeks').textContent = r.status === 'excluded'
      ? 'No farm to price: the plan is a verdict plus one optional check.'
      : 'Estimated total gas, fees and position costs over ' + r.farm_weeks + ' weeks. Position size follows the TVL band.';
    $('d-steps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('d-status').textContent = r.note
      ? 'Verified note: ' + r.note + '. The snapshot records no token for this entry, but the record is wrong.'
      : r.status === 'pre-token'
      ? 'Status: records no token in the snapshot. That is DefiLlama\'s record, not proof — verify before farming.'
      : r.status === 'excluded'
      ? 'Status: records no token, but excluded from the launch board — wrapped, staked, bridged, exchange or versioned product. Nothing to farm here.'
      : 'Status: token already trades, so there is no launch to farm. This plan positions instead.';
    if (!viaLink) window.scrollTo(0, document.getElementById('detail').offsetTop);
  }

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      state.view = tab.getAttribute('data-view');
      state.sort = 'rank';
      state.dir = 1;
      render();
    });
  });
  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      render();
    });
  });
  $('f-category').addEventListener('change', function (e) { state.category = e.target.value; render(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  $('f-tvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); render(); });
  $('f-search').addEventListener('input', function (e) { state.search = e.target.value; render(); });
  $('detail-close').addEventListener('click', function () { $('detail').hidden = true; document.body.classList.remove('focus-detail'); });

  // Hash routing: #detail:<slug> and #filtered:<category> for screenshots and links.
  // Render first so the page has its full height before any scrollIntoView.
  render();
  var hash = window.location.hash || '';
  if (hash.indexOf('#detail:') === 0) {
    openDetail(decodeURIComponent(hash.slice(8)), true);
  } else if (hash.indexOf('#filtered:') === 0) {
    var cat = decodeURIComponent(hash.slice(10));
    state.category = cat;
    $('f-category').value = cat;
    render();
  }
})();
