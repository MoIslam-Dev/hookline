/**
 * HookLine dashboard.
 * Plain ES modules + DOM, no build step and no runtime dependencies.
 */

/* ------------------------------------------------------------------ helpers */

const $ = (id) => document.getElementById(id);

const h = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'value' && 'value' in node) node.value = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
};

const storage = {
  get(key, fallback = null) {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* private mode */
    }
  },
};

async function copyText(text, label = 'Copied to clipboard') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = h('textarea', { style: 'position:fixed;opacity:0' });
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(label, 'success');
  } catch {
    toast('Could not copy — select the text manually.', 'error');
  }
}

function toast(message, kind = 'info') {
  const node = h('div', { class: `toast toast--${kind}`, text: message });
  $('toasts').append(node);
  setTimeout(() => node.remove(), 4200);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(epochMs) {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelative(epochMs) {
  if (!epochMs) return 'never';
  const seconds = Math.round((Date.now() - epochMs) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function statusClass(status) {
  if (status >= 500) return 'status-5xx';
  if (status >= 400) return 'status-4xx';
  if (status >= 300) return 'status-3xx';
  return 'status-2xx';
}

function methodBadge(method) {
  const known = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  const key = String(method).toLowerCase();
  return h('span', {
    class: `badge badge--${known.includes(key) ? key : 'other'}`,
    text: method,
  });
}

/* --------------------------------------------------------------------- api */

const state = {
  token: null,
  session: null,
  bins: [],
  binId: null,
  bin: null,
  requests: [],
  hasMore: false,
  nextBefore: null,
  stats: null,
  detail: null,
  tab: 'body',
  codeLang: 'curl',
  loadingRequests: false,
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-hookline-token': state.token };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.details || payload.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ------------------------------------------------------------------- toasts/modal */

function openModal({ title, submitLabel = 'Save', fields = [], onSubmit, danger = false }) {
  const fieldsHost = clear($('modalFields'));
  $('modalTitle').textContent = title;
  $('modalError').hidden = true;
  const submit = $('modalSubmit');
  submit.textContent = submitLabel;
  submit.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;

  const inputs = new Map();
  for (const field of fields) {
    let control;
    if (field.type === 'checkbox') {
      control = h('input', { type: 'checkbox', id: `f-${field.name}` });
      control.checked = Boolean(field.value);
    } else if (field.type === 'select') {
      control = h(
        'select',
        { id: `f-${field.name}` },
        field.options.map((option) =>
          h('option', { value: option.value, text: option.label, selected: option.value === field.value }),
        ),
      );
    } else if (field.type === 'textarea') {
      control = h('textarea', { id: `f-${field.name}`, rows: 4, spellcheck: 'false' });
      control.value = field.value ?? '';
    } else {
      control = h('input', {
        type: field.type ?? 'text',
        id: `f-${field.name}`,
        placeholder: field.placeholder ?? '',
        value: field.value ?? '',
        spellcheck: 'false',
      });
    }
    inputs.set(field.name, control);

    const wrapper =
      field.type === 'checkbox'
        ? h('label', { class: 'checkbox-field', for: `f-${field.name}` }, [control, h('span', { text: field.label })])
        : h('label', { class: 'field', for: `f-${field.name}` }, [
            h('span', { class: 'field__label', text: field.label }),
            control,
            field.hint ? h('p', { class: 'hint', text: field.hint }) : null,
          ]);
    fieldsHost.append(wrapper);
  }

  const form = $('modalForm');
  const onFormSubmit = async (event) => {
    event.preventDefault();
    const values = {};
    for (const [name, control] of inputs) {
      values[name] = control.type === 'checkbox' ? control.checked : control.value;
    }
    submit.disabled = true;
    try {
      await onSubmit(values);
      closeModal();
    } catch (error) {
      $('modalError').textContent = error.message;
      $('modalError').hidden = false;
    } finally {
      submit.disabled = false;
    }
  };

  form.onsubmit = onFormSubmit;
  $('modal').hidden = false;
  const first = fieldsHost.querySelector('input, select, textarea');
  if (first) first.focus();
}

function closeModal() {
  $('modal').hidden = true;
  $('modalForm').onsubmit = null;
}

/* --------------------------------------------------------------------- bins */

async function loadBins({ keepSelection = true } = {}) {
  const { bins } = await api('/bins');
  state.bins = bins;
  if (!keepSelection || !bins.some((bin) => bin.id === state.binId)) {
    state.binId = bins[0]?.id ?? null;
  }
  renderBins();
  await renderGlobalStats();
  return bins;
}

function renderBins() {
  const list = clear($('binList'));
  $('binCount').textContent = state.bins.length ? `${state.bins.length}` : '';

  if (state.bins.length === 0) {
    list.append(
      h('li', {}, [
        h('p', {
          class: 'list-empty',
          text: 'No endpoints yet. Create one to get a URL you can send requests to.',
        }),
      ]),
    );
    return;
  }

  for (const bin of state.bins) {
    const button = h(
      'button',
      {
        class: `bin${bin.id === state.binId ? ' is-active' : ''}${bin.isPaused ? ' is-paused' : ''}`,
        type: 'button',
        title: bin.url,
        onclick: () => selectBin(bin.id),
      },
      [
        h('span', { class: 'bin__dot' }),
        h('span', { class: 'bin__body' }, [
          h('span', { class: 'bin__name', text: bin.name }),
          h('span', { class: 'bin__sub', text: `/h/${bin.token}` }),
        ]),
        h('span', { class: 'bin__count', text: String(bin.requestCount) }),
      ],
    );
    list.append(h('li', {}, [button]));
  }
}

async function renderGlobalStats() {
  const host = clear($('globalStats'));
  try {
    const { stats } = await api('/stats');
    const rows = [
      ['Endpoints', String(stats.bins ?? state.bins.length)],
      ['Requests stored', String(stats.total)],
      ['Last 24 hours', String(stats.last24h)],
    ];
    for (const [label, value] of rows) {
      host.append(
        h('div', { class: 'ministat' }, [h('span', { text: label }), h('b', { text: value })]),
      );
    }
  } catch {
    /* non-critical */
  }
}

async function selectBin(id) {
  state.binId = id;
  storage.set('hookline.binId', id);
  state.detail = null;
  state.requests = [];
  closeDrawer();
  renderBins();
  await Promise.all([renderEndpoint(), refreshRequests({ reset: true })]);
}

/* ----------------------------------------------------------------- endpoint */

function currentBin() {
  return state.bins.find((bin) => bin.id === state.binId) ?? null;
}

async function renderEndpoint() {
  const bin = currentBin();
  const hasBin = Boolean(bin);
  $('globalEmpty').hidden = hasBin;
  $('binPanel').hidden = !hasBin;
  if (!hasBin) return;

  state.bin = bin;
  $('binName').textContent = bin.name;
  $('binUrl').textContent = bin.url;
  $('togglePauseBtn').textContent = bin.isPaused ? 'Resume' : 'Pause';
  $('deleteBtn').textContent = 'Delete';

  const meta = clear($('binMeta'));
  meta.append(
    h('span', {
      class: `pill ${bin.isPaused ? 'pill--warn' : 'pill--ok'}`,
      text: bin.isPaused ? 'Paused — returning 503' : 'Receiving',
    }),
  );
  meta.append(h('span', { class: 'pill', text: `Retention ${bin.retentionDays} day${bin.retentionDays === 1 ? '' : 's'}` }));
  meta.append(h('span', { class: 'pill', text: `Created ${formatTime(bin.createdAt)}` }));
  if (bin.secret) {
    const secretPill = h('span', { class: 'pill pill--warn', text: `Secret ${maskSecret(bin.secret)}` });
    secretPill.style.cursor = 'pointer';
    secretPill.title = 'Click to reveal the secret';
    secretPill.addEventListener('click', () => {
      secretPill.textContent = `Secret ${bin.secret}`;
      copyText(bin.secret, 'Secret copied to clipboard');
    });
    meta.append(secretPill);
  }

  const { stats } = await api(`/stats?binId=${encodeURIComponent(bin.id)}`);
  state.stats = stats;
  renderStats(stats);
}

async function refreshStats() {
  const bin = currentBin();
  if (!bin) return;
  try {
    const { stats } = await api(`/stats?binId=${encodeURIComponent(bin.id)}`);
    state.stats = stats;
    renderStats(stats);
  } catch {
    /* non-critical */
  }
}

function maskSecret(secret) {
  return `${secret.slice(0, 8)}…${secret.slice(-4)}`;
}

function renderStats(stats) {
  const host = clear($('stats'));
  const cards = [
    { label: 'Stored requests', value: String(stats.total) },
    { label: 'Last 24 hours', value: String(stats.last24h) },
    { label: 'Error responses', value: String(stats.errors), danger: stats.errors > 0 },
    { label: 'Total payload', value: formatBytes(stats.bytes) },
    { label: 'Avg response time', value: stats.avgMs === null ? '—' : `${stats.avgMs} ms` },
  ];
  for (const card of cards) {
    host.append(
      h('div', { class: 'stat' }, [
        h('div', { class: 'stat__label', text: card.label }),
        h('div', { class: `stat__value${card.danger ? ' is-error' : ''}`, text: card.value }),
      ]),
    );
  }
}

/* ----------------------------------------------------------------- requests */

async function refreshRequests({ reset = false, append = false } = {}) {
  const bin = currentBin();
  if (!bin) return;
  if (state.loadingRequests) return;
  state.loadingRequests = true;

  const params = new URLSearchParams({ limit: '50' });
  const search = $('searchInput').value.trim();
  if (search) params.set('search', search);
  const method = $('methodFilter').value;
  if (method) params.set('method', method);
  const status = $('statusFilter').value;
  if (status) params.set('status', status);
  if (append && state.nextBefore) params.set('before', String(state.nextBefore));

  try {
    const data = await api(`/bins/${encodeURIComponent(bin.id)}/requests?${params}`);
    state.requests = append ? [...state.requests, ...data.requests] : data.requests;
    state.hasMore = data.hasMore;
    state.nextBefore = data.nextBefore;
    renderRequests();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.loadingRequests = false;
  }
  if (reset) await loadBins();
}

function renderRequests() {
  const body = clear($('requestRows'));
  $('requestCount').textContent = state.requests.length ? `${state.requests.length}` : '';
  $('loadMoreBtn').hidden = !state.hasMore;

  if (state.requests.length === 0) {
    $('listHint').textContent = '';
    body.append(
      h('tr', {}, [
        h('td', { colspan: '5' }, [
          h('p', {
            class: 'list-empty',
            html: 'Nothing captured yet. Send something to the endpoint URL — for example:<br /><code>curl -X POST ' +
              `${escapeHtml(currentBin()?.url ?? '')} -H "content-type: application/json" -d '{"ping":true}'</code>`,
          }),
        ]),
      ]),
    );
    return;
  }

  $('listHint').textContent = state.hasMore
    ? 'Showing the most recent requests. Load more for older ones.'
    : `${state.requests.length} request${state.requests.length === 1 ? '' : 's'}.`;

  for (const item of state.requests) {
    const pathCell = h('td', { class: 'col-path' }, [
      h('span', { class: 'path-cell', text: item.path, title: item.url }),
      item.responseNote ? h('span', { class: 'path-note', text: item.responseNote }) : null,
    ]);

    const row = h(
      'tr',
      {
        'data-id': String(item.id),
        class: state.detail?.id === item.id ? 'is-active' : '',
        onclick: () => openDetail(item.id),
      },
      [
        h('td', { class: 'col-time' }, [
          h('span', { text: formatRelative(item.receivedAt) }),
          h('div', { class: 'dim', style: 'font-size:11.5px', text: formatTime(item.receivedAt) }),
        ]),
        h('td', { class: 'col-method' }, [methodBadge(item.method)]),
        pathCell,
        h('td', { class: 'col-status' }, [
          h('span', { class: statusClass(item.responseStatus), text: ` ${item.responseStatus}` }),
          item.responseMs === null ? null : h('div', { class: 'dim', style: 'font-size:11.5px', text: `${item.responseMs} ms` }),
        ]),
        h('td', { class: 'col-size dim', text: formatBytes(item.bodySize) }),
      ],
    );
    body.append(row);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------- drawer */

async function openDetail(id) {
  try {
    const { request } = await api(`/requests/${id}`);
    state.detail = request;
    renderRequests();
    renderDrawer();
    $('drawer').hidden = false;
  } catch (error) {
    toast(error.message, 'error');
  }
}

function closeDrawer() {
  $('drawer').hidden = true;
  state.detail = null;
}

function renderDrawer() {
  const request = state.detail;
  if (!request) return;

  $('drawerEyebrow').textContent = `Request #${request.id} · ${request.binName ?? ''}`;
  $('drawerTitle').textContent = `${request.method} ${request.path}`;

  const meta = clear($('drawerMeta'));
  meta.append(h('span', { class: `pill ${statusClass(request.responseStatus)}`, text: `Response ${request.responseStatus}` }));
  if (request.responseMs !== null) meta.append(h('span', { class: 'pill', text: `${request.responseMs} ms` }));
  meta.append(h('span', { class: 'pill', text: formatTime(request.receivedAt) }));
  meta.append(h('span', { class: 'pill', text: formatBytes(request.body.size) }));
  if (request.contentType) meta.append(h('span', { class: 'pill', text: request.contentType }));
  if (request.remoteAddr) meta.append(h('span', { class: 'pill', text: request.remoteAddr }));
  if (request.replayOf) meta.append(h('span', { class: 'pill pill--warn', text: `replay of #${request.replayOf}` }));
  if (request.responseNote) meta.append(h('span', { class: 'pill pill--warn', text: request.responseNote }));

  for (const tab of document.querySelectorAll('#drawerTabs .tab')) {
    tab.classList.toggle('is-active', tab.dataset.tab === state.tab);
  }
  for (const panel of document.querySelectorAll('.tabpanel')) {
    panel.classList.toggle('is-active', panel.dataset.panel === state.tab);
  }

  renderBodyPanel(request);
  renderKeyValuePanel($('panelHeaders'), request.headers, 'This request carried no headers.');
  renderKeyValuePanel($('panelQuery'), request.query, 'No query string parameters.');
  renderCodePanel(request);
  renderReplayPanel(request);
}

function renderBodyPanel(request) {
  const host = clear($('panelBody'));
  const body = request.body;

  if (body.size === 0) {
    host.append(h('p', { class: 'section-note', text: 'This request has no body.' }));
    return;
  }

  if (body.binary) {
    host.append(
      h('p', { class: 'section-note', text: 'Binary payload — stored as base64 so nothing is corrupted.' }),
    );
    host.append(preBlock(body.text.slice(0, 20000), `${formatBytes(body.size)} of base64 data`));
    return;
  }

  if (body.json !== null) {
    const text = JSON.stringify(body.json, null, 2);
    host.append(
      h('div', { class: 'copy-row' }, [
        h('span', { class: 'muted', text: 'JSON payload' }),
        h('button', { class: 'icon-btn', type: 'button', text: 'Copy', onclick: () => copyText(text) }),
      ]),
    );
    host.append(preBlock(text));
    return;
  }

  if (body.form && Object.keys(body.form).length > 0) {
    const formHost = h('div');
    renderKeyValuePanel(formHost, body.form, null);
    host.append(h('p', { class: 'section-note', text: 'Form-encoded payload' }), formHost);
    return;
  }

  host.append(
    h('div', { class: 'copy-row' }, [
      h('span', { class: 'muted', text: 'Raw payload' }),
      h('button', { class: 'icon-btn', type: 'button', text: 'Copy', onclick: () => copyText(body.text) }),
    ]),
  );
  host.append(preBlock(body.text.length > 60000 ? `${body.text.slice(0, 60000)}\n… truncated` : body.text));
}

function preBlock(text, label) {
  return h('div', {}, [
    label ? h('p', { class: 'section-note', text: label }) : null,
    h('pre', { class: 'code', text }),
  ]);
}

function renderKeyValuePanel(host, object, emptyMessage) {
  clear(host);
  const entries = Object.entries(object ?? {});
  if (entries.length === 0) {
    host.append(h('p', { class: 'section-note', text: emptyMessage ?? 'Nothing here.' }));
    return;
  }
  const table = h(
    'table',
    { class: 'kv' },
    [
      h('tbody', {}, [
        ...entries.map(([key, value]) =>
          h('tr', {}, [
            h('th', { text: key }),
            h('td', { text: Array.isArray(value) ? value.join(', ') : String(value) }),
          ]),
        ),
        h('tr', {}, [
          h('th', { text: 'Copy all' }),
          h('td', {}, [
            h('button', {
              class: 'icon-btn',
              type: 'button',
              text: 'Copy as JSON',
              onclick: () => copyText(JSON.stringify(object, null, 2)),
            }),
          ]),
        ]),
      ]),
    ],
  );
  host.append(table);
}

const CODE_LANGUAGES = [
  ['curl', 'cURL'],
  ['javascript', 'JavaScript'],
  ['python', 'Python'],
  ['node', 'Node.js'],
  ['http', 'HTTP'],
];

function renderCodePanel(request) {
  const host = clear($('panelCode'));
  const snippets = request.snippets ?? {};

  const subtabs = h(
    'div',
    { class: 'subtabs' },
    CODE_LANGUAGES.filter(([id]) => snippets[id]).map(([id, label]) =>
      h('button', {
        class: `subtab${state.codeLang === id ? ' is-active' : ''}`,
        type: 'button',
        text: label,
        onclick: () => {
          state.codeLang = id;
          renderCodePanel(request);
        },
      }),
    ),
  );

  const code = snippets[state.codeLang] ?? '';
  host.append(
    subtabs,
    h('div', { class: 'copy-row' }, [
      h('span', { class: 'muted', text: `Reproduce this request (${CODE_LANGUAGES.find(([id]) => id === state.codeLang)?.[1] ?? ''})` }),
      h('button', { class: 'icon-btn', type: 'button', text: 'Copy', onclick: () => copyText(code) }),
    ]),
    h('pre', { class: 'code', text: code }),
  );
}

function renderReplayPanel(request) {
  const host = clear($('panelReplay'));
  const urlInput = h('input', { type: 'url', id: 'replayUrl', value: request.url, spellcheck: 'false' });
  const methodInput = h(
    'select',
    { id: 'replayMethod' },
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((verb) =>
      h('option', { value: verb, text: verb, selected: verb === request.method }),
    ),
  );
  const bodyInput = h('textarea', {
    id: 'replayBody',
    spellcheck: 'false',
    value: request.body.binary ? '' : request.body.text,
    placeholder: request.body.binary ? 'Binary payloads must be pasted as text to be replayed' : '',
  });
  const result = h('div', { id: 'replayResult' });

  const sendButton = h('button', { class: 'btn btn--primary', type: 'submit', text: 'Send replay' });

  const form = h('form', { class: 'replay-form', onsubmit: onReplaySubmit }, [
    h('div', { class: 'replay-row' }, [h('span', { class: 'field__label', text: 'Target URL' }), urlInput]),
    h('div', { class: 'replay-row' }, [h('span', { class: 'field__label', text: 'Method' }), methodInput]),
    h('div', { class: 'replay-row' }, [
      h('span', { class: 'field__label', text: 'Body' }),
      h('div', {}, [bodyInput, h('p', { class: 'hint', text: 'Edit the payload to test how your code handles changes.' })]),
    ]),
    h('div', { class: 'replay-row' }, [
      h('span', { class: 'field__label', text: '' }),
      h('div', {}, [
        sendButton,
        h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          text: 'Replay to this endpoint',
          onclick: () => {
            urlInput.value = request.url;
            bodyInput.value = request.body.binary ? '' : request.body.text;
          },
        }),
      ]),
    ]),
  ]);

  host.append(
    h('p', {
      class: 'section-note',
      text: 'Replays the stored request to any URL — for example your own http://localhost:3000/webhooks/stripe handler.',
    }),
    form,
    result,
  );

  async function onReplaySubmit(event) {
    event.preventDefault();
    sendButton.disabled = true;
    clear(result).append(h('p', { class: 'muted', text: 'Sending…' }));
    try {
      const payload = await api(`/requests/${request.id}/replay`, {
        method: 'POST',
        body: {
          url: urlInput.value.trim(),
          method: methodInput.value,
          body: bodyInput.value,
        },
      });
      renderReplayResult(result, payload.replay);
      if (payload.replay.capturedAs) {
        toast(`Replay captured as request #${payload.replay.capturedAs}`, 'success');
        await refreshRequests({ reset: true });
      }
    } catch (error) {
      clear(result).append(h('p', { class: 'muted', style: 'color:var(--red)', text: error.message }));
    } finally {
      sendButton.disabled = false;
    }
  }
}

function renderReplayResult(host, replay) {
  clear(host);
  const head = h('div', { class: 'replay-result__head' });
  if (replay.ok) {
    head.append(h('span', { class: `pill ${statusClass(replay.status)}`, text: `HTTP ${replay.status} ${replay.statusText || ''}`.trim() }));
    head.append(h('span', { class: 'pill', text: `${replay.durationMs} ms` }));
  } else {
    head.append(h('span', { class: 'pill pill--danger', text: 'Request failed' }));
    head.append(h('span', { class: 'pill', text: `${replay.durationMs} ms` }));
  }
  head.append(h('button', { class: 'icon-btn', type: 'button', text: 'Copy response', onclick: () => copyText(replay.body ?? replay.error ?? '') }));

  const bodyBlock = replay.ok
    ? h('pre', { class: 'code', text: (replay.body || '(empty response body)').slice(0, 40000) })
    : h('p', { class: 'muted', style: 'color:var(--red)', text: replay.error });

  const headersBlock = replay.ok
    ? h('table', { class: 'kv' }, [
        h(
          'tbody',
          {},
          Object.entries(replay.headers ?? {}).map(([key, value]) =>
            h('tr', {}, [h('th', { text: key }), h('td', { text: String(value) })]),
          ),
        ),
      ])
    : null;

  host.append(h('div', { class: 'replay-result' }, [head, bodyBlock, headersBlock]));
}

/* ------------------------------------------------------------------ actions */

function createBinDialog() {
  openModal({
    title: 'New endpoint',
    submitLabel: 'Create endpoint',
    fields: [
      { name: 'name', label: 'Name', value: 'My webhook', placeholder: 'e.g. Stripe webhooks' },
      {
        name: 'retentionDays',
        label: 'Keep requests for (days)',
        type: 'number',
        value: String(state.session?.defaultRetentionDays ?? 7),
        hint: 'Older requests are deleted automatically.',
      },
      {
        name: 'generateSecret',
        label: 'Require a secret (send it as the x-hookline-secret header)',
        type: 'checkbox',
        value: false,
      },
    ],
    onSubmit: async (values) => {
      const { bin } = await api('/bins', {
        method: 'POST',
        body: {
          name: values.name,
          retentionDays: Number(values.retentionDays) || undefined,
          generateSecret: values.generateSecret,
        },
      });
      await loadBins({ keepSelection: false });
      await selectBin(bin.id);
      toast(`Endpoint “${bin.name}” created`, 'success');
      if (bin.secret) await copyText(bin.secret, 'Secret created and copied');
    },
  });
}

function renameBinDialog() {
  const bin = currentBin();
  if (!bin) return;
  openModal({
    title: 'Rename endpoint',
    submitLabel: 'Save name',
    fields: [
      { name: 'name', label: 'Name', value: bin.name },
      {
        name: 'retentionDays',
        label: 'Keep requests for (days)',
        type: 'number',
        value: String(bin.retentionDays),
      },
    ],
    onSubmit: async (values) => {
      await api(`/bins/${encodeURIComponent(bin.id)}`, {
        method: 'PATCH',
        body: { name: values.name, retentionDays: Number(values.retentionDays) },
      });
      await loadBins();
      await renderEndpoint();
      renderRequests();
      toast('Endpoint updated', 'success');
    },
  });
}

async function togglePause() {
  const bin = currentBin();
  if (!bin) return;
  await api(`/bins/${encodeURIComponent(bin.id)}`, { method: 'PATCH', body: { isPaused: !bin.isPaused } });
  await loadBins();
  await renderEndpoint();
  toast(bin.isPaused ? 'Endpoint resumed' : 'Endpoint paused — it now answers 503', 'success');
}

async function clearBin() {
  const bin = currentBin();
  if (!bin) return;
  openModal({
    title: 'Clear captured requests',
    submitLabel: 'Clear requests',
    fields: [{ name: 'confirm', label: `Delete all ${bin.requestCount} stored request(s) for “${bin.name}”?`, type: 'checkbox', value: false }],
    danger: true,
    onSubmit: async (values) => {
      if (!values.confirm) throw new Error('Tick the box to confirm.');
      const { removed } = await api(`/bins/${encodeURIComponent(bin.id)}/clear`, { method: 'POST' });
      await refreshRequests({ reset: true });
      await renderEndpoint();
      toast(`${removed} request(s) deleted`, 'success');
    },
  });
}

async function deleteBin() {
  const bin = currentBin();
  if (!bin) return;
  openModal({
    title: 'Delete endpoint',
    submitLabel: 'Delete permanently',
    fields: [{ name: 'confirm', label: `Delete “${bin.name}” and its ${bin.requestCount} stored request(s)? This cannot be undone.`, type: 'checkbox', value: false }],
    danger: true,
    onSubmit: async (values) => {
      if (!values.confirm) throw new Error('Tick the box to confirm.');
      await api(`/bins/${encodeURIComponent(bin.id)}`, { method: 'DELETE' });
      await loadBins({ keepSelection: false });
      await selectBin(state.binId);
      toast('Endpoint deleted', 'success');
    },
  });
}

function exportBin() {
  const bin = currentBin();
  if (!bin) return;
  window.open(`/api/bins/${encodeURIComponent(bin.id)}/export?token=${encodeURIComponent(state.token)}`, '_blank', 'noopener');
}

/* --------------------------------------------------------------------- init */

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function bindEvents() {
  $('newBinBtn').addEventListener('click', createBinDialog);
  $('emptyCreateBtn').addEventListener('click', createBinDialog);
  $('renameBtn').addEventListener('click', renameBinDialog);
  $('togglePauseBtn').addEventListener('click', () => togglePause().catch((error) => toast(error.message, 'error')));
  $('clearBtn').addEventListener('click', clearBin);
  $('deleteBtn').addEventListener('click', deleteBin);
  $('exportBtn').addEventListener('click', exportBin);
  $('copyUrlBtn').addEventListener('click', () => copyText(currentBin()?.url ?? '', 'Endpoint URL copied'));
  $('refreshBtn').addEventListener('click', () => refreshRequests({ reset: true }));
  $('loadMoreBtn').addEventListener('click', () => refreshRequests({ append: true }));
  $('closeDrawerBtn').addEventListener('click', closeDrawer);
  $('copyCurlBtn').addEventListener('click', () => copyText(state.detail?.snippets?.curl ?? '', 'cURL command copied'));

  $('searchInput').addEventListener('input', debounce(() => refreshRequests({ reset: true }), 280));
  $('methodFilter').addEventListener('change', () => refreshRequests({ reset: true }));
  $('statusFilter').addEventListener('change', () => refreshRequests({ reset: true }));
  $('autoRefresh').addEventListener('change', (event) => {
    storage.set('hookline.autoRefresh', event.target.checked ? '1' : '0');
    toast(event.target.checked ? 'Auto refresh on' : 'Auto refresh off');
  });

  for (const tab of document.querySelectorAll('#drawerTabs .tab')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      if (state.detail) renderDrawer();
    });
  }

  for (const node of document.querySelectorAll('#modal [data-close]')) {
    node.addEventListener('click', closeModal);
  }

  $('lockBtn').addEventListener('click', () => {
    storage.set('hookline.token', null);
    state.token = null;
    window.location.reload();
  });

  $('unlockForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = $('unlockToken').value.trim();
    const submit = $('unlockSubmit');
    submit.disabled = true;
    $('unlockError').hidden = true;
    state.token = token;
    try {
      state.session = await api('/session');
      storage.set('hookline.token', token);
      await start();
    } catch (error) {
      state.token = null;
      $('unlockError').textContent = error.message;
      $('unlockError').hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('modal').hidden) closeModal();
      else if (!$('drawer').hidden) closeDrawer();
    }
  });
}

async function start() {
  $('unlock').hidden = true;
  $('app').hidden = false;

  state.session = await api('/session');
  $('version').textContent = `v${state.session.version}`;
  $('publicUrl').textContent = state.session.publicUrl;
  $('autoRefresh').checked = storage.get('hookline.autoRefresh', '1') !== '0';

  const storedBin = storage.get('hookline.binId');
  if (storedBin) state.binId = storedBin;

  await loadBins({ keepSelection: true });
  await renderEndpoint();
  await refreshRequests({ reset: true });

  setInterval(() => {
    if (!state.token || !$('autoRefresh').checked || !$('drawer').hidden) return;
    refreshRequests({ reset: true });
    refreshStats();
  }, 3000);
}

async function init() {
  bindEvents();
  const token = storage.get('hookline.token');
  if (!token) {
    $('unlock').hidden = false;
    $('unlockToken').focus();
    return;
  }
  state.token = token;
  try {
    await start();
  } catch (error) {
    if (error.status === 401) {
      storage.set('hookline.token', null);
      state.token = null;
      $('unlock').hidden = false;
      $('unlockError').textContent = 'The stored token is no longer valid. Paste the current one.';
      $('unlockError').hidden = false;
      return;
    }
    toast(error.message, 'error');
  }
}

init();
