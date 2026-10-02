(function () {
  'use strict';

  var REFRESH_INTERVAL = 5 * 60 * 1000;
  var STORAGE_KEY = 'moat_sheet_id';
  var GVIZ_BASE = 'https://docs.google.com/spreadsheets/d/';

  var DEFAULT_SHEET = '1adMI9FgiVyTK2CJd18Bc0AMou7_lN-6mVF56VqUKkF4';
  var sheetId = localStorage.getItem(STORAGE_KEY) || DEFAULT_SHEET;
  var refreshTimer = null;

  // Cascada financiera rates
  var IVA_RATE = 0.19;
  var CATALINA_RATE = 0.30;
  var TAX_RATE = 0.18;
  var CONTADORAS_MONTHLY = 200;
  var CONTADORAS_START = new Date(2025, 9, 1); // Oct 2025
  var USD_TO_COP = 4200; // fallback
  var trmLoaded = false;

  // Pipeline stage constants
  var STAGES = {
    LEAD: 'Lead', MEETING: '1st Meeting', CLOSING: 'Closing',
    WIN: 'Win', LOST: 'Lost', GAINBACK: 'Gain back', NOWAY: 'NO WAY JOSE'
  };

  // === v2 ROUTING ==============================================
  function currentView() {
    var p = new URLSearchParams(window.location.search);
    var v = p.get('view') || 'feed';
    return (['feed', 'finanzas', 'panel', 'settings'].indexOf(v) !== -1) ? v : 'feed';
  }

  function applyView(view) {
    var feed = document.getElementById('feedMain');
    var finanzas = document.getElementById('subviewFinanzas');
    var panel = document.getElementById('subviewPanel');
    var revStrip = document.getElementById('revenueStrip');
    if (feed) feed.hidden = (view !== 'feed');
    if (revStrip) revStrip.hidden = (view !== 'feed');
    if (finanzas) finanzas.hidden = (view !== 'finanzas');
    if (panel) panel.hidden = (view !== 'panel');
    document.querySelectorAll('.topbar-v2__icon').forEach(function (btn) {
      var active = btn.getAttribute('data-view') === view;
      btn.classList.toggle('topbar-v2__icon--active', active);
    });
    if (typeof lastRenderArgs !== 'undefined' && lastRenderArgs) {
      renderTab('feed', lastRenderArgs);
    }
  }

  function routeTo(view) {
    var url = view === 'feed' ? window.location.pathname : (window.location.pathname + '?view=' + view);
    history.pushState({ view: view }, '', url);
    applyView(view);
  }

  function wireRouting() {
    document.querySelectorAll('.topbar-v2__icon').forEach(function (btn) {
      btn.addEventListener('click', function () { routeTo(btn.getAttribute('data-view')); });
    });
    window.addEventListener('popstate', function () { applyView(currentView()); });
    wireFeedSectionToggles();
    wireDrawer();
    applyView(currentView());
  }
  // === END v2 ROUTING ==========================================
  var ACTIVE_STAGES = [STAGES.LEAD, STAGES.MEETING, STAGES.CLOSING, STAGES.WIN, STAGES.GAINBACK];
  var PIPELINE_ACTIVE = [STAGES.LEAD, STAGES.MEETING, STAGES.CLOSING, STAGES.GAINBACK];

  // Content status constants
  var CONTENT_STATUS = { PUBLISHED: 'Publicado', APPROVED: 'Aprobado', DRAFT: 'Borrador' };

  // Webhook URLs -- POST-only endpoints on Make.com. Accepted risk: visible in client
  // code but only accept POST with specific JSON payloads. Protected by Vercel password.
  var WEBHOOK_URL = 'https://hook.us2.make.com/c3shqln8sci3mpjah3yc7ee0jon6g7vy';
  var IMAGE_UPLOAD_URL = 'https://hook.us2.make.com/s1l7tm8ks682okpff9mwre6q6ns8nluw';
  var INTEL_WEBHOOK_URL = 'https://hook.us2.make.com/rdwqhyu520zv8a8m1iw7vapd2mtooce5';
  var OUTBOUND_GENERATE_URL = 'https://hook.us2.make.com/1usijuqofbwhidx4no9m66tbt7p25ccc';
  var OUTBOUND_SEND_URL = 'https://hook.us2.make.com/s8iaspjhtclvfi199jbtilzzmav3m66o';
  var QUALITY_REVIEW_URL = 'https://hook.us2.make.com/e8xxytekksirbfjoh9xohh6wjk2ernq6';
  var LEAD_TO_PIPELINE_URL = 'https://hook.us2.make.com/nzihpm5wjqulmh4kpk4u6g71s5fmqiuj';

  // Key URLs for outbound emails
  var DISCOVERY_LINK = 'https://calendar.app.google/UgjwZH3X5U8gB3AT9';
  var WEBSITE_URL = 'https://themoatlabs.com';

  // Domain safety: max emails per day from this dashboard (warm only, cold is Instantly)
  var DAILY_SEND_LIMIT = 15;
  var SEND_COUNT_KEY = 'moat_sends_today';
  var SEND_DATE_KEY = 'moat_send_date';

  function getDailySendCount() {
    var today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(SEND_DATE_KEY) !== today) {
      localStorage.setItem(SEND_DATE_KEY, today);
      localStorage.setItem(SEND_COUNT_KEY, '0');
      return 0;
    }
    return parseInt(localStorage.getItem(SEND_COUNT_KEY)) || 0;
  }

  function incrementDailySend() {
    var today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(SEND_DATE_KEY, today);
    var count = getDailySendCount() + 1;
    localStorage.setItem(SEND_COUNT_KEY, String(count));
    return count;
  }

  /** Call the Quality Review Agent to evaluate content before sending.
   *  @param {string} type - 'email' or 'post'
   *  @param {string} subject - subject line (emails) or title (posts)
   *  @param {string} content - the email body or post text
   *  @param {Object} context - { company, contact, industry }
   *  @returns {Promise<Object>} review result with score, verdict, issues, suggestions */
  function reviewContent(type, subject, content, context) {
    return fetch(QUALITY_REVIEW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: type,
        subject: subject || '',
        content: content,
        company: (context && context.company) || '',
        contact: (context && context.contact) || '',
        industry: (context && context.industry) || ''
      })
    })
    .then(function (res) { return res.text(); })
    .then(function (text) {
      try {
        var clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return JSON.parse(clean);
      } catch (e) {
        return { score: 50, verdict: 'revise', spam_risk: 'unknown', personalization: 'unknown', issues: ['Could not parse review response'], suggestions: [] };
      }
    })
    .catch(function () {
      return { score: 0, verdict: 'revise', spam_risk: 'unknown', personalization: 'unknown', issues: ['Review agent unavailable'], suggestions: [] };
    });
  }

  function renderReviewBadge(review) {
    var cls = review.score >= 90 ? 'review-badge--approve' : review.score >= 70 ? 'review-badge--revise' : 'review-badge--reject';
    var icon = review.score >= 90 ? 'check' : review.score >= 70 ? '!' : 'X';
    var badge = el('div', { className: 'review-badge ' + cls });
    badge.appendChild(el('span', { className: 'review-score', textContent: review.score + '/100' }));
    badge.appendChild(el('span', { className: 'review-verdict', textContent: review.verdict }));
    if (review.spam_risk && review.spam_risk !== 'low') {
      badge.appendChild(el('span', { className: 'review-spam review-spam--' + review.spam_risk, textContent: 'Spam risk: ' + review.spam_risk }));
    }
    return badge;
  }

  function renderReviewDetail(review) {
    var wrap = el('div', { className: 'review-detail' });
    if (review.issues && review.issues.length) {
      review.issues.forEach(function (issue) {
        wrap.appendChild(el('div', { className: 'review-issue', textContent: issue }));
      });
    }
    if (review.suggestions && review.suggestions.length) {
      review.suggestions.forEach(function (sug) {
        wrap.appendChild(el('div', { className: 'review-suggestion', textContent: sug }));
      });
    }
    return wrap;
  }

  function uploadImage(base64DataUrl, fileName, cb) {
    var parts = base64DataUrl.split(',');
    var raw = parts.length > 1 ? parts[1] : parts[0];
    fetch(IMAGE_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData: raw, fileName: fileName }),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.url) {
        cb(null, data.url);
      } else {
        cb(new Error('Upload failed'));
      }
    })
    .catch(function (err) { cb(err); });
  }

  function sendToWebhook(payload, cb) {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(function (r) { return r.json(); })
    .then(function (data) { if (cb) cb(null, data); })
    .catch(function (err) { if (cb) cb(err); });
  }

  function fetchExchangeRate(cb) {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.rates && data.rates.COP) {
          USD_TO_COP = Math.round(data.rates.COP);
          trmLoaded = true;
          var badge = document.getElementById('cascadaCurrency');
          if (badge) badge.textContent = 'USD / COP (TRM: $' + USD_TO_COP.toLocaleString() + ')';
        }
        if (cb) cb();
      })
      .catch(function () { if (cb) cb(); });
  }

  // DOM refs
  var configPanel = document.getElementById('configPanel');
  var configToggle = document.getElementById('configToggle');
  var sheetInput = document.getElementById('sheetId');
  var connectBtn = document.getElementById('connectBtn');
  var disconnectBtn = document.getElementById('disconnectBtn');
  var configStatus = document.getElementById('configStatus');

  // Escape HTML to prevent XSS
  function esc(str) {
    var d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  /** Sanitize untrusted HTML -- strips scripts and on* event handlers. @param {string} raw @returns {string} */
  function sanitizeHTML(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = raw;
    var scripts = tmp.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    var all = tmp.querySelectorAll('*');
    for (var j = 0; j < all.length; j++) {
      var attrs = all[j].attributes;
      for (var k = attrs.length - 1; k >= 0; k--) {
        if (attrs[k].name.toLowerCase().indexOf('on') === 0) {
          all[j].removeAttribute(attrs[k].name);
        }
      }
    }
    return tmp.innerHTML;
  }

  /** Show toast notification. @param {string} message @param {'success'|'error'|'info'} type */
  function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + type;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('toast--visible'); });
    var delay = type === 'error' ? 8000 : 4000;
    setTimeout(function () {
      toast.classList.remove('toast--visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, delay);
  }

  function formatNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return n.toLocaleString();
  }

  function parseDate(raw) {
    if (raw instanceof Date) return raw;
    if (typeof raw === 'string') {
      var gviz = raw.match(/^Date\((\d+),(\d+),(\d+)\)$/);
      if (gviz) return new Date(parseInt(gviz[1]), parseInt(gviz[2]), parseInt(gviz[3]));
      var d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      var parts = raw.split('/');
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    if (typeof raw === 'number') return new Date((raw - 25569) * 86400 * 1000);
    return null;
  }

  /** Create DOM element safely. @param {string} tag @param {Object} [attrs] @param {Array} [children] @returns {HTMLElement} */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else if (c) node.appendChild(c);
      });
    }
    return node;
  }

  function clear(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
  }

  // Tab Navigation
  var currentTab = 'ventas';

  function initTabs() {
    var tabNav = document.getElementById('appTabs');
    if (!tabNav) return;
    tabNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.app-tab');
      if (!btn) return;
      var tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
    switchTab(currentTab);
  }

  /** Switch active dashboard tab and lazy-load its data if needed. @param {string} tab */
  function switchTab(tab) {
    currentTab = tab;
    var btns = document.querySelectorAll('.app-tab');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('app-tab--active', btns[i].getAttribute('data-tab') === tab);
    }
    var sections = document.querySelectorAll('.dashboard [data-tab]');
    for (var j = 0; j < sections.length; j++) {
      sections[j].classList.toggle('tab-visible', sections[j].getAttribute('data-tab') === tab);
    }
    // Lazy-load: fetch any sheets this tab needs that aren't cached yet
    var needed = (TAB_SHEETS[tab] || []).filter(function (s) { return !sheetCache[s]; });
    if (needed.length > 0 && sheetId) {
      showLoadingBar();
      fetchSheets(needed, false).then(function () {
        lastRenderArgs = buildRenderArgs();
        dirtyTabs[tab] = true;
        renderTab(tab, lastRenderArgs);
        hideLoadingBar();
      });
    } else if (dirtyTabs[tab] && lastRenderArgs) {
      renderTab(tab, lastRenderArgs);
    }
  }

  // Section Help Manual
  var HELP = {
    'Pipeline Funnel': {
      what: 'Visualiza el embudo de ventas completo. Cada etapa muestra cuantos deals hay y su valor total en USD.',
      actions: 'Solo lectura. Los datos vienen de la pestaña <strong>Pipeline</strong> del Google Sheet (columna "Etapa" y "Valor Deal").',
      stages: '<strong>Lead</strong> > <strong>1st Meeting</strong> > <strong>Closing</strong> > <strong>Win</strong>. Las etapas <strong>Lost</strong>, <strong>Gain back</strong> y <strong>NO WAY JOSE</strong> muestran deals perdidos o recuperados.'
    },
    'Intel Briefs': {
      what: 'Genera reportes de inteligencia competitiva para cada deal activo. Usa OpenAI para analizar la empresa y dar insights estrategicos.',
      actions: 'Haz clic en <strong>INTEL</strong> junto a cualquier deal para generar un brief. Se abre un modal con el analisis (toma ~30s en generarse).',
      source: 'Pipeline tab del Sheet + OpenAI via Make.com webhook.'
    },
    'Outbound Queue': {
      what: 'Lista de prospectos para cold outreach. Cada lead tiene un score (0-100) que indica que tan buen fit es como cliente.',
      actions: '<strong>Filtrar</strong> por etapa usando los botones (Nuevo, Contactado, etc.).\n<strong>Generate</strong>: genera un email personalizado con IA.\n<strong>Edit</strong>: edita el subject/body antes de enviar.\n<strong>Send</strong>: envia el email por Gmail (pide confirmacion).\n<strong>Advance</strong>: mueve el lead a la siguiente etapa del funnel.',
      source: 'Pestaña <strong>Outbound</strong> del Sheet. Columnas: Company, Contact, Email, Industry, Score, Status, Subject, Message.'
    },
    'Prospecting': {
      what: 'Leads descubiertos automaticamente cada semana a partir de noticias (RSS + OpenAI). Encuentra empresas que podrian necesitar MOAT.',
      actions: 'Solo lectura. Los leads se generan automaticamente cada semana por el escenario <strong>MOAT: Auto Prospecting Weekly</strong> en Make.com.',
      source: 'Pestaña <strong>Prospecting</strong> del Sheet. Columna "Resultados" con bloques [LEAD]...[/LEAD].'
    },
    'Contact Segments': {
      what: 'Muestra los 3 segmentos de contactos del CSV importado: VCs LATAM, Founders LATAM, y LATAM Warm.',
      actions: 'Haz clic en cada tarjeta para ver los <strong>top 5 contactos</strong> de ese segmento con nombre, organizacion, pais y email.',
      source: 'Datos hardcoded del analisis del CSV de 11K contactos. Para actualizar, re-ejecutar la segmentacion.'
    },
    'Follow-ups Pendientes': {
      what: 'Deals activos que no se han actualizado en mas de 7 dias. Alerta automatica para no dejar deals frios.',
      actions: 'Solo lectura. Se calcula automaticamente comparando la fecha de "Ultima Actualizacion" de cada deal contra hoy.',
      source: 'Pestaña <strong>Pipeline</strong> del Sheet, columna "Ultima Actualizacion".'
    },
    'Contabilidad': {
      what: 'Vista financiera: ingresos cobrados, pendientes por cobrar, y gastos mensuales de herramientas/servicios.',
      actions: 'Solo lectura. Muestra balance neto (cobrado - gastos). Cada cliente/gasto tiene barra de progreso si hay pagos parciales.',
      source: 'Pestañas <strong>Contabilidad</strong> (ingresos) y <strong>Gastos</strong> (egresos) del Sheet.'
    },
    'Cascada Financiera': {
      what: 'Diagrama waterfall que muestra como fluye el dinero: cobrado > obligaciones > neto. Incluye conversion USD a COP.',
      actions: 'Solo lectura. La tasa de cambio USD/COP se obtiene automaticamente de ExchangeRate-API al cargar.',
      source: 'Pestañas <strong>Contabilidad</strong> y <strong>Gastos</strong>. Tasa de cambio: api.exchangerate-api.com.'
    },
    'Revenue Forecast': {
      what: 'Proyeccion de ingresos a 3 meses basada en el pipeline actual y tasas historicas de conversion.',
      actions: 'Solo lectura. Se calcula automaticamente: deals en Closing con alta probabilidad, deals en 1st Meeting con probabilidad media.',
      source: 'Pestaña <strong>Pipeline</strong> (deals activos) + <strong>Metricas</strong> (historico de cierres).'
    },
    'Web Analytics': {
      what: 'Metricas de trafico del sitio web moatlabs-ventures.com via Google Analytics 4. Muestra sesiones, usuarios, bounce rate, duracion promedio, fuentes de trafico, y paginas mas visitadas.',
      actions: 'Solo lectura por ahora. Los datos se actualizaran automaticamente cuando se conecte GA4 a Make.com. Las tendencias comparan esta semana vs la anterior.',
      source: '<strong>Google Analytics 4</strong> via Make.com scenario "MOAT: GA4 Weekly Sync" (ID 4485921) > pestaña <strong>Analytics</strong> del Sheet. Se actualiza cada lunes a las 7:00 AM. Si no hay datos de GA4, muestra datos demo.'
    },
    'Content Calendar': {
      what: 'Calendario de contenido para LinkedIn y otras plataformas. Puedes crear, editar y aprobar posts.',
      actions: '<strong>Edit</strong>: abre el formulario para editar titulo, copy, URL de imagen, y fecha.\n<strong>Approve</strong>: marca el post como aprobado.\n<strong>Save</strong>: guarda los cambios en el Google Sheet via Make.com webhook.\nPuedes subir imagenes desde archivo (se guardan en Google Drive).',
      source: 'Pestaña <strong>Contenido</strong> del Sheet. Columnas: Titulo, Copy, Status, Fecha, Plataforma, Imagen.'
    },
    'LinkedIn Performance': {
      what: 'Metricas semanales de LinkedIn: impresiones, engagement rate, profile views, y posts publicados.',
      actions: 'Solo lectura. Incluye flechas de tendencia (verde = subio vs semana anterior, rojo = bajo). Muestra historial de las ultimas 8 semanas.',
      source: 'Pestaña <strong>LinkedIn</strong> del Sheet (manual). Headers: Semana, Impressions, Engagement Rate, Profile Views, New Followers, Posts.'
    },
    'Social Selling Index (SSI)': {
      what: 'Score de LinkedIn (0-100) que mide tu efectividad en social selling. 4 dimensiones: marca personal, encontrar personas, engagement, y relaciones.',
      actions: 'Solo lectura. Datos hardcoded del ultimo reporte SSI de LinkedIn. Los factores en rojo son areas debiles a mejorar.',
      source: 'linkedin.com/sales/ssi -- actualizar manualmente cuando cambie.'
    },
    'Audience Insights': {
      what: 'Demograficos de tu audiencia de LinkedIn: cargo, ubicacion, sector, y tamaño de empresa.',
      actions: 'Solo lectura. 4 graficos de barras horizontales mostrando la distribucion de tu audiencia.',
      source: 'LinkedIn Analytics > Demographics -- datos hardcoded, actualizar cuando cambie significativamente.'
    },
    'Sales Velocity': {
      what: 'Mide la velocidad del ciclo de ventas: cuantos leads entran, cuantos avanzan, tasa de conversion, y costo por lead.',
      actions: 'Solo lectura. Metricas clave: <strong>Lead-to-Win</strong> (conversion total), <strong>Avg Deal Size</strong>, <strong>Cost per Lead</strong> (gastos / leads), <strong>Content ROI</strong>.',
      source: 'Calculado cruzando <strong>Pipeline</strong>, <strong>Gastos</strong>, y <strong>Contenido</strong>.'
    },
    'Weekly Metrics': {
      what: 'Grafico de barras semanal mostrando la evolucion de leads, calls, propuestas, y cierres.',
      actions: 'Solo lectura. Hover sobre cada barra para ver el valor exacto. Muestra revenue total en la linea de abajo.',
      source: 'Pestaña <strong>Metricas</strong> del Sheet. Cada fila es una semana con columnas: Semana, Leads Nuevos, Calls, Propuestas, Cerrados, Revenue.'
    },
    'Quick Actions': {
      what: 'Links directos a las herramientas que usa MOAT Labs diariamente.',
      actions: '<strong>Google Sheet</strong>: abre el Sheet maestro con todos los datos.\n<strong>Make.com</strong>: abre los escenarios de automatizacion.\n<strong>Vercel</strong>: abre el panel de deployment del dashboard.\n<strong>Google Analytics</strong>: abre GA4 para ver trafico del sitio web.'
    }
  };

  function initHelp() {
    var headers = document.querySelectorAll('.card-header');
    headers.forEach(function (header) {
      var h2 = header.querySelector('h2');
      if (!h2) return;
      var title = h2.textContent.trim();
      var helpData = HELP[title];
      if (!helpData) return;

      var btn = document.createElement('button');
      btn.className = 'help-btn';
      btn.textContent = '?';
      btn.title = 'Ver ayuda de esta seccion';
      btn.setAttribute('aria-label', 'Ayuda: ' + title);

      var panel = document.createElement('div');
      panel.className = 'help-panel';
      var html = '<span class="help-label">Que muestra</span><br>' + helpData.what;
      if (helpData.stages) {
        html += '<br><br><span class="help-label">Etapas</span><br>' + helpData.stages;
      }
      if (helpData.actions) {
        html += '<div class="help-actions"><span class="help-label">Que puedes hacer</span><br>' + helpData.actions.replace(/\n/g, '<br>') + '</div>';
      }
      if (helpData.source) {
        html += '<div class="help-source">Fuente: ' + helpData.source + '</div>';
      }
      panel.innerHTML = html;

      h2.appendChild(btn);
      header.after(panel);

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = panel.classList.contains('help-panel--visible');
        document.querySelectorAll('.help-panel--visible').forEach(function (p) { p.classList.remove('help-panel--visible'); });
        document.querySelectorAll('.help-btn--active').forEach(function (b) { b.classList.remove('help-btn--active'); });
        if (!isOpen) {
          panel.classList.add('help-panel--visible');
          btn.classList.add('help-btn--active');
        }
      });
    });
  }

  // KPI help (special case - no card-header)
  function initKPIHelp() {
    var kpiGrid = document.querySelector('.kpi-grid');
    if (!kpiGrid) return;
    var helpText = '<span class="help-label">KPIs</span><br>' +
      '<strong>Total Leads</strong>: deals activos en etapas Lead, 1st Meeting, Closing, Win, Gain back.<br>' +
      '<strong>Calls This Week</strong>: valor de "Calls" de la semana mas reciente en Metricas.<br>' +
      '<strong>Closing Deals</strong>: deals en etapa "Closing".<br>' +
      '<strong>Pipeline Value</strong>: suma de "Valor Deal" de todos los deals activos, en USD.' +
      '<div class="help-source">Fuente: Pestañas Pipeline y Metricas del Google Sheet.</div>';
    var panel = document.createElement('div');
    panel.className = 'help-panel';
    panel.innerHTML = helpText;
    panel.style.borderRadius = 'var(--radius)';
    panel.style.border = '1px solid var(--border-card)';
    panel.style.marginTop = 'calc(-1 * var(--space-4))';
    kpiGrid.after(panel);

    kpiGrid.style.cursor = 'help';
    kpiGrid.title = 'Clic para ver ayuda de KPIs';
    kpiGrid.addEventListener('click', function (e) {
      if (e.target.closest('.help-panel')) return;
      var isOpen = panel.classList.contains('help-panel--visible');
      document.querySelectorAll('.help-panel--visible').forEach(function (p) { p.classList.remove('help-panel--visible'); });
      document.querySelectorAll('.help-btn--active').forEach(function (b) { b.classList.remove('help-btn--active'); });
      if (!isOpen) panel.classList.add('help-panel--visible');
    });
  }

  // Skeleton loading -- show shimmer on KPIs and first card until data arrives
  function addSkeletons() {
    document.querySelectorAll('.kpi-card').forEach(function (c) { c.classList.add('skeleton'); });
    var firstCard = document.querySelector('.dashboard .card[data-tab="ventas"]');
    if (firstCard) firstCard.classList.add('skeleton');
  }
  function removeSkeletons() {
    document.querySelectorAll('.skeleton').forEach(function (c) { c.classList.remove('skeleton'); });
  }

  // Init
  function init() {
    wireRouting();
    addSkeletons();
    initTabs();
    initHelp();
    initKPIHelp();
    configToggle.addEventListener('click', toggleConfig);
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    fetchExchangeRate(function () {
      if (sheetId) {
        sheetInput.value = sheetId;
        disconnectBtn.style.display = '';
        loadLiveData();
      } else {
        loadDemoData();
      }
    });
    initQuickBar();
  }

  function initQuickBar() {
    var bar = document.getElementById('quickBar');
    if (!bar) return;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('.qb-btn');
      if (!btn) return;
      var action = btn.dataset.action;
      if (action === 'review' || action === 'responses') {
        switchTab('ventas');
        setTimeout(function () {
          var obSection = document.getElementById('outboundSection');
          if (obSection) obSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (action === 'responses') {
            currentOutboundFilter = 'respondio';
            renderOutbound(cachedOutbound);
          }
        }, 100);
      } else if (action === 'pipeline') {
        switchTab('ventas');
        setTimeout(function () {
          var funnel = document.getElementById('funnelSection');
          if (funnel) funnel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });
  }

  function toggleConfig() {
    configPanel.classList.toggle('open');
    var isOpen = configPanel.classList.contains('open');
    configToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function connect() {
    var val = sheetInput.value.trim();
    if (!val) { showStatus('Enter a valid Sheet ID', 'error'); return; }
    sheetId = val;
    localStorage.setItem(STORAGE_KEY, sheetId);
    disconnectBtn.style.display = '';
    showStatus('Connecting...', '');
    loadLiveData();
  }

  function disconnect() {
    sheetId = '';
    sheetCache = {};
    localStorage.removeItem(STORAGE_KEY);
    sheetInput.value = '';
    disconnectBtn.style.display = 'none';
    clearTimeout(refreshTimer);
    showStatus('', '');
    document.getElementById('dataSource').textContent = 'Demo data';
    loadDemoData();
  }

  function showStatus(msg, type) {
    configStatus.textContent = msg;
    configStatus.className = 'config-status' + (type ? ' ' + type : '');
  }

  /** Fetch a Google Sheets tab via GViz API with retry. @param {string} tabName @param {number} [retries=2] @returns {Promise<Array<Object>>} */
  function fetchTab(tabName, retries) {
    if (retries === undefined) retries = 2;
    var url = GVIZ_BASE + sheetId + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(tabName) + '&t=' + Date.now();
    return fetch(url).then(function (res) { return res.text(); }).then(function (text) {
      var json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      if (json.status === 'error') throw new Error(json.errors[0].detailed_message);
      var cols = json.table.cols.map(function (c) { return c.label; });
      return json.table.rows.map(function (r, idx) {
        var obj = { __rowNum: idx + 2 };
        r.c.forEach(function (cell, i) {
          if (i < cols.length) obj[cols[i]] = cell ? (cell.v !== null && cell.v !== undefined ? cell.v : (cell.f || '')) : '';
        });
        return obj;
      });
    }).catch(function (err) {
      if (retries > 0) {
        return new Promise(function (resolve) { setTimeout(resolve, 2000); })
          .then(function () { return fetchTab(tabName, retries - 1); });
      }
      throw err;
    });
  }

  // Loading bar + toast
  var loadBar = document.getElementById('loadingBar');
  var refreshToast = document.getElementById('refreshToast');
  var isFirstLoad = true;

  function showLoadingBar() {
    if (!loadBar) return;
    loadBar.classList.remove('loading-bar--done');
    loadBar.classList.add('loading-bar--active');
  }

  function hideLoadingBar() {
    if (!loadBar) return;
    loadBar.classList.remove('loading-bar--active');
    loadBar.style.width = '100%';
    loadBar.classList.add('loading-bar--done');
    setTimeout(function () {
      loadBar.classList.remove('loading-bar--done');
      loadBar.style.width = '0';
    }, 600);
  }

  function showRefreshToast() {
    if (!refreshToast || isFirstLoad) { isFirstLoad = false; return; }
    refreshToast.classList.add('refresh-toast--visible');
    setTimeout(function () {
      refreshToast.classList.remove('refresh-toast--visible');
    }, 2500);
  }

  // Tab-to-sheets mapping for lazy loading
  var TAB_SHEETS = {
    ventas: ['Pipeline', 'M\u00e9tricas', 'Contabilidad', 'Outbound', 'Prospecting'],
    finanzas: ['Contabilidad', 'Gastos', 'Pipeline', 'M\u00e9tricas'],
    contenido: ['Contenido', 'LinkedIn', 'Analytics'],
    operaciones: ['Pipeline', 'Gastos', 'Contenido', 'M\u00e9tricas']
  };
  var ALL_SHEETS = ['Pipeline', 'Contenido', 'M\u00e9tricas', 'Contabilidad', 'Gastos', 'Outbound', 'Prospecting', 'LinkedIn', 'Analytics'];
  var sheetCache = {};

  function safeFetch(sheetName) {
    return fetchTab(sheetName).catch(function () {
      showToast('Failed to load ' + sheetName, 'error');
      return [];
    });
  }

  function fetchSheets(sheetNames, forceRefresh) {
    var promises = sheetNames.map(function (name) {
      if (!forceRefresh && sheetCache[name]) return Promise.resolve(sheetCache[name]);
      return safeFetch(name).then(function (data) {
        sheetCache[name] = data;
        return data;
      });
    });
    return Promise.all(promises);
  }

  function buildRenderArgs() {
    var ob = sheetCache['Outbound'] || [];
    var hasRealOb = ob && ob.some(function (r) { return field(r, 'Company') && field(r, 'Email'); });
    if (!hasRealOb) ob = getDemoOutbound();
    return [
      sheetCache['Pipeline'] || [], sheetCache['Contenido'] || [],
      sheetCache['M\u00e9tricas'] || [], sheetCache['Contabilidad'] || [],
      sheetCache['Gastos'] || [], ob,
      sheetCache['Prospecting'] || [], sheetCache['LinkedIn'] || [],
      sheetCache['Analytics'] || []
    ];
  }

  /** Load live data from Google Sheets. Only fetches sheets needed by active tab (lazy-load). */
  function loadLiveData() {
    showLoadingBar();
    var sheetsNeeded = TAB_SHEETS[currentTab] || ALL_SHEETS;
    fetchSheets(sheetsNeeded, true)
      .then(function () {
        showStatus('Connected', 'success');
        document.getElementById('dataSource').textContent = 'Live data';
        var dot = document.getElementById('footerDot');
        if (dot) dot.classList.remove('footer-status-dot--demo');
        render.apply(null, buildRenderArgs());
        hideLoadingBar();
        showRefreshToast();
        scheduleRefresh(loadLiveData);
      })
      .catch(function (e) {
        hideLoadingBar();
        showStatus('Error: ' + e.message, 'error');
        document.getElementById('dataSource').textContent = 'Connection error - showing demo';
        var dot2 = document.getElementById('footerDot');
        if (dot2) dot2.classList.add('footer-status-dot--demo');
        loadDemoData();
      });
  }

  function scheduleRefresh(fn) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(fn, REFRESH_INTERVAL);
  }

  var lastRenderArgs = null;
  var dirtyTabs = { ventas: true, finanzas: true, contenido: true, operaciones: true };

  /** v2: dispatch rendering based on current URL view, not legacy tab name. @param {string} tab @param {Array} args */
  function renderTab(tab, args) {
    var p = args[0], co = args[1], m = args[2], ct = args[3], g = args[4], ob = args[5], pr = args[6], li = args[7], an = args[8];
    var view = (typeof currentView === 'function') ? currentView() : 'feed';
    if (view === 'finanzas') {
      renderContabilidad(ct || [], g || []);
      renderCascada(ct || [], g || []);
      renderForecast(p, m);
    } else if (view === 'panel') {
      renderWebAnalytics(an || []);
      renderContent(co);
      renderLinkedInPerformance(co, m, li || []);
      renderSSI();
      renderAudience();
      renderSalesVelocity(p, g || [], co);
      renderChart(m);
    }
    // 'feed' view renders via renderFeed() called from render(); nothing else to do here.
    dirtyTabs[tab] = false;
    animateBars();
    updateQuickBar(args);
  }

  function updateQuickBar(args) {
    var ob = args[5] || [];
    var pipeline = args[0] || [];

    var reviewCount = 0;
    var responseCount = 0;
    var pipelineVal = 0;

    ob.forEach(function (r) {
      var st = (field(r, 'Status') || 'nuevo').toLowerCase();
      var subj = field(r, 'Subject') || '';
      var msg = field(r, 'Message') || '';
      if (subj && msg && (st === 'nuevo' || st === 'contactado')) reviewCount++;
      if (st === 'respondio') responseCount++;
    });

    pipeline.forEach(function (r) {
      var stage = field(r, 'Etapa') || '';
      if (stage === STAGES.LEAD || stage === STAGES.MEETING || stage === STAGES.CLOSING || stage === STAGES.GAINBACK) {
        pipelineVal += parseFloat(String(field(r, 'Valor Deal') || '0').replace(/[$,]/g, '')) || 0;
      }
    });

    var reviewEl = document.getElementById('qbReviewCount');
    var responseEl = document.getElementById('qbResponseCount');
    var pipelineEl = document.getElementById('qbPipelineVal');

    if (reviewEl) {
      reviewEl.textContent = reviewCount;
      reviewEl.className = 'qb-badge' + (reviewCount > 3 ? ' qb-badge--warn' : '');
    }
    if (responseEl) {
      responseEl.textContent = responseCount;
      responseEl.className = 'qb-badge' + (responseCount > 0 ? ' qb-badge--urgent' : '');
    }
    if (pipelineEl) {
      pipelineEl.textContent = '$' + (pipelineVal >= 1000 ? Math.round(pipelineVal / 1000) + 'K' : pipelineVal);
    }
  }

  function animateBars() {
    var bars = document.querySelectorAll('.audience-bar, .casc-bar, .forecast-bar-segment, .li-history-bar');
    bars.forEach(function (bar) {
      var targetWidth = bar.style.width;
      if (!targetWidth || bar.dataset.animated) return;
      bar.style.width = '0';
      bar.dataset.animated = '1';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          bar.style.width = targetWidth;
        });
      });
    });
  }

  /** Main render entry point. Stores args, marks all tabs dirty, renders active tab. */
  function render(pipeline, contenido, metricas, contabilidad, gastos, outbound, prospecting, linkedin, analytics) {
    lastRenderArgs = [pipeline, contenido, metricas, contabilidad, gastos, outbound, prospecting, linkedin, analytics || []];
    dirtyTabs = { ventas: true, finanzas: true, contenido: true, operaciones: true };
    // v2: always render feed + revenue strip (cheap, DOM-safe with null guards)
    renderFeed(pipeline, outbound);
    renderRevenueStrip(contabilidad);
    renderTab(currentTab, lastRenderArgs);
    removeSkeletons();
    var lu = document.getElementById('lastUpdate');
    var timeStr = new Date().toLocaleTimeString();
    if (lu) lu.textContent = 'Updated ' + timeStr;
    var liveRegion = document.getElementById('liveRegion');
    if (liveRegion) liveRegion.textContent = 'Dashboard data refreshed at ' + timeStr;
  }

  /** Render KPI cards from pipeline and metricas data. @param {Array} pipeline @param {Array} metricas */
  var ANNUAL_TARGET = 100000;

  function renderKPIs(pipeline, metricas, contabilidad) {
    var leads = pipeline.filter(function (r) { return ACTIVE_STAGES.indexOf(field(r, 'Etapa')) !== -1; }).length;
    var closing = pipeline.filter(function (r) { return field(r, 'Etapa') === STAGES.CLOSING; }).length;
    var pipelineVal = pipeline
      .filter(function (r) { return ACTIVE_STAGES.indexOf(field(r, 'Etapa')) !== -1; })
      .reduce(function (s, r) { return s + (parseFloat(field(r, 'Valor Deal')) || 0); }, 0);
    var callsThisWeek = 0;
    if (metricas.length) callsThisWeek = parseInt(field(metricas[metricas.length - 1], 'Calls')) || 0;

    // Revenue: sum of "Dinero" from Contabilidad (actual collected revenue)
    var revenue = 0;
    if (contabilidad && contabilidad.length) {
      contabilidad.forEach(function (r) {
        revenue += parseFloat(String(field(r, 'Dinero')).replace(/[$,]/g, '')) || 0;
      });
    }
    var revenuePct = Math.min(Math.round((revenue / ANNUAL_TARGET) * 100), 100);

    // Win rate: wins / (wins + losses)
    var wins = pipeline.filter(function (r) { return field(r, 'Etapa') === STAGES.WIN; }).length;
    var losses = pipeline.filter(function (r) { return field(r, 'Etapa') === STAGES.LOST || field(r, 'Etapa') === STAGES.NOWAY; }).length;
    var totalDecided = wins + losses;
    var winRate = totalDecided > 0 ? Math.round((wins / totalDecided) * 100) : 0;

    document.getElementById('kpiLeads').textContent = leads;
    document.getElementById('kpiCalls').textContent = callsThisWeek;
    document.getElementById('kpiProposals').textContent = closing;
    document.getElementById('kpiPipeline').textContent = '$' + formatNumber(pipelineVal);

    // Revenue target
    var revenueEl = document.getElementById('kpiRevenue');
    var revenueBar = document.getElementById('kpiRevenueBar');
    if (revenueEl) {
      revenueEl.textContent = '$' + formatNumber(revenue);
      revenueBar.style.width = revenuePct + '%';
      revenueBar.className = 'kpi-progress-bar' + (revenuePct >= 75 ? ' kpi-progress--good' : revenuePct >= 40 ? ' kpi-progress--ok' : ' kpi-progress--behind');
    }

    // Win rate
    var winRateEl = document.getElementById('kpiWinRate');
    if (winRateEl) winRateEl.textContent = winRate + '%';
  }

  /** Render pipeline funnel visualization with deal counts and values per stage. @param {Array} pipeline */
  function renderFunnel(pipeline) {
    var stages = [
      { key: STAGES.LEAD, cls: 'lead', label: STAGES.LEAD },
      { key: STAGES.MEETING, cls: 'meeting', label: STAGES.MEETING },
      { key: STAGES.CLOSING, cls: 'closing', label: STAGES.CLOSING },
      { key: STAGES.WIN, cls: 'win', label: STAGES.WIN },
      { key: STAGES.LOST, cls: 'lost', label: STAGES.LOST },
      { key: STAGES.GAINBACK, cls: 'gainback', label: STAGES.GAINBACK },
      { key: STAGES.NOWAY, cls: 'noway', label: STAGES.NOWAY },
    ];

    var counts = {}, values = {};
    stages.forEach(function (s) { counts[s.key] = 0; values[s.key] = 0; });
    pipeline.forEach(function (r) {
      var e = field(r, 'Etapa');
      if (counts[e] !== undefined) {
        counts[e]++;
        values[e] += parseFloat(field(r, 'Valor Deal')) || 0;
      }
    });

    var total = pipeline.length;
    document.getElementById('pipelineTotal').textContent = total + ' deal' + (total !== 1 ? 's' : '');

    var funnelEl = document.getElementById('funnel');
    clear(funnelEl);
    stages.forEach(function (s, i) {
      if (i > 0) {
        funnelEl.appendChild(el('div', { className: 'funnel-arrow', textContent: '\u203A' }));
      }
      var stage = el('div', { className: 'funnel-stage funnel-stage--' + s.cls }, [
        el('span', { className: 'funnel-stage-count', textContent: String(counts[s.key]) }),
        el('span', { className: 'funnel-stage-name', textContent: s.label }),
        el('span', { className: 'funnel-stage-value', textContent: '$' + formatNumber(values[s.key]) }),
      ]);
      funnelEl.appendChild(stage);
    });

    var colors = ['#2563EB', '#2B4B8C', '#D4A149', '#16A34A', '#DC2626', '#7C3AED', '#64748B'];
    var legendEl = document.getElementById('funnelLegend');
    clear(legendEl);
    stages.forEach(function (s, i) {
      var pct = Math.round((counts[s.key] / Math.max(total, 1)) * 100);
      var item = el('span', { className: 'funnel-legend-item' }, [
        el('span', { className: 'funnel-legend-dot', style: 'background:' + colors[i] }),
        s.label + ' (' + pct + '%)',
      ]);
      legendEl.appendChild(item);
    });
  }

  /** @type {Object<string, string>} Memoized normalized field names */
  var FIELD_NAME_CACHE = {};
  function normalizeFieldName(name) {
    if (FIELD_NAME_CACHE[name] !== undefined) return FIELD_NAME_CACHE[name];
    FIELD_NAME_CACHE[name] = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return FIELD_NAME_CACHE[name];
  }

  function field(r, name) {
    if (r[name] !== undefined) return r[name];
    if (!r.__normalized) {
      r.__normalized = {};
      Object.keys(r).forEach(function (k) {
        r.__normalized[normalizeFieldName(k)] = k;
      });
    }
    var realKey = r.__normalized[normalizeFieldName(name)];
    return realKey ? r[realKey] : '';
  }

  function fullName(r) {
    var n = field(r, 'Nombre') || '';
    var a = field(r, 'Apellido') || '';
    return (n + ' ' + a).trim() || 'Unknown';
  }

  /** Render follow-up alerts for deals not updated in 7+ days. @param {Array} pipeline */
  function renderFollowups(pipeline) {
    var now = new Date();
    var activeStages = PIPELINE_ACTIVE;
    var items = [];

    pipeline.forEach(function (r) {
      if (activeStages.indexOf(field(r, 'Etapa')) === -1) return;
      var raw = field(r, 'Fecha Ultimo Contacto');
      if (!raw) return;
      var d = parseDate(raw);
      if (!d) return;
      var diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      if (diffDays >= 5) {
        items.push({
          name: fullName(r),
          company: field(r, 'Empresa'),
          stage: field(r, 'Etapa'),
          days: diffDays,
          next: field(r, 'Proximo Paso'),
        });
      }
    });

    items.sort(function (a, b) { return b.days - a.days; });
    var listEl = document.getElementById('followupsList');
    var countEl = document.getElementById('followupCount');
    countEl.textContent = items.length;
    clear(listEl);

    if (!items.length) {
      listEl.appendChild(el('div', { className: 'empty-state', textContent: 'No follow-ups pending -- all caught up!' }));
      return;
    }

    items.forEach(function (it) {
      var urgency = it.days >= 7 ? 'high' : 'medium';
      var row = el('div', { className: 'followup-item' }, [
        el('span', { className: 'followup-urgency followup-urgency--' + urgency }),
        el('div', { className: 'followup-info' }, [
          el('div', { className: 'followup-name', textContent: it.name }),
          el('div', { className: 'followup-company', textContent: it.company + (it.next ? ' -- ' + it.next : '') }),
        ]),
        el('div', { className: 'followup-meta' }, [
          el('div', { className: 'followup-days followup-days--' + urgency, textContent: it.days + 'd ago' }),
          el('div', { className: 'followup-stage', textContent: it.stage }),
        ]),
      ]);
      listEl.appendChild(row);
    });
  }

  /** Render intel brief buttons for each active deal. @param {Array} pipeline */
  function renderIntel(pipeline) {
    var activeStages = PIPELINE_ACTIVE;
    var deals = pipeline.filter(function (r) {
      return activeStages.indexOf(field(r, 'Etapa')) !== -1 && field(r, 'Empresa');
    });

    var container = document.getElementById('intelDeals');
    var countEl = document.getElementById('intelCount');
    countEl.textContent = deals.length + ' deal' + (deals.length !== 1 ? 's' : '');
    clear(container);

    if (!deals.length) {
      container.appendChild(el('div', { className: 'empty-state', textContent: 'No active deals in pipeline' }));
      return;
    }

    deals.forEach(function (r) {
      var company = field(r, 'Empresa');
      var name = fullName(r);
      var stage = field(r, 'Etapa');
      var value = parseFloat(field(r, 'Valor Deal')) || 0;

      var btn = el('button', { className: 'intel-btn', textContent: 'Intel' });

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = 'Loading...';
        openIntelModal(company, function () {
          btn.disabled = false;
          btn.textContent = 'Intel';
        });
      });

      var card = el('div', { className: 'intel-deal' }, [
        el('div', { className: 'intel-deal-info' }, [
          el('div', { className: 'intel-deal-name', textContent: company }),
          el('div', { className: 'intel-deal-meta' }, [
            el('span', { textContent: name }),
            el('span', { textContent: stage }),
            el('span', { textContent: '$' + formatNumber(value) }),
          ]),
        ]),
        btn,
      ]);

      container.appendChild(card);
    });
  }

  /** Open modal and fetch AI-generated competitive intel brief for a company. @param {string} company @param {Function} onDone */
  function openIntelModal(company, onDone) {
    var overlay = document.getElementById('intelOverlay');
    var title = document.getElementById('intelModalTitle');
    var body = document.getElementById('intelModalBody');
    var closeBtn = document.getElementById('intelClose');

    var previousFocus = document.activeElement;
    title.textContent = 'Intel: ' + company;
    body.innerHTML = '<div class="intel-loading">Analyzing ' + esc(company) + '...</div>';
    overlay.style.display = '';
    closeBtn.focus();

    function closeModal() {
      overlay.style.display = 'none';
      document.removeEventListener('keydown', handleKeys);
      if (previousFocus) previousFocus.focus();
      if (onDone) onDone();
    }

    function handleKeys(e) {
      if (e.key === 'Escape') { closeModal(); return; }
      // Focus trap -- cycle Tab within modal
      if (e.key === 'Tab') {
        var modal = overlay.querySelector('.intel-modal');
        var focusable = modal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    document.addEventListener('keydown', handleKeys);
    closeBtn.onclick = closeModal;
    overlay.onclick = function (e) {
      if (e.target === overlay) closeModal();
    };

    var abortCtrl = new AbortController();
    var timeoutId = setTimeout(function () { abortCtrl.abort(); }, 90000);

    body.innerHTML = '<div class="intel-loading">Analyzing ' + esc(company) + '...<br><small style="color:var(--muted);margin-top:8px;display:block;">This takes 30-60 seconds (RSS + AI analysis)</small></div>';

    fetch(INTEL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: company }),
      signal: abortCtrl.signal,
    })
    .then(function (r) {
      if (!r.ok) throw new Error('Status ' + r.status);
      return r.text();
    })
    .then(function (html) {
      clearTimeout(timeoutId);
      var stripped = html.replace(/^```html?\s*/i, '').replace(/```\s*$/g, '').trim();
      var clean = sanitizeHTML(stripped);
      body.innerHTML = clean || '<div class="intel-loading">No intel available for this company.</div>';
      if (onDone) onDone();
    })
    .catch(function (err) {
      clearTimeout(timeoutId);
      var msg = err.name === 'AbortError'
        ? 'Request timed out (90s). The scenario may be processing -- try again in a minute.'
        : 'Error generating brief: ' + (err.message || 'Unknown error') + '. Try again.';
      body.innerHTML = '<div class="intel-loading">' + msg + '</div>';
      if (onDone) onDone();
    });
  }

  // Prospecting
  function parseLeads(text) {
    var leads = [];
    // Try structured [LEAD]...[/LEAD] format first
    var re = /\[LEAD\]([\s\S]*?)\[\/LEAD\]/g;
    var match;
    while ((match = re.exec(text)) !== null) {
      var block = match[1];
      var lead = {};
      var fields = ['Company', 'Contact', 'Industry', 'Country', 'Score', 'Reason'];
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var next = i < fields.length - 1 ? fields[i + 1] : null;
        var pat = next
          ? new RegExp(f + ':\\s*(.*?)(?=' + next + ':)', 's')
          : new RegExp(f + ':\\s*(.*)', 's');
        var m = block.match(pat);
        if (m) lead[f] = m[1].trim();
      }
      if (lead.Company) leads.push(lead);
    }
    // Fallback: try extracting "Company: X" patterns from plain text (no tags)
    if (!leads.length && text.indexOf('Company:') !== -1) {
      var lines = text.split('\n');
      var current = {};
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j].trim();
        var kv = line.match(/^(Company|Contact|Industry|Country|Score|Reason):\s*(.+)/i);
        if (kv) {
          if (kv[1].toLowerCase() === 'company' && current.Company) {
            leads.push(current);
            current = {};
          }
          current[kv[1].charAt(0).toUpperCase() + kv[1].slice(1).toLowerCase()] = kv[2].trim();
        }
      }
      if (current.Company) leads.push(current);
    }
    return leads;
  }

  // Contact Segments
  var SEGMENTS = [
    { id: 'vcs_latam', label: 'VCs LATAM', count: 632, color: '#2563EB', purpose: 'MOAT diagnostic for portfolio companies', priority: 1, top: [
      { name: 'Abel Bezares', org: 'Cometa VC', country: 'MX', email: 'abelbezares@gmail.com' },
      { name: 'Adelina Dasso Arana', org: 'Accion Venture Lab', country: 'PE', email: 'adasso@accion.org' },
      { name: 'Adrian Araujo', org: 'Mittel Capital', country: 'MX', email: 'adrian.araujo@mittelcapital.com' },
      { name: 'Adriana Ovando', org: 'G2 Momentum Capital', country: 'MX', email: 'aovando@g2momentum.capital' },
      { name: 'Adriana Tortajada', org: '1200 VC', country: 'MX', email: 'atortajada@1200.vc' },
      { name: 'Adrien Grynblat', org: 'Ecus Capital', country: 'CL', email: 'adrien.grynblat@ecuscapital.com' },
      { name: 'Alejandro Diez Barroso', org: 'DILA Capital', country: 'MX', email: 'adb@dilacapital.com' },
      { name: 'Andres Meira', org: 'Kaszek', country: 'AR', email: 'andres@kaszek.com' },
      { name: 'Carlos Garcia Ottati', org: 'Kavak', country: 'MX', email: 'carlos@kavak.com' },
      { name: 'Santiago Subotovsky', org: 'Emergence Capital', country: 'AR', email: 'santiago@emcap.com' }
    ]},
    { id: 'founders_latam', label: 'Founders LATAM', count: 338, color: '#16A34A', purpose: 'Direct MOAT clients ($5K-$10K)', priority: 2, top: [
      { name: 'Abel Garcia', org: 'Rombus Global', country: 'AR', title: 'Founder' },
      { name: 'Abraham Lopez', org: 'Birdie', country: 'MX', title: 'Co-Founder & COO' },
      { name: 'Agustin Belloso', org: 'Tomorrow Foods', country: 'AR', title: 'Founder' },
      { name: 'Agustin Pina', org: 'Teamcubation', country: 'AR', title: 'Founder' },
      { name: 'Agustin Raimondi', org: 'Welaw', country: 'AR', title: 'Founder' },
      { name: 'Alan Ferszt', org: 'Pomelo', country: 'AR', title: 'CEO' },
      { name: 'Andres Bilbao', org: 'Rappi', country: 'CO', title: 'Co-Founder' },
      { name: 'Carlos Munoz', org: 'Kio Networks', country: 'MX', title: 'CEO' },
      { name: 'Federico Trucco', org: 'Bioceres', country: 'AR', title: 'CEO' },
      { name: 'Martin Migoya', org: 'Globant', country: 'AR', title: 'CEO' }
    ]},
    { id: 'warm_latam', label: 'LATAM Warm', count: 2013, color: '#7C3AED', purpose: 'Nurture -- connected operators', priority: 3, top: [
      { name: 'Ricardo Olmos', org: 'Uala', country: 'MX' },
      { name: 'Luis G.', org: 'Kinedu', country: 'MX' },
      { name: 'Abraham Garcia Martinez', org: 'Nubank', country: 'MX' },
      { name: 'Abraham Gonzalez Pont', org: 'OXIO', country: 'MX' },
      { name: 'Adalberto Flores Ochoa', org: 'Kueski', country: 'MX' },
      { name: 'Abbott Reynal', org: 'Vista Energy', country: 'AR' },
      { name: 'Aaron Muniz', org: 'Proterra Capital', country: 'MX' },
      { name: 'Alejandro Padilla', org: 'Clip', country: 'MX' },
      { name: 'Diego Caicedo', org: 'OmniBnk', country: 'CO' },
      { name: 'Santiago Sosa', org: 'Nuvocargo', country: 'MX' }
    ]},
    { id: 'vcs_global', label: 'VCs Global', count: 2036, color: '#CA8A04', purpose: 'Same VC offer, lower geo-priority', priority: 4, top: [
      { name: 'Aaron Holiday', org: '645 Ventures', country: 'US', title: 'Managing Partner' },
      { name: 'Abby Lyall', org: 'Tribeca Venture Partners', country: 'US' },
      { name: 'Abdul Ly', org: 'Initialized Capital', country: 'US' },
      { name: 'Aaron Gupta', org: 'Vista Equity Partners', country: 'US' },
      { name: 'Aaron Perman', org: 'S3 Ventures', country: 'US' }
    ]},
    { id: 'founders_global', label: 'Founders Global', count: 372, color: '#666666', purpose: 'Direct clients, lower geo-priority', priority: 5, top: [
      { name: 'Aaron F', org: 'Innovation Works', country: 'US', title: 'Owner' },
      { name: 'Adam N', org: 'Blade', country: 'US', title: 'Founder' },
      { name: 'Abhishek Patil', org: 'GrowthX', country: 'IN', title: 'Founder' },
      { name: 'Ahmed Kanaan', org: 'Gener8tor', country: 'US', title: 'Engineer Founder' },
      { name: 'Akshay Buradkar', org: 'OCHO', country: 'US', title: 'Co-Founder & CTO' }
    ]}
  ];

  var activeSegment = null;

  // Playbooks: segment-specific email generation instructions
  var SIGNATURE_BLOCK = ' Sign off EXACTLY as: "Cristian Mendivelso | Founder, MOAT Labs | ' + WEBSITE_URL + '". No other signature variations.';
  var BOOKING_CTA = ' After closing line, add a P.S.: "P.S. Si te sirve, podés hacer el MOAT Score gratis en 5 min aquí: ' + WEBSITE_URL + '/moat-score — te devuelve un análisis personalizado con 3 palancas accionables. O si preferís call directo: ' + DISCOVERY_LINK + '"';
  var MOAT_SCORE_HOOK = ' IMPORTANT: Whenever possible, reference the free self-assessment at ' + WEBSITE_URL + '/moat-score as a low-commitment first step. It is the softest CTA we have and converts way better than asking for a 30-min call upfront.';

  var PLAYBOOKS = {
    vcs_latam: {
      label: 'VC LATAM',
      angle: 'Portfolio Round Readiness partner',
      instructions: 'You are writing to a VC partner in Latin America. MOAT Labs is NOT a consulting firm — we do Round Readiness Sprints (1-8 weeks, $3.5K-$5.5K) that leave founders ready to raise with defended valuation, MOAT thesis, deck, data room, and investor target list. Pitch angle: "Your portfolio founders who are about to raise in the next 6 months could benefit from an independent prep partner — we do not do intros, just the homework that saves them 3 months of back-and-forth with your associates." Tone: peer-to-peer, not salesy. 4-5 sentences. End with a soft ask for a 20-min call to explore if any portfolio founder is a fit.' + BOOKING_CTA + SIGNATURE_BLOCK
    },
    founders_latam: {
      label: 'Founder LATAM',
      angle: 'Round Readiness or MOAT Diagnosis',
      instructions: 'You are writing to a founder or CEO in Latin America. MOAT Labs has TWO products: (1) Round Readiness Sprint ($3,500-$5,500) for founders raising in next 6 months — we leave them ready to pitch with defended valuation, MOAT thesis, deck, data room, investor target list. No intros, no round management — they close with their own network. (2) MOAT Diagnosis ($10,500) for established companies defending margin against AI. ASK which situation they are in via a soft opener. Track record: Momenta raised $200K, Mozart AI preparing $4M round, 50+ empresas, $15M+ capital acompañado. Offer the free /moat-score self-assessment as the softest first step (5 min, PDF + email analysis). 4-5 sentences max, founder-to-founder tone, no corporate speak.' + MOAT_SCORE_HOOK + BOOKING_CTA + SIGNATURE_BLOCK
    },
    warm_latam: {
      label: 'LATAM Warm Network',
      angle: 'Relationship nurture + low-lift invite',
      instructions: 'You are writing to someone in our extended LATAM network. NOT a hard sell. Share something genuinely useful: an industry observation, a question about their business, or reference their recent work. Briefly mention: "Armamos un self-assessment gratis del MOAT Score en ' + WEBSITE_URL + '/moat-score — 7 preguntas, 5 min, te devolvés un PDF con 3 palancas accionables. Si tiene sentido para tu contexto, pruébalo." No pitch de servicio pagado. 3-4 sentences max. End with an open question, not a meeting request. Do NOT include the booking link P.S. for warm nurture.' + SIGNATURE_BLOCK
    },
    vcs_global: {
      label: 'VC Global',
      angle: 'LATAM Round Readiness bridge',
      instructions: 'You are writing to an international VC (US, Europe, Asia). Pitch MOAT Labs as the LATAM + US-Hispanic Round Readiness partner: "If your fund evaluates LATAM or US-Hispanic founders raising seed to Series A, our sprints deliver an independent defended valuation + MOAT thesis + deck + data room in 6-8 weeks. We do not intro or run the round — your associates continue driving diligence without conflict of interest." Track record: $15M+ capital acompañado. Acknowledge they get many cold emails. 3-4 sentences.' + BOOKING_CTA + SIGNATURE_BLOCK
    },
    founders_global: {
      label: 'Founder Global',
      angle: 'Round Readiness for US-Hispanic or LATAM-exposed',
      instructions: 'You are writing to a founder outside LATAM. If the company name or contact name suggests LATAM heritage (Spanish/Portuguese surname, Miami/Austin/LA base), pitch Round Readiness Sprint — same ($3.5K-$5.5K / US-Hispanic) as LATAM but delivered in English or Spanish. If no LATAM connection apparent, pitch MOAT Diagnosis ($10.5K) for defending margin against AI commoditization. Offer free /moat-score self-assessment first. Brief, professional, no fluff. 3-4 sentences.' + MOAT_SCORE_HOOK + BOOKING_CTA + SIGNATURE_BLOCK
    },
    default: {
      label: 'General',
      angle: 'Round Readiness + MOAT Score soft entry',
      instructions: 'You are writing a cold email for MOAT Labs. Two product tracks: (1) Round Readiness Sprint ($3,500-$5,500) — prep for founders raising in next 6 months (MOAT thesis + valuation + deck + data room + investor list, but NO intros, NO closing). (2) MOAT Diagnosis ($10,500) — defensibility roadmap for established companies facing AI disruption. Offer the free MOAT Score self-assessment at ' + WEBSITE_URL + '/moat-score as low-commitment first step. Be concise (4-5 sentences), peer-to-peer tone, end with soft ask.' + BOOKING_CTA + SIGNATURE_BLOCK
    }
  };

  var LATAM_COUNTRIES = ['MX', 'Mexico', 'CO', 'Colombia', 'AR', 'Argentina', 'BR', 'Brazil', 'Brasil', 'CL', 'Chile', 'PE', 'Peru', 'UY', 'Uruguay', 'EC', 'Ecuador', 'VE', 'Venezuela', 'PA', 'Panama', 'CR', 'Costa Rica', 'GT', 'Guatemala', 'DO', 'Dominican Republic', 'PY', 'Paraguay', 'BO', 'Bolivia', 'HN', 'Honduras', 'SV', 'El Salvador', 'NI', 'Nicaragua'];
  var VC_KEYWORDS = ['vc', 'venture', 'capital', 'fund', 'partner', 'investor', 'investment', 'lp', 'gp', 'managing partner', 'general partner', 'principal', 'associate'];
  var FOUNDER_KEYWORDS = ['founder', 'ceo', 'co-founder', 'cofounder', 'cto', 'coo', 'owner', 'director general'];

  function detectSegment(source, industry, country, contact) {
    var src = (source || '').toLowerCase().trim();
    // Direct match if Source already contains a segment ID
    if (PLAYBOOKS[src]) return src;

    var countryStr = (country || '').toLowerCase().trim();
    var isLatam = LATAM_COUNTRIES.some(function (c) { return countryStr.indexOf(c.toLowerCase()) !== -1; });
    var combined = ((industry || '') + ' ' + (contact || '') + ' ' + src).toLowerCase();
    var isVC = VC_KEYWORDS.some(function (k) { return combined.indexOf(k) !== -1; });
    var isFounder = FOUNDER_KEYWORDS.some(function (k) { return combined.indexOf(k) !== -1; });

    if (isLatam) {
      if (isVC) return 'vcs_latam';
      if (isFounder) return 'founders_latam';
      return 'warm_latam';
    }
    if (isVC) return 'vcs_global';
    if (isFounder) return 'founders_global';
    return 'default';
  }

  function getRecentContent(limit) {
    var content = sheetCache['Contenido'] || [];
    var published = content.filter(function (r) {
      return (field(r, 'Status') || '').toLowerCase() === 'publicado';
    });
    published.sort(function (a, b) {
      var da = new Date(field(a, 'Fecha') || 0);
      var db = new Date(field(b, 'Fecha') || 0);
      return db - da;
    });
    return published.slice(0, limit || 3).map(function (r) {
      return { title: field(r, 'Titulo') || '', platform: field(r, 'Plataforma') || '', date: field(r, 'Fecha') || '' };
    });
  }

  /** Render contact segment cards (VCs, Founders, Warm leads). */
  function renderSegments() {
    var summary = document.getElementById('segSummary');
    var detail = document.getElementById('segDetail');
    var totalEl = document.getElementById('segmentsTotal');
    if (!summary) return;

    var total = SEGMENTS.reduce(function (s, seg) { return s + seg.count; }, 0);
    if (totalEl) totalEl.textContent = total.toLocaleString() + ' contacts';

    clear(summary);
    clear(detail);

    SEGMENTS.forEach(function (seg) {
      var card = el('div', { className: 'seg-card' + (activeSegment === seg.id ? ' seg-card--active' : '') }, [
        el('div', { className: 'seg-card-top' }, [
          el('span', { className: 'seg-priority', textContent: 'P' + seg.priority, style: 'background:' + seg.color }),
          el('span', { className: 'seg-count', textContent: seg.count.toLocaleString(), style: 'color:' + seg.color })
        ]),
        el('div', { className: 'seg-label', textContent: seg.label }),
        el('div', { className: 'seg-purpose', textContent: seg.purpose })
      ]);
      card.onclick = function () {
        activeSegment = activeSegment === seg.id ? null : seg.id;
        renderSegments();
      };
      summary.appendChild(card);
    });

    if (activeSegment) {
      var seg = SEGMENTS.filter(function (s) { return s.id === activeSegment; })[0];
      if (seg && seg.top.length) {
        var header = el('div', { className: 'seg-detail-header' }, [
          el('span', { textContent: 'Top contacts -- ' + seg.label }),
          el('span', { className: 'seg-detail-note', textContent: seg.count + ' total in segment' })
        ]);
        detail.appendChild(header);
        seg.top.forEach(function (c) {
          var row = el('div', { className: 'seg-contact' }, [
            el('strong', { className: 'seg-contact-name', textContent: esc(c.name) }),
            el('span', { className: 'seg-contact-org', textContent: (c.title ? c.title + ' @ ' : '') + esc(c.org) }),
            c.country ? el('span', { className: 'seg-contact-country', textContent: c.country }) : null
          ]);
          detail.appendChild(row);
        });
      }
    }
  }

  var PROSPECT_PAGE_SIZE = 5;
  var prospectShowAll = false;
  var DISMISSED_KEY = 'moat_dismissed_prospects';

  function getDismissed() {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]'); } catch (e) { return []; }
  }

  function dismissProspect(id) {
    var list = getDismissed();
    if (list.indexOf(id) === -1) list.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
  }

  function addProspectToOutbound(lead) {
    var url = 'https://hook.us2.make.com/aogm20aq0jwjwpjeg0nfmtyuwww2i9gs';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Company: lead.Company || '',
        Contact: lead.Contact || '',
        Email: '',
        Industry: lead.Industry || '',
        Score: lead.Score || '70',
        LinkedIn: '',
        Country: lead.Country || '',
        Source: 'prospecting',
        Status: 'nuevo'
      })
    });
  }

  /** Render auto-discovered leads from weekly RSS+AI prospecting. @param {Array} prospecting */
  function renderProspecting(prospecting) {
    var container = document.getElementById('prospectingList');
    var countEl = document.getElementById('prospectingCount');
    if (!container) return;
    var dismissed = getDismissed();
    var items = prospecting.filter(function (r) {
      return field(r, 'Fecha') || field(r, 'Resultados');
    });
    var allLeads = [];
    items.forEach(function (row) {
      var date = field(row, 'Fecha') || '';
      var text = field(row, 'Resultados') || '';
      var parsed = parseLeads(text);
      if (parsed.length) {
        parsed.forEach(function (l) { l._date = date; });
        allLeads = allLeads.concat(parsed);
      } else if (text) {
        var firstLine = text.split('\n')[0].trim();
        var companyName = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
        allLeads.push({ Company: companyName, Reason: text.substring(0, 300), _date: date, _raw: true });
      }
    });

    // Filter out companies that are clearly NOT ICP (Fortune 500, Big 4, etc.)
    var NON_ICP = ['salesforce', 'deloitte', 'ey', 'ernst & young', 'ernst &amp; young',
      'mckinsey', 'accenture', 'tcs', 'tata consultancy', 'openai', 'google', 'microsoft',
      'ibm', 'amazon', 'meta', 'oracle', 'sap', 'pwc', 'kpmg', 'bain', 'bcg',
      'capgemini', 'infosys', 'wipro', 'cognizant', 'hp', 'dell', 'cisco', 'intel',
      'apple', 'nvidia', 'aws', 'uber', 'airbnb', 'stripe', 'shopify'];
    allLeads = allLeads.filter(function (l) {
      var name = (l.Company || '').toLowerCase().trim();
      for (var i = 0; i < NON_ICP.length; i++) {
        if (name === NON_ICP[i] || name.indexOf(NON_ICP[i]) === 0) return false;
      }
      return true;
    });

    // Deduplicate by company name -- keep highest score version
    var seen = {};
    var deduped = [];
    allLeads.forEach(function (l) {
      var key = (l.Company || '').toLowerCase().trim();
      if (!key) return;
      var existing = seen[key];
      if (!existing || (parseInt(l.Score) || 0) > (parseInt(existing.Score) || 0)) {
        if (existing) {
          var idx = deduped.indexOf(existing);
          if (idx !== -1) deduped.splice(idx, 1);
        }
        seen[key] = l;
        deduped.push(l);
      }
    });
    allLeads = deduped;

    // Filter out dismissed leads
    allLeads = allLeads.filter(function (l) {
      var id = (l.Company || '').toLowerCase().trim();
      return dismissed.indexOf(id) === -1;
    });

    if (countEl) countEl.textContent = allLeads.length + ' leads';
    if (!allLeads.length) {
      container.innerHTML = '<div class="empty-state">No prospecting data yet. Weekly auto-prospecting runs Mondays.</div>';
      return;
    }
    clear(container);

    var visible = prospectShowAll ? allLeads : allLeads.slice(0, PROSPECT_PAGE_SIZE);

    visible.forEach(function (lead) {
      var scoreNum = parseInt(lead.Score) || 0;
      var scoreClass = scoreNum >= 85 ? 'ob-score--hot' : scoreNum >= 70 ? 'ob-score--warm' : 'ob-score--cold';
      var dateStr = '';
      if (lead._date) {
        var d = parseDate(lead._date);
        if (d) dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        else dateStr = String(lead._date);
      }
      var leadId = (lead.Company || '').toLowerCase().trim();

      var addBtn = el('button', { className: 'prospect-action prospect-action--add', textContent: 'Add to Outbound' });
      addBtn.addEventListener('click', function () {
        addBtn.disabled = true;
        addBtn.textContent = 'Adding...';
        addProspectToOutbound(lead).then(function () {
          addBtn.textContent = 'Added';
          addBtn.className = 'prospect-action prospect-action--added';
          showToast(esc(lead.Company) + ' added to outbound', 'success');
        }).catch(function () {
          addBtn.disabled = false;
          addBtn.textContent = 'Add to Outbound';
          showToast('Failed to add lead', 'error');
        });
      });

      var dismissBtn = el('button', { className: 'prospect-action prospect-action--dismiss', textContent: 'Dismiss' });
      dismissBtn.addEventListener('click', function () {
        dismissProspect(leadId);
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        setTimeout(function () {
          card.remove();
          var remaining = container.querySelectorAll('.prospect-card').length;
          if (countEl) countEl.textContent = (allLeads.length - 1) + ' leads';
          if (!remaining) container.innerHTML = '<div class="empty-state">All leads reviewed. New leads appear after Monday auto-prospecting.</div>';
        }, 300);
      });

      var card = el('div', { className: 'prospect-card' + (lead._raw ? ' prospect-card--raw' : '') }, [
        el('div', { className: 'prospect-header' }, [
          el('div', {}, [
            el('strong', { className: 'prospect-company', textContent: esc(lead.Company || '') }),
            lead.Industry ? el('span', { className: 'prospect-industry', textContent: ' | ' + esc(lead.Industry) }) : null
          ]),
          el('div', { className: 'prospect-meta' }, [
            lead._raw ? el('span', { className: 'prospect-raw-badge', textContent: 'AI Summary' }) : null,
            scoreNum ? el('span', { className: 'ob-score ' + scoreClass, textContent: String(scoreNum) }) : null,
            lead.Country ? el('span', { className: 'prospect-country', textContent: esc(lead.Country) }) : null
          ])
        ]),
        lead.Reason ? el('div', { className: 'prospect-reason', textContent: esc(lead.Reason) }) : null,
        lead.Contact ? el('div', { className: 'prospect-contact', textContent: 'Contact: ' + esc(lead.Contact) }) : null,
        el('div', { className: 'prospect-footer' }, [
          dateStr ? el('span', { className: 'prospect-date', textContent: dateStr }) : null,
          el('div', { className: 'prospect-actions' }, [addBtn, dismissBtn])
        ])
      ]);
      container.appendChild(card);
    });

    // Show more / show less toggle
    if (allLeads.length > PROSPECT_PAGE_SIZE) {
      var remaining = allLeads.length - PROSPECT_PAGE_SIZE;
      var toggleBtn = el('button', {
        className: 'prospect-toggle',
        textContent: prospectShowAll ? 'Show less' : 'Show ' + remaining + ' more leads'
      });
      toggleBtn.addEventListener('click', function () {
        prospectShowAll = !prospectShowAll;
        renderProspecting(prospecting);
      });
      container.appendChild(toggleBtn);
    }
  }

  // Outbound Queue
  var NURTURE_STAGES = ['nuevo', 'contactado', 'respondio', 'reunion', 'convertido'];
  var NURTURE_LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', respondio: 'Respondio', reunion: 'Reunion', convertido: 'Convertido' };
  var NURTURE_NEXT = { nuevo: 'contactado', contactado: 'respondio', respondio: 'reunion', reunion: 'convertido' };
  var currentOutboundFilter = 'all';
  var cachedOutbound = [];

  /** Render outbound queue with lead cards, scoring, and nurture actions. @param {Array} outbound */
  function renderOutbound(outbound) {
    cachedOutbound = outbound;
    var container = document.getElementById('outboundList');
    var countEl = document.getElementById('outboundCount');
    var prospects = outbound.filter(function (r) {
      return field(r, 'Company') && field(r, 'Email') && field(r, 'Company') !== 'Company';
    });
    // Deduplicate by email (keep LAST occurrence = most recent update wins)
    var seen = {};
    for (var i = prospects.length - 1; i >= 0; i--) {
      var key = (field(prospects[i], 'Email') || '').toLowerCase();
      if (!key || key === 'test@test.com' || key === 'test2@test.com' || seen[key]) {
        prospects.splice(i, 1);
      } else {
        seen[key] = true;
      }
    }
    prospects.sort(function (a, b) {
      return (parseInt(field(b, 'Score')) || 0) - (parseInt(field(a, 'Score')) || 0);
    });
    countEl.textContent = prospects.length;

    renderNurtureFunnel(prospects);
    renderOutboundMetrics(prospects);
    renderSendVolume();
    setupFilters(prospects);

    var filtered = currentOutboundFilter === 'all' ? prospects : prospects.filter(function (r) {
      return (field(r, 'Status') || 'nuevo').toLowerCase() === currentOutboundFilter;
    });

    clear(container);

    if (!filtered.length) {
      var msg = currentOutboundFilter === 'all' ? 'No outbound prospects yet.' : 'No prospects in "' + NURTURE_LABELS[currentOutboundFilter] + '" stage.';
      container.appendChild(el('div', { className: 'empty-state', textContent: msg }));
      return;
    }

    filtered.forEach(function (r) {
      var company = field(r, 'Company');
      var contact = field(r, 'Contact');
      var email = field(r, 'Email');
      var industry = field(r, 'Industry');
      var score = parseInt(field(r, 'Score')) || 0;
      var linkedin = field(r, 'LinkedIn');
      var country = field(r, 'Country');
      var subject = field(r, 'Subject');
      var message = field(r, 'Message');
      var status = (field(r, 'Status') || 'nuevo').toLowerCase();
      var rowNum = r.__rowNum;

      var source = (field(r, 'Source') || '').toLowerCase().trim();
      var isManual = source === 'manual' || source === 'personal' || source === 'referido';
      var lastSent = field(r, 'LastSent') || '';
      var scoreClass = 'ob-score' + (score >= 85 ? ' ob-score--hot' : score >= 70 ? ' ob-score--warm' : ' ob-score--cold');
      var statusClass = 'ob-status ob-status--' + (NURTURE_STAGES.indexOf(status) >= 0 ? status : 'nuevo');

      // Warm sequence step: read from sheet (SeqStep column), fallback to inference
      var seqStep = parseInt(field(r, 'SeqStep')) || 0;
      if (!seqStep && !isManual) {
        if (status === 'nuevo') seqStep = 0;
        else if (status === 'contactado' && message) seqStep = 1;
        else if (status === 'respondio') seqStep = 3;
        else if (status === 'reunion' || status === 'convertido') seqStep = 3;
        else if (message) seqStep = 1;
      }

      var item = el('div', { className: 'ob-item' + (isManual ? ' ob-item--manual' : '') });

      var topLeft = el('div', { className: 'ob-top-left' });
      topLeft.appendChild(el('span', { className: 'ob-company', textContent: company }));
      if (contact) topLeft.appendChild(el('span', { className: 'ob-contact', textContent: ' - ' + contact }));
      // Source badge: Manual (you lead) vs Auto (automation pipeline)
      var sourceBadge = el('span', {
        className: isManual ? 'ob-source ob-source--manual' : 'ob-source ob-source--auto',
        textContent: isManual ? 'Manual' : 'Auto'
      });
      topLeft.appendChild(sourceBadge);
      // Playbook segment badge (auto leads only)
      if (!isManual) {
        var segId = detectSegment(source, industry, country, contact);
        var pb = PLAYBOOKS[segId] || PLAYBOOKS['default'];
        var segBadge = el('span', { className: 'ob-segment', textContent: pb.label, title: 'Playbook: ' + pb.angle });
        topLeft.appendChild(segBadge);
      }

      var topRight = el('div', { className: 'ob-top-right' });
      if (score) topRight.appendChild(el('span', { className: scoreClass, textContent: score }));
      topRight.appendChild(el('span', { className: statusClass, textContent: NURTURE_LABELS[status] || status }));
      if (NURTURE_NEXT[status]) {
        var advBtn = el('button', { className: 'ob-advance-btn', textContent: NURTURE_LABELS[NURTURE_NEXT[status]] });
        advBtn.addEventListener('click', function () {
          var newStatus = NURTURE_NEXT[status];

          function doAdvance() {
            r.Status = newStatus;
            showToast(company + ' advanced to ' + (NURTURE_LABELS[newStatus] || newStatus), 'success');
            renderOutbound(cachedOutbound);
            fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'advance_status', company: company, newStatus: newStatus, row: r.__rowNum })
            }).catch(function () {
              showToast('Status saved locally only', 'info');
            });
          }

          if (newStatus === 'reunion') {
            showDealModal(company, contact, email, industry, country, function (dealValue) {
              doAdvance();
              fetch(LEAD_TO_PIPELINE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company: company, contact: contact, email: email, industry: industry, country: country, dealValue: dealValue, stage: '1st Meeting' })
              }).then(function (res) { return res.json(); }).then(function () {
                showToast('Pipeline deal created for ' + company, 'success');
              }).catch(function () {
                showToast('Deal created locally -- sync may be delayed', 'info');
              });
            }, doAdvance);
          } else {
            doAdvance();
          }
        });
        topRight.appendChild(advBtn);
      }

      var top = el('div', { className: 'ob-top' }, [topLeft, topRight]);
      item.appendChild(top);

      var metaLine = [];
      if (email) metaLine.push(email);
      if (industry) metaLine.push(industry);
      if (country) metaLine.push(country);
      if (metaLine.length) {
        var metaDiv = el('div', { className: 'ob-email' });
        metaDiv.textContent = metaLine.join(' | ');
        if (linkedin) {
          var liLink = el('a', { href: 'https://' + linkedin, target: '_blank', className: 'ob-linkedin', textContent: 'LI' });
          metaDiv.appendChild(document.createTextNode(' '));
          metaDiv.appendChild(liLink);
        }
        item.appendChild(metaDiv);
      }

      // Warm sequence tracker (3-touch visual) -- auto leads only
      if (!isManual && status !== 'convertido' && status !== 'reunion') {
        var seqLabels = ['Touch 1', 'Follow-up', 'Break-up'];
        var seqTimings = [0, 3, 5]; // days to wait before next touch
        var seqTracker = el('div', { className: 'seq-tracker' });
        seqLabels.forEach(function (label, idx) {
          var stepCls = 'seq-step' + (idx < seqStep ? ' seq-step--done' : idx === seqStep ? ' seq-step--current' : '');
          seqTracker.appendChild(el('div', { className: stepCls }, [
            el('span', { className: 'seq-dot' }),
            el('span', { className: 'seq-label', textContent: label })
          ]));
          if (idx < seqLabels.length - 1) seqTracker.appendChild(el('div', { className: 'seq-line' + (idx < seqStep ? ' seq-line--done' : '') }));
        });
        // Show timing info if waiting for next touch
        if (lastSent && seqStep > 0 && seqStep < 3) {
          var sentDate = new Date(lastSent);
          var daysSince = Math.floor((Date.now() - sentDate.getTime()) / 86400000);
          var daysNeeded = seqTimings[seqStep] || 3;
          var daysLeft = daysNeeded - daysSince;
          var timingText = daysLeft > 0
            ? 'Next touch in ' + daysLeft + 'd'
            : 'Ready for next touch';
          var timingCls = 'seq-timing' + (daysLeft <= 0 ? ' seq-timing--ready' : '');
          seqTracker.appendChild(el('span', { className: timingCls, textContent: timingText }));
        }
        item.appendChild(seqTracker);
      }

      if (subject && message) {
        var preview = el('div', { className: 'ob-generated' });
        preview.appendChild(el('div', { className: 'ob-subject', textContent: 'Subject: ' + subject }));
        preview.appendChild(el('div', { className: 'ob-message', textContent: message.length > 160 ? message.substring(0, 160) + '...' : message }));
        item.appendChild(preview);
      }

      // Context panel for responded/meeting leads
      if (status === 'respondio' || status === 'reunion') {
        var segId = isManual ? null : detectSegment(source, industry, country, contact);
        var pb = segId ? (PLAYBOOKS[segId] || PLAYBOOKS['default']) : null;
        var touchLabel = seqStep === 1 ? 'Touch 1 (Initial)' : seqStep === 2 ? 'Touch 2 (Follow-up)' : seqStep === 3 ? 'Touch 3 (Break-up)' : 'Initial outreach';
        var daysSinceResponse = lastSent ? Math.floor((Date.now() - new Date(lastSent).getTime()) / 86400000) : 0;

        var ctx = el('div', { className: 'ob-context' });
        ctx.appendChild(el('div', { className: 'ob-context-header', textContent: status === 'respondio' ? 'Response Context' : 'Meeting Prep' }));

        var details = el('div', { className: 'ob-context-details' });
        details.appendChild(el('div', { className: 'ob-context-row' }, [
          el('span', { className: 'ob-context-key', textContent: 'Triggered by:' }),
          el('span', { textContent: touchLabel })
        ]));
        if (pb) {
          details.appendChild(el('div', { className: 'ob-context-row' }, [
            el('span', { className: 'ob-context-key', textContent: 'Playbook used:' }),
            el('span', { textContent: pb.label + ' -- ' + pb.angle })
          ]));
        }
        if (daysSinceResponse > 0) {
          details.appendChild(el('div', { className: 'ob-context-row' }, [
            el('span', { className: 'ob-context-key', textContent: 'Days since last touch:' }),
            el('span', { textContent: daysSinceResponse + 'd', className: daysSinceResponse > 2 ? 'ob-context-urgent' : '' })
          ]));
        }
        ctx.appendChild(details);

        // Suggested next actions
        var actionsHint = el('div', { className: 'ob-context-actions' });
        if (status === 'respondio') {
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '1. Reply within 24h to keep momentum' }));
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '2. Propose a 15-min call with 2-3 time options' }));
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '3. Advance to "Reunion" once call is booked' }));
        } else {
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '1. Prepare MOAT Score pitch deck for ' + (industry || 'their industry') }));
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '2. Research recent company news for conversation hooks' }));
          actionsHint.appendChild(el('div', { className: 'ob-context-action', textContent: '3. Define scope: $5K diagnostic or $10K full engagement' }));
        }
        ctx.appendChild(actionsHint);
        item.appendChild(ctx);
      }

      var actions = el('div', { className: 'ob-actions' });

      // Toggle manual/auto source
      var toggleBtn = el('button', {
        className: 'ob-btn ob-btn--toggle-source',
        textContent: isManual ? 'Switch to Auto' : 'Switch to Manual',
        title: isManual ? 'Enable automation for this lead' : 'Mark as your personal lead (no automation)'
      });
      toggleBtn.addEventListener('click', function () {
        var newSource = isManual ? 'auto' : 'manual';
        r.Source = newSource;
        showToast(company + ' marked as ' + newSource, 'info');
        fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_source', company: company, source: newSource, row: r.__rowNum })
        }).catch(function () {
          showToast('Source saved locally only', 'info');
        });
        renderOutbound(cachedOutbound);
      });

      var nextTouch = isManual ? 0 : (seqStep < 3 ? seqStep + 1 : seqStep);

      if (status !== 'convertido') {
        if (isManual) {
          // Manual leads: Compose (empty form, you write it) + optional AI assist
          var composeBtn = el('button', { className: 'ob-btn ob-btn--compose', textContent: subject ? 'Edit Draft' : 'Compose' });
          composeBtn.addEventListener('click', function () {
            showEditForm(item, actions, company, contact, email, industry, subject || '', message || '', rowNum, null, 0);
          });
          actions.appendChild(composeBtn);
        } else {
          // Auto leads: Generate (AI writes it, quality review gates it)
          var genBtn = el('button', { className: 'ob-btn ob-btn--generate', textContent: subject ? 'Regenerate' : 'Generate' });
          genBtn.addEventListener('click', function () {
            genBtn.disabled = true;
            genBtn.textContent = 'Generating...';
            var segmentId = detectSegment(source, industry, country, contact);
            var playbook = PLAYBOOKS[segmentId] || PLAYBOOKS['default'];
            var recentPosts = getRecentContent(3);
            var contentContext = recentPosts.length > 0
              ? recentPosts.map(function (p) { return p.title + ' (' + p.platform + ')'; }).join('; ')
              : '';
            fetch(OUTBOUND_GENERATE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ company: company, contact: contact, email: email, industry: industry, row: rowNum, playbook: playbook.instructions, segment: playbook.label, recentContent: contentContext, discoveryLink: DISCOVERY_LINK, website: WEBSITE_URL }),
            })
            .then(function (res) { return res.text(); })
            .then(function (text) {
              var subMatch = text.match(/\[SUBJECT\]([\s\S]*?)\[BODY\]/);
              var bodyMatch = text.match(/\[BODY\]([\s\S]*?)$/);
              var newSubject = subMatch ? subMatch[1].trim() : 'Follow up from MOAT Labs';
              var newBody = bodyMatch ? bodyMatch[1].trim() : text.trim();
              genBtn.textContent = 'Reviewing...';
              reviewContent('email', newSubject, newBody, { company: company, contact: contact, industry: industry })
              .then(function (review) {
                showEditForm(item, actions, company, contact, email, industry, newSubject, newBody, rowNum, review, nextTouch);
                genBtn.disabled = false;
                genBtn.textContent = 'Regenerate';
              });
            })
            .catch(function () {
              genBtn.disabled = false;
              genBtn.textContent = subject ? 'Regenerate' : 'Generate';
              showToast('Failed to generate email', 'error');
            });
          });
          actions.appendChild(genBtn);
        }

        if (subject && message) {
          var editBtn = el('button', { className: 'ob-btn ob-btn--edit', textContent: 'Edit' });
          editBtn.addEventListener('click', function () {
            showEditForm(item, actions, company, contact, email, industry, subject, message, rowNum, null, nextTouch);
          });
          actions.appendChild(editBtn);

          var sendBtn = el('button', { className: 'ob-btn ob-btn--send', textContent: 'Send' });
          sendBtn.addEventListener('click', function () {
            sendOutbound(sendBtn, email, subject, message, rowNum, nextTouch);
          });
          actions.appendChild(sendBtn);
        }
      } else {
        actions.appendChild(el('span', { className: 'ob-sent-label', textContent: 'Converted' }));
      }

      actions.appendChild(toggleBtn);
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  function renderNurtureFunnel(prospects) {
    var funnelEl = document.getElementById('obFunnel');
    if (!funnelEl) return;
    clear(funnelEl);
    var counts = {};
    NURTURE_STAGES.forEach(function (s) { counts[s] = 0; });
    prospects.forEach(function (r) {
      var st = (field(r, 'Status') || 'nuevo').toLowerCase();
      if (counts[st] !== undefined) counts[st]++;
      else counts.nuevo++;
    });
    NURTURE_STAGES.forEach(function (stage) {
      var stageEl = el('div', { className: 'ob-funnel-stage ob-funnel--' + stage });
      stageEl.appendChild(el('span', { className: 'ob-funnel-count', textContent: counts[stage] }));
      stageEl.appendChild(el('span', { className: 'ob-funnel-label', textContent: NURTURE_LABELS[stage] }));
      stageEl.addEventListener('click', function () {
        currentOutboundFilter = stage;
        renderOutbound(cachedOutbound);
      });
      funnelEl.appendChild(stageEl);
    });
  }

  function renderOutboundMetrics(prospects) {
    var metricsEl = document.getElementById('obMetrics');
    if (!metricsEl) return;
    clear(metricsEl);

    // Calculate metrics by segment
    var segMetrics = {};
    var touchMetrics = { 1: { sent: 0, responded: 0 }, 2: { sent: 0, responded: 0 }, 3: { sent: 0, responded: 0 } };
    var totalSent = 0, totalResponded = 0, totalMeetings = 0, totalConverted = 0;

    prospects.forEach(function (r) {
      var source = (field(r, 'Source') || '').toLowerCase().trim();
      var isManual = source === 'manual' || source === 'personal' || source === 'referido';
      if (isManual) return; // Only track auto leads

      var st = (field(r, 'Status') || 'nuevo').toLowerCase();
      var industry = field(r, 'Industry') || '';
      var country = field(r, 'Country') || '';
      var contact = field(r, 'Contact') || '';
      var step = parseInt(field(r, 'SeqStep')) || 0;
      var segId = detectSegment(source, industry, country, contact);
      var pb = PLAYBOOKS[segId] || PLAYBOOKS['default'];

      if (!segMetrics[segId]) segMetrics[segId] = { label: pb.label, sent: 0, responded: 0, meetings: 0, converted: 0, total: 0 };
      segMetrics[segId].total++;

      var isSent = st === 'contactado' || st === 'enviado' || st === 'respondio' || st === 'reunion' || st === 'convertido';
      if (isSent) { segMetrics[segId].sent++; totalSent++; }
      if (st === 'respondio' || st === 'reunion' || st === 'convertido') { segMetrics[segId].responded++; totalResponded++; }
      if (st === 'reunion' || st === 'convertido') { segMetrics[segId].meetings++; totalMeetings++; }
      if (st === 'convertido') { segMetrics[segId].converted++; totalConverted++; }

      // Touch effectiveness: which touch got the response?
      if ((st === 'respondio' || st === 'reunion' || st === 'convertido') && step > 0) {
        if (touchMetrics[step]) touchMetrics[step].responded++;
      }
      if (step > 0 && touchMetrics[step]) touchMetrics[step].sent++;
    });

    if (totalSent === 0) {
      metricsEl.appendChild(el('div', { className: 'ob-metrics-empty', textContent: 'Metrics will appear after first emails are sent.' }));
      return;
    }

    // Overall stats row
    var responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
    var meetingRate = totalResponded > 0 ? Math.round((totalMeetings / totalResponded) * 100) : 0;
    var conversionRate = totalSent > 0 ? Math.round((totalConverted / totalSent) * 100) : 0;

    var overallRow = el('div', { className: 'ob-metrics-overall' }, [
      el('div', { className: 'ob-metric-card' }, [
        el('span', { className: 'ob-metric-value', textContent: totalSent }),
        el('span', { className: 'ob-metric-label', textContent: 'Sent' })
      ]),
      el('div', { className: 'ob-metric-card' }, [
        el('span', { className: 'ob-metric-value', textContent: responseRate + '%' }),
        el('span', { className: 'ob-metric-label', textContent: 'Response Rate' })
      ]),
      el('div', { className: 'ob-metric-card' }, [
        el('span', { className: 'ob-metric-value', textContent: meetingRate + '%' }),
        el('span', { className: 'ob-metric-label', textContent: 'Meeting Rate' })
      ]),
      el('div', { className: 'ob-metric-card' }, [
        el('span', { className: 'ob-metric-value', textContent: conversionRate + '%' }),
        el('span', { className: 'ob-metric-label', textContent: 'Conversion' })
      ])
    ]);
    metricsEl.appendChild(overallRow);

    // Segment breakdown
    var segKeys = Object.keys(segMetrics).sort(function (a, b) {
      return segMetrics[b].sent - segMetrics[a].sent;
    });

    if (segKeys.length > 1) {
      var segTable = el('div', { className: 'ob-metrics-segments' });
      var header = el('div', { className: 'ob-seg-row ob-seg-row--header' }, [
        el('span', { textContent: 'Segment' }),
        el('span', { textContent: 'Sent' }),
        el('span', { textContent: 'Resp%' }),
        el('span', { textContent: 'Mtg%' }),
        el('span', { textContent: 'Conv%' })
      ]);
      segTable.appendChild(header);

      segKeys.forEach(function (key) {
        var s = segMetrics[key];
        var sResp = s.sent > 0 ? Math.round((s.responded / s.sent) * 100) : 0;
        var sMtg = s.responded > 0 ? Math.round((s.meetings / s.responded) * 100) : 0;
        var sConv = s.sent > 0 ? Math.round((s.converted / s.sent) * 100) : 0;
        var best = sResp >= responseRate && s.sent >= 3;
        segTable.appendChild(el('div', { className: 'ob-seg-row' + (best ? ' ob-seg-row--best' : '') }, [
          el('span', { className: 'ob-seg-label', textContent: s.label }),
          el('span', { textContent: s.sent }),
          el('span', { textContent: sResp + '%' }),
          el('span', { textContent: sMtg + '%' }),
          el('span', { textContent: sConv + '%' })
        ]));
      });
      metricsEl.appendChild(segTable);
    }

    // Touch effectiveness
    var touchRow = el('div', { className: 'ob-metrics-touches' });
    var touchLabels = { 1: 'Touch 1', 2: 'Follow-up', 3: 'Break-up' };
    [1, 2, 3].forEach(function (t) {
      var tm = touchMetrics[t];
      var tRate = tm.sent > 0 ? Math.round((tm.responded / tm.sent) * 100) : 0;
      touchRow.appendChild(el('div', { className: 'ob-touch-metric' }, [
        el('span', { className: 'ob-touch-label', textContent: touchLabels[t] }),
        el('span', { className: 'ob-touch-rate', textContent: tRate + '%' }),
        el('span', { className: 'ob-touch-count', textContent: tm.responded + '/' + tm.sent })
      ]));
    });
    metricsEl.appendChild(touchRow);
  }

  function renderSendVolume() {
    var existing = document.getElementById('sendVolume');
    if (existing) existing.parentNode.removeChild(existing);
    var container = document.getElementById('outboundList');
    if (!container) return;
    var sent = getDailySendCount();
    var pct = Math.min((sent / DAILY_SEND_LIMIT) * 100, 100);
    var cls = pct >= 90 ? 'send-volume-fill--danger' : pct >= 60 ? 'send-volume-fill--warning' : 'send-volume-fill--safe';
    var vol = el('div', { className: 'send-volume', id: 'sendVolume' });
    vol.appendChild(el('span', { textContent: 'Daily sends: ' + sent + '/' + DAILY_SEND_LIMIT }));
    var bar = el('div', { className: 'send-volume-bar' });
    var fill = el('div', { className: 'send-volume-fill ' + cls });
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    vol.appendChild(bar);
    if (pct >= 90) vol.appendChild(el('span', { className: 'review-spam--high', textContent: 'Limit reached', style: 'font-size:10px;padding:2px 6px;border-radius:4px' }));
    container.parentNode.insertBefore(vol, container);
  }

  /** Initialize outbound filter buttons and attach click handlers. @param {Array} prospects */
  function setupFilters(prospects) {
    var filtersEl = document.getElementById('obFilters');
    if (!filtersEl) return;
    var buttons = filtersEl.querySelectorAll('.ob-filter');
    buttons.forEach(function (btn) {
      var isActive = btn.getAttribute('data-stage') === currentOutboundFilter;
      btn.className = 'ob-filter' + (isActive ? ' ob-filter--active' : '');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
      btn.onclick = function () {
        currentOutboundFilter = btn.getAttribute('data-stage');
        buttons.forEach(function (b) {
          b.setAttribute('aria-selected', 'false');
          b.setAttribute('tabindex', '-1');
        });
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('tabindex', '0');
        renderOutbound(cachedOutbound);
      };
    });
    // Arrow key navigation between filter tabs
    filtersEl.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var btns = Array.prototype.slice.call(buttons);
      var idx = btns.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowRight' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
      btns[next].focus();
      btns[next].click();
    });
  }

  function showDealModal(company, contact, email, industry, country, onConfirm, onSkip) {
    var overlay = el('div', { className: 'deal-modal-overlay' });
    var modal = el('div', { className: 'deal-modal' });
    modal.appendChild(el('h3', { className: 'deal-modal-title', textContent: 'Create Pipeline Deal' }));
    modal.appendChild(el('p', { className: 'deal-modal-desc', textContent: 'Add ' + company + ' to your sales pipeline?' }));

    var form = el('div', { className: 'deal-modal-form' });
    form.appendChild(el('label', { textContent: 'Estimated Deal Value (USD)', className: 'deal-modal-label' }));
    var valInput = el('input', { type: 'number', className: 'deal-modal-input', value: '5000', min: '1000', step: '1000' });
    form.appendChild(valInput);

    var infoRow = el('div', { className: 'deal-modal-info' });
    infoRow.appendChild(el('span', { textContent: contact + ' | ' + (industry || 'N/A') + ' | ' + (country || 'N/A') }));
    form.appendChild(infoRow);
    modal.appendChild(form);

    var btns = el('div', { className: 'deal-modal-btns' });
    var confirmBtn = el('button', { className: 'deal-modal-btn deal-modal-btn--confirm', textContent: 'Create Deal' });
    var skipBtn = el('button', { className: 'deal-modal-btn deal-modal-btn--skip', textContent: 'Skip, just advance' });

    confirmBtn.addEventListener('click', function () {
      var val = valInput.value || '5000';
      overlay.remove();
      onConfirm(val);
    });
    skipBtn.addEventListener('click', function () {
      overlay.remove();
      if (onSkip) onSkip();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.remove(); if (onSkip) onSkip(); }
    });

    btns.appendChild(confirmBtn);
    btns.appendChild(skipBtn);
    modal.appendChild(btns);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    valInput.focus();
    valInput.select();
  }

  function showEditForm(item, actionsEl, company, contact, email, industry, subj, body, rowNum, review, seqStep) {
    var existing = item.querySelector('.ob-edit-form');
    if (existing) existing.parentNode.removeChild(existing);

    var form = el('div', { className: 'ob-edit-form' });
    var subInput = el('input', { type: 'text', className: 'ob-edit-subject', value: subj, placeholder: 'Subject line' });
    var bodyInput = el('textarea', { className: 'ob-edit-body', placeholder: 'Email body' });
    bodyInput.value = body;
    bodyInput.rows = 6;

    // Review results section
    var reviewSection = el('div', { className: 'review-section' });
    if (review) {
      reviewSection.appendChild(renderReviewBadge(review));
      reviewSection.appendChild(renderReviewDetail(review));
    }

    var formActions = el('div', { className: 'ob-form-actions' });

    // Review button for re-review after edits
    var reviewBtn = el('button', { className: 'ob-btn ob-btn--review', textContent: 'Review' });
    reviewBtn.addEventListener('click', function () {
      reviewBtn.disabled = true;
      reviewBtn.textContent = 'Reviewing...';
      reviewContent('email', subInput.value, bodyInput.value, { company: company, contact: contact, industry: industry })
      .then(function (newReview) {
        review = newReview;
        clear(reviewSection);
        reviewSection.appendChild(renderReviewBadge(newReview));
        reviewSection.appendChild(renderReviewDetail(newReview));
        reviewBtn.disabled = false;
        reviewBtn.textContent = 'Review';
        // Update send button state based on review
        updateSendState(saveBtn, newReview);
      });
    });

    var saveBtn = el('button', { className: 'ob-btn ob-btn--send', textContent: 'Send' });
    var cancelBtn = el('button', { className: 'ob-btn ob-btn--cancel', textContent: 'Cancel' });

    // Gate send button based on review score
    function updateSendState(btn, rev) {
      if (rev && rev.score < 70) {
        btn.disabled = true;
        btn.textContent = 'Revise first';
        btn.className = 'ob-btn ob-btn--blocked';
      } else {
        btn.disabled = false;
        btn.textContent = 'Send';
        btn.className = 'ob-btn ob-btn--send';
      }
    }
    if (review) updateSendState(saveBtn, review);

    cancelBtn.addEventListener('click', function () {
      form.parentNode.removeChild(form);
    });

    saveBtn.addEventListener('click', function () {
      sendOutbound(saveBtn, email, subInput.value, bodyInput.value, rowNum, seqStep || 0);
    });

    formActions.appendChild(reviewBtn);
    formActions.appendChild(saveBtn);
    formActions.appendChild(cancelBtn);
    form.appendChild(subInput);
    form.appendChild(bodyInput);
    form.appendChild(reviewSection);
    form.appendChild(formActions);

    item.insertBefore(form, actionsEl);
  }

  function sendOutbound(btn, email, subject, message, rowNum, seqStep) {
    var sent = getDailySendCount();
    var remaining = DAILY_SEND_LIMIT - sent;
    if (remaining <= 0) {
      showToast('Daily send limit reached (' + DAILY_SEND_LIMIT + '/day). Protects domain reputation. Resets tomorrow.', 'error');
      return;
    }
    var touchLabel = seqStep ? ' (Touch ' + seqStep + '/3)' : '';
    var warning = remaining <= 3 ? '\n\nWarning: ' + remaining + ' sends remaining today.' : '';
    if (!confirm('Send email to ' + email + '?' + touchLabel + '\n\nSubject: ' + subject + warning)) return;
    btn.disabled = true;
    btn.textContent = 'Sending...';
    var payload = { email: email, subject: subject, message: message, row: rowNum };
    if (seqStep) {
      payload.seqStep = seqStep;
      payload.lastSent = new Date().toISOString().slice(0, 10);
    }
    fetch(OUTBOUND_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .then(function (res) { return res.text(); })
    .then(function () {
      var count = incrementDailySend();
      btn.textContent = 'Sent!';
      btn.className = 'ob-btn ob-btn--sent';
      showToast('Email sent' + touchLabel + ' (' + count + '/' + DAILY_SEND_LIMIT + ' today)', 'success');
      setTimeout(function () { loadLiveData(); }, 2000);
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = 'Send';
      showToast('Failed to send email', 'error');
    });
  }

  /** Render accounting view with income, expenses, and net balance. @param {Array} contabilidad @param {Array} gastos */
  function renderContabilidad(contabilidad, gastos) {
    var ingresosEl = document.getElementById('ingresosList');
    var gastosEl = document.getElementById('gastosList');
    var totalIngresosEl = document.getElementById('totalIngresos');
    var totalPendienteEl = document.getElementById('totalPendiente');
    var totalGastosEl = document.getElementById('totalGastos');
    var balanceEl = document.getElementById('balanceNeto');

    if (!ingresosEl) return;

    // Ingresos (from Contabilidad tab)
    clear(ingresosEl);
    var totalCobrado = 0, totalDeben = 0, totalValor = 0;

    contabilidad.forEach(function (r) {
      var nombre = field(r, 'Nombre');
      if (!nombre) return;
      var empresa = field(r, 'Empresa') || '';
      var valor = parseFloat(String(field(r, 'Valor Deal')).replace(/[$,]/g, '')) || 0;
      var cumplidoRaw = field(r, 'Cumplido total') || '';
      var deben = parseFloat(String(field(r, 'Deben')).replace(/[$,]/g, '')) || 0;
      var dinero = parseFloat(String(field(r, 'Dinero')).replace(/[$,]/g, '')) || 0;
      var cuotas = field(r, 'Cuotas') || '';
      var pagosHechos = field(r, 'Cantidad de pagos hechos') || '';
      var estado = field(r, 'Estado pago') || '';

      totalValor += valor;
      totalCobrado += dinero;
      totalDeben += deben;

      var pctNum = parseFloat(String(cumplidoRaw).replace('%', '')) || 0;
      if (pctNum > 0 && pctNum <= 1) pctNum = pctNum * 100;
      var cumplido = pctNum.toFixed(0) + '%';
      var pctCls = pctNum >= 100 ? 'complete' : pctNum >= 50 ? 'partial' : 'low';

      var row = el('div', { className: 'contab-row' }, [
        el('div', { className: 'contab-info' }, [
          el('div', { className: 'contab-name', textContent: nombre + (empresa ? ' - ' + empresa : '') }),
          el('div', { className: 'contab-detail', textContent: pagosHechos + '/' + cuotas + ' cuotas -- ' + estado }),
        ]),
        el('div', { className: 'contab-amounts' }, [
          el('div', { className: 'contab-total', textContent: '$' + formatNumber(valor) }),
          el('div', { className: 'contab-progress contab-progress--' + pctCls, textContent: cumplido }),
        ]),
      ]);
      ingresosEl.appendChild(row);
    });

    if (!contabilidad.length || (contabilidad.length === 1 && !field(contabilidad[0], 'Nombre'))) {
      ingresosEl.appendChild(el('div', { className: 'empty-state', textContent: 'No client payments tracked yet' }));
    }

    // Gastos (from Gastos tab)
    clear(gastosEl);
    var totalGastosMes = 0;

    gastos.forEach(function (r) {
      var servicio = field(r, 'Servicio');
      if (!servicio) return;
      var monto = parseFloat(String(field(r, 'Monto USD')).replace(/[$,]/g, '')) || 0;
      var categoria = field(r, 'Categoria') || '';
      var ciclo = field(r, 'Ciclo') || '';
      var fechaRaw = field(r, 'Ultima Factura') || '';
      var fecha = fechaRaw;
      var dateMatch = String(fechaRaw).match(/Date\((\d+),(\d+),(\d+)\)/);
      if (dateMatch) {
        var d = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]), parseInt(dateMatch[3]));
        fecha = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
      }

      totalGastosMes += monto;

      var catCls = categoria.toLowerCase().replace(/\s/g, '');
      var row = el('div', { className: 'gasto-row' }, [
        el('div', { className: 'gasto-info' }, [
          el('div', { className: 'gasto-name', textContent: servicio }),
          el('div', { className: 'gasto-detail', textContent: categoria + ' -- ' + ciclo }),
        ]),
        el('div', { className: 'gasto-amount' }, [
          el('div', { className: 'gasto-value', textContent: '$' + monto.toFixed(2) }),
          el('div', { className: 'gasto-date', textContent: fecha }),
        ]),
      ]);
      gastosEl.appendChild(row);
    });

    if (!gastos.length) {
      gastosEl.appendChild(el('div', { className: 'empty-state', textContent: 'No expenses tracked yet' }));
    }

    totalIngresosEl.textContent = '$' + formatNumber(totalCobrado);
    totalPendienteEl.textContent = '$' + formatNumber(totalDeben);
    totalGastosEl.textContent = '$' + formatNumber(totalGastosMes);
    var balance = totalCobrado - totalGastosMes;
    balanceEl.textContent = (balance >= 0 ? '+' : '') + '$' + formatNumber(Math.abs(balance));
    balanceEl.className = 'contab-balance-value ' + (balance >= 0 ? 'contab-balance--positive' : 'contab-balance--negative');
  }

  /** Render financial waterfall chart showing money flow from collected to net. @param {Array} contabilidad @param {Array} gastos */
  function renderCascada(contabilidad, gastos) {
    var waterfallEl = document.getElementById('cascadaWaterfall');
    var pendingEl = document.getElementById('cascadaPending');
    if (!waterfallEl) return;

    // Calculate totals from Contabilidad
    var cobrado = 0, pendiente = 0;
    contabilidad.forEach(function (r) {
      if (!field(r, 'Nombre')) return;
      cobrado += parseFloat(String(field(r, 'Dinero')).replace(/[$,]/g, '')) || 0;
      pendiente += parseFloat(String(field(r, 'Deben')).replace(/[$,]/g, '')) || 0;
    });

    // Calculate tool expenses (monthly from Gastos, excluding Catalina/Contadoras/Impuesto)
    var toolsMonthly = 0;
    gastos.forEach(function (r) {
      var servicio = (field(r, 'Servicio') || '').toLowerCase();
      if (!servicio) return;
      if (servicio.indexOf('catalina') !== -1) return;
      if (servicio.indexOf('contadora') !== -1) return;
      if (servicio.indexOf('impuesto') !== -1) return;
      toolsMonthly += parseFloat(String(field(r, 'Monto USD')).replace(/[$,]/g, '')) || 0;
    });

    // Months of operation (from CONTADORAS_START to now)
    var now = new Date();
    var months = (now.getFullYear() - CONTADORAS_START.getFullYear()) * 12
      + (now.getMonth() - CONTADORAS_START.getMonth());
    if (months < 1) months = 1;

    // Waterfall steps
    var iva = cobrado * IVA_RATE;
    var catalina = cobrado * CATALINA_RATE;
    var impuesto = cobrado * TAX_RATE;
    var contadoras = CONTADORAS_MONTHLY * months;
    var herramientas = toolsMonthly * months;

    var totalObligaciones = iva + catalina + impuesto + contadoras + herramientas;
    var neto = cobrado - totalObligaciones;

    var steps = [
      { label: 'Cobrado', amount: cobrado, type: 'positive' },
      { label: 'IVA 19%', amount: -iva, type: 'deduction' },
      { label: 'Catalina 30%', amount: -catalina, type: 'deduction' },
      { label: 'Impuesto 18%', amount: -impuesto, type: 'deduction' },
      { label: 'Contadoras (' + months + ' meses)', amount: -contadoras, type: 'deduction' },
      { label: 'Herramientas (' + months + ' meses)', amount: -herramientas, type: 'deduction' },
      { label: 'NETO EN CARTERA', amount: neto, type: neto >= 0 ? 'final' : 'deduction' },
    ];

    function fmtUSD(n) { return (n < 0 ? '-' : '') + '$' + formatNumber(Math.abs(Math.round(n))); }
    function fmtCOP(n) { return (n < 0 ? '-' : '') + '$' + formatNumber(Math.abs(Math.round(n * USD_TO_COP))); }

    // Summary KPIs (Cobrado already shown in Contabilidad section above)
    document.getElementById('cascObligaciones').textContent = fmtUSD(totalObligaciones);
    var netoUsdEl = document.getElementById('cascNetoUSD');
    netoUsdEl.textContent = fmtUSD(neto);
    netoUsdEl.className = 'cascada-summary-value ' + (neto >= 0 ? 'cascada--green' : 'cascada--red');
    var netoCopEl = document.getElementById('cascNetoCOP');
    netoCopEl.textContent = fmtCOP(neto);
    netoCopEl.className = 'cascada-summary-value ' + (neto >= 0 ? 'cascada--green' : 'cascada--red');

    // Waterfall bars
    clear(waterfallEl);
    var maxAmount = cobrado || 1;

    steps.forEach(function (step, i) {
      var absAmount = Math.abs(step.amount);
      var pct = Math.max((absAmount / maxAmount) * 100, 2);

      var barEl = el('div', { className: 'casc-bar casc-bar--' + step.type, style: 'width:' + pct + '%' }, [
        el('span', { className: 'casc-bar-text', textContent: step.type === 'deduction' ? (((absAmount / cobrado) * 100).toFixed(0) + '%') : '' }),
      ]);

      var row = el('div', { className: 'casc-row' }, [
        el('span', { className: 'casc-label', textContent: step.label }),
        el('div', { className: 'casc-bar-wrap' }, [barEl]),
        el('div', { className: 'casc-amounts' }, [
          el('span', { className: 'casc-usd', textContent: fmtUSD(step.amount) }),
          el('span', { className: 'casc-cop', textContent: fmtCOP(step.amount) }),
        ]),
      ]);

      waterfallEl.appendChild(row);

      // Divider before final
      if (i === steps.length - 2) {
        waterfallEl.appendChild(el('hr', { className: 'casc-divider' }));
      }
    });

    // Pending section
    clear(pendingEl);
    if (pendiente > 0) {
      var pendNeto = pendiente - (pendiente * (IVA_RATE + CATALINA_RATE + TAX_RATE));
      pendingEl.innerHTML = 'Por cobrar: <strong>' + fmtUSD(pendiente) + '</strong> '
        + '(' + fmtCOP(pendiente) + ') '
        + '&rarr; despues de cascada te quedarian ~<strong>' + fmtUSD(pendNeto) + '</strong> '
        + '(' + fmtCOP(pendNeto) + ')';
    }
  }

  // Web Analytics (GA4 data -- demo until Make pipeline connected)
  var WA_DEMO = {
    sessions: { value: 847, trend: 12.3 },
    users: { value: 612, trend: 8.7 },
    bounceRate: { value: 1243, trend: 5.4 },
    avgDuration: { value: '1.5', trend: 3.1 },
    sources: [
      { label: 'Organic', pct: 38, color: 'var(--accent-bright)' },
      { label: 'LinkedIn', pct: 29, color: 'var(--accent)' },
      { label: 'Direct', pct: 18, color: 'var(--gold)' },
      { label: 'Referral', pct: 10, color: 'var(--success)' },
      { label: 'Email', pct: 5, color: 'var(--purple)' }
    ],
    pages: [
      { path: '/', views: 312 },
      { path: '/services', views: 189 },
      { path: '/about', views: 97 },
      { path: '/case-studies', views: 84 },
      { path: '/contact', views: 63 },
      { path: '/blog/moat-score', views: 51 }
    ]
  };

  function parseAnalyticsFromSheet(rows) {
    if (!rows || !rows.length) return null;
    var latest = rows[rows.length - 1];
    var sourcesRaw = field(latest, 'Sources');
    var pagesRaw = field(latest, 'Pages');
    if (!sourcesRaw && !pagesRaw) return null;

    var sourceColors = {
      'Organic Search': 'var(--accent-bright)', 'Paid Search': 'var(--gold)',
      'Direct': 'var(--gold)', 'Organic Social': 'var(--accent)', 'Social': 'var(--accent)',
      'Referral': 'var(--success)', 'Email': 'var(--purple)', 'Display': 'var(--warning)',
      'Unassigned': 'var(--text-muted)'
    };

    var sources = []; var totalSessions = 0; var totalUsers = 0; var totalPageViews = 0;

    var sourcesJson = null; var pagesJson = null;
    try { sourcesJson = JSON.parse(sourcesRaw); } catch (e) { sourcesJson = null; }
    try { pagesJson = JSON.parse(pagesRaw); } catch (e) { pagesJson = null; }

    if (sourcesJson && sourcesJson.rows) {
      sourcesJson.rows.forEach(function (row) {
        var name = row.dimensionValues && row.dimensionValues[0] ? row.dimensionValues[0].value : 'Unknown';
        var sess = row.metricValues && row.metricValues[0] ? parseInt(row.metricValues[0].value) || 0 : 0;
        var users = row.metricValues && row.metricValues[1] ? parseInt(row.metricValues[1].value) || 0 : 0;
        totalSessions += sess; totalUsers += users;
        sources.push({ label: name, sessions: sess, color: sourceColors[name] || 'var(--text-muted)' });
      });
    }

    sources.sort(function (a, b) { return b.sessions - a.sessions; });
    var totalForPct = totalSessions || 1;
    sources = sources.map(function (s) {
      return { label: s.label, pct: Math.round(s.sessions / totalForPct * 100), color: s.color };
    });

    var pages = [];
    if (pagesJson && pagesJson.rows) {
      pagesJson.rows.forEach(function (row) {
        var path = row.dimensionValues && row.dimensionValues[0] ? row.dimensionValues[0].value : '/';
        var views = row.metricValues && row.metricValues[0] ? parseInt(row.metricValues[0].value) || 0 : 0;
        totalPageViews += views;
        pages.push({ path: path, views: views });
      });
    }
    pages.sort(function (a, b) { return b.views - a.views; });

    if (!sources.length && !pages.length) return null;

    var avgPagesPerSession = totalSessions ? (totalPageViews / totalSessions) : 0;

    return {
      sessions: { value: totalSessions, trend: 0 },
      users: { value: totalUsers, trend: 0 },
      bounceRate: { value: totalPageViews, trend: 0 },
      avgDuration: { value: (Math.round(avgPagesPerSession * 10) / 10).toFixed(1), trend: 0 },
      sources: sources,
      pages: pages.slice(0, 10)
    };
  }

  /** Render GA4 web analytics: KPIs, traffic sources, and top pages. @param {Array} analyticsRows */
  function renderWebAnalytics(analyticsRows) {
    var kpisEl = document.getElementById('waKpis');
    var sourcesEl = document.getElementById('waSources');
    var pagesEl = document.getElementById('waPages');
    if (!kpisEl) return;
    clear(kpisEl); clear(sourcesEl); clear(pagesEl);

    var parsed = parseAnalyticsFromSheet(analyticsRows);
    var data = parsed || WA_DEMO;
    var periodEl = document.getElementById('waPeriod');
    if (periodEl) periodEl.textContent = parsed ? 'Last 7 days (live)' : 'Last 7 days (demo)';
    var kpis = [
      { value: data.sessions.value.toLocaleString(), label: 'Sessions', trend: data.sessions.trend },
      { value: data.users.value.toLocaleString(), label: 'Users', trend: data.users.trend },
      { value: data.bounceRate.value.toLocaleString(), label: 'Page Views', trend: data.bounceRate.trend },
      { value: data.avgDuration.value, label: 'Pages / Session', trend: data.avgDuration.trend }
    ];

    kpis.forEach(function (k) {
      var trendDir = k.trend > 0 ? 'up' : 'down';
      var trendSign = k.trend > 0 ? '+' : '';
      var kpiEl = el('div', { className: 'wa-kpi' }, [
        el('span', { className: 'wa-kpi-value', textContent: k.value }),
        el('span', { className: 'wa-kpi-label', textContent: k.label }),
        el('span', { className: 'wa-kpi-trend wa-kpi-trend--' + trendDir, textContent: trendSign + k.trend + '%' })
      ]);
      kpisEl.appendChild(kpiEl);
    });

    var maxPct = Math.max.apply(null, data.sources.map(function (s) { return s.pct; }));
    data.sources.forEach(function (s) {
      var barWidth = (s.pct / maxPct * 100).toFixed(0);
      var row = el('div', { className: 'wa-source-row' }, [
        el('span', { className: 'wa-source-label', textContent: s.label }),
        el('div', { className: 'wa-source-bar-bg' }, [
          el('div', { className: 'wa-source-bar', style: 'width:' + barWidth + '%;background:' + s.color })
        ]),
        el('span', { className: 'wa-source-pct', textContent: s.pct + '%' })
      ]);
      sourcesEl.appendChild(row);
    });

    data.pages.forEach(function (p) {
      var row = el('div', { className: 'wa-page-row' }, [
        el('span', { className: 'wa-page-path', textContent: p.path }),
        el('span', { className: 'wa-page-views', textContent: p.views.toLocaleString() + ' views' })
      ]);
      pagesEl.appendChild(row);
    });
  }

  /** Render content calendar with inline editing, approval, and image upload. @param {Array} contenido */
  function renderContent(contenido) {
    var listEl = document.getElementById('contentList');
    clear(listEl);

    if (!contenido.length) {
      listEl.appendChild(el('div', { className: 'empty-state', textContent: 'No content scheduled' }));
      return;
    }

    contenido.forEach(function (r) {
      var status = (r['Status'] || '').trim();
      var statusCls = status.toLowerCase().replace(/\s/g, '');
      var rowNum = r.__rowNum;
      var hook = r['Hook'] || '';
      var post = r['Post'] || '';
      var imageUrl = r['Image URL'] || '';

      // -- Top bar --
      var topRight = el('div', { style: 'display:flex;gap:6px;align-items:center;' }, [
        el('span', { className: 'content-type', textContent: r['Tipo'] || '' }),
        el('span', { className: 'content-status content-status--' + statusCls, textContent: status }),
      ]);
      var dayLabel = r['Dia'] || '';
      var weekLabel = r['Semana'] || '';
      var dateStr = weekLabel + (dayLabel ? ' - ' + dayLabel : '');
      var top = el('div', { className: 'content-top' }, [
        el('span', { className: 'content-date', textContent: dateStr }),
        topRight,
      ]);

      // -- View mode --
      var hookView = hook ? el('div', { className: 'content-hook', textContent: hook }) : null;
      var postView = el('div', { className: 'content-text', textContent: post });
      var imgPreview = imageUrl ? el('img', { className: 'content-img-preview', src: imageUrl, alt: 'Post image' }) : null;

      // -- Edit mode (hidden by default) --
      var hookInput = el('textarea', { className: 'ce-textarea ce-hook-input', rows: 2, placeholder: 'Hook (primera linea del post)', value: hook });
      hookInput.value = hook;
      var postInput = el('textarea', { className: 'ce-textarea ce-post-input', rows: 4, placeholder: 'Post body', value: post });
      postInput.value = post;
      var imgInput = el('input', { className: 'ce-img-input', type: 'text', placeholder: 'Image URL (optional)', value: imageUrl });
      imgInput.value = imageUrl;

      var fileInput = el('input', { type: 'file', accept: 'image/*', className: 'ce-file-input' });
      var imgEditPreview = el('div', { className: 'ce-img-edit-preview' });
      if (imageUrl) {
        imgEditPreview.innerHTML = '<img src="' + esc(imageUrl) + '" alt="preview">';
      }

      // File picker → show preview + set URL input
      fileInput.addEventListener('change', function () {
        var file = fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          imgEditPreview.innerHTML = '<img src="' + e.target.result + '" alt="preview">';
          imgInput.value = '';
          imgInput.dataset.localBase64 = e.target.result;
          imgInput.dataset.fileName = file.name;
          imgInput.placeholder = file.name + ' (will upload on save)';
        };
        reader.readAsDataURL(file);
      });

      // Clear image link when URL is manually typed
      imgInput.addEventListener('input', function () {
        delete imgInput.dataset.localBase64;
        delete imgInput.dataset.fileName;
        if (imgInput.value) {
          imgEditPreview.innerHTML = '<img src="' + esc(imgInput.value) + '" alt="preview" onerror="this.style.display=\'none\'">';
        } else {
          imgEditPreview.innerHTML = '';
        }
      });

      var editForm = el('div', { className: 'ce-edit-form', style: 'display:none;' }, [
        el('label', { className: 'ce-label', textContent: 'Hook' }),
        hookInput,
        el('label', { className: 'ce-label', textContent: 'Post' }),
        postInput,
        el('div', { className: 'ce-img-row' }, [
          el('div', { className: 'ce-img-inputs' }, [
            el('label', { className: 'ce-label', textContent: 'Image' }),
            imgInput,
            el('label', { className: 'ce-file-label' }, [
              fileInput,
              el('span', { className: 'ce-file-btn', textContent: 'Choose File' }),
            ]),
          ]),
          imgEditPreview,
        ]),
      ]);

      // -- View content container --
      var viewContent = el('div', { className: 'ce-view-content' });
      if (hookView) viewContent.appendChild(hookView);
      viewContent.appendChild(postView);
      if (imgPreview) viewContent.appendChild(imgPreview);

      // -- Metrics for published --
      if (status === CONTENT_STATUS.PUBLISHED) {
        viewContent.appendChild(el('div', { className: 'content-metrics' }, [
          el('span', { className: 'content-metric' }, ['Views: ', el('span', { textContent: r['Impresiones'] || '0' })]),
          el('span', { className: 'content-metric' }, ['Comments: ', el('span', { textContent: r['Comentarios'] || '0' })]),
          el('span', { className: 'content-metric' }, ['Leads: ', el('span', { textContent: r['Leads'] || '0' })]),
        ]));
      }

      // -- Action buttons --
      var savingIndicator = el('span', { className: 'ce-saving', textContent: '' });

      function doSave(newStatus, btn) {
        savingIndicator.textContent = 'Saving...';
        savingIndicator.className = 'ce-saving';
        if (btn) btn.disabled = true;

        var hasLocalFile = imgInput.dataset.localBase64 && !imgInput.value;

        function finishSave(resolvedUrl) {
          var payload = {
            row: rowNum,
            hook: hookInput.value,
            post: postInput.value,
            status: newStatus || status,
            imageUrl: resolvedUrl,
          };
          sendToWebhook(payload, function (err) {
            if (err) {
              savingIndicator.textContent = 'Error';
              savingIndicator.className = 'ce-saving ce-saving--error';
            } else {
              savingIndicator.textContent = 'Saved';
              savingIndicator.className = 'ce-saving ce-saving--ok';
              setTimeout(function () { loadLiveData(); }, 1500);
            }
            if (btn) btn.disabled = false;
          });
        }

        if (hasLocalFile) {
          savingIndicator.textContent = 'Uploading image...';
          uploadImage(imgInput.dataset.localBase64, imgInput.dataset.fileName || 'image.jpg', function (err, url) {
            if (err) {
              savingIndicator.textContent = 'Image upload failed';
              savingIndicator.className = 'ce-saving ce-saving--error';
              if (btn) btn.disabled = false;
              return;
            }
            imgInput.value = url;
            delete imgInput.dataset.localBase64;
            delete imgInput.dataset.fileName;
            finishSave(url);
          });
        } else {
          finishSave(imgInput.value || '');
        }
      }

      var editBtn = el('button', { className: 'ce-btn ce-btn--edit', textContent: 'Edit' });
      var reviewPostBtn = el('button', { className: 'ce-btn ob-btn--review', textContent: 'Review', style: 'display:none;' });
      var saveBtn = el('button', { className: 'ce-btn ce-btn--save', textContent: 'Save', style: 'display:none;' });
      var approveBtn = el('button', { className: 'ce-btn ce-btn--approve', textContent: 'Approve', style: 'display:none;' });
      var cancelBtn = el('button', { className: 'ce-btn ce-btn--cancel', textContent: 'Cancel', style: 'display:none;' });
      var postReviewSection = el('div', { className: 'review-section' });

      var isPublished = status === CONTENT_STATUS.PUBLISHED;

      reviewPostBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        reviewPostBtn.disabled = true;
        reviewPostBtn.textContent = 'Reviewing...';
        var fullPost = (hookInput.value ? hookInput.value + '\n\n' : '') + postInput.value;
        reviewContent('post', r['Tipo'] || 'LinkedIn Post', fullPost, { company: 'MOAT Labs', contact: '', industry: 'consulting' })
        .then(function (review) {
          clear(postReviewSection);
          postReviewSection.appendChild(renderReviewBadge(review));
          postReviewSection.appendChild(renderReviewDetail(review));
          reviewPostBtn.disabled = false;
          reviewPostBtn.textContent = 'Review';
        });
      });

      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        viewContent.style.display = 'none';
        editForm.style.display = '';
        editBtn.style.display = 'none';
        reviewPostBtn.style.display = '';
        saveBtn.style.display = '';
        if (status !== CONTENT_STATUS.APPROVED) approveBtn.style.display = '';
        cancelBtn.style.display = '';
        savingIndicator.textContent = '';
      });

      cancelBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        viewContent.style.display = '';
        editForm.style.display = 'none';
        editBtn.style.display = '';
        reviewPostBtn.style.display = 'none';
        saveBtn.style.display = 'none';
        approveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        hookInput.value = hook;
        postInput.value = post;
        imgInput.value = imageUrl;
        savingIndicator.textContent = '';
        clear(postReviewSection);
      });

      saveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        doSave(null, saveBtn);
      });

      approveBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        doSave(CONTENT_STATUS.APPROVED, approveBtn);
      });

      var actions = el('div', { className: 'ce-actions' }, [
        savingIndicator,
      ]);
      if (!isPublished) {
        actions.appendChild(editBtn);
        actions.appendChild(reviewPostBtn);
        actions.appendChild(saveBtn);
        actions.appendChild(approveBtn);
        actions.appendChild(cancelBtn);
      }

      var item = el('div', { className: 'content-item' + (isPublished ? ' content-item--published' : '') }, [
        top, viewContent, editForm, postReviewSection, actions,
      ]);

      listEl.appendChild(item);
    });
  }

  /** Render LinkedIn performance metrics with weekly trends and history. @param {Array} contenido @param {Array} metricas @param {Array} linkedin */
  function renderLinkedInPerformance(contenido, metricas, linkedin) {
    var published = contenido.filter(function (r) { return (r['Status'] || '').trim() === CONTENT_STATUS.PUBLISHED; });

    // Priority: LinkedIn tab > Metricas tab > Contenido tab
    var hasLinkedInTab = linkedin && linkedin.length > 0 && field(linkedin[0], 'Semana');
    var latest = metricas.length ? metricas[metricas.length - 1] : null;
    var hasLI = latest && (parseInt(field(latest, 'LI Impressions')) > 0 || parseInt(field(latest, 'Page Views')) > 0);

    var totalImpressions, engRate, totalLeads, postsCount;

    if (hasLinkedInTab) {
      // Use dedicated LinkedIn tab -- show latest week
      var liLatest = linkedin[linkedin.length - 1];
      totalImpressions = parseInt(field(liLatest, 'Impressions')) || 0;
      engRate = (parseFloat(field(liLatest, 'Engagement Rate')) || 0).toFixed(1);
      var followers = parseInt(field(liLatest, 'New Followers')) || 0;
      postsCount = parseInt(field(liLatest, 'Posts')) || published.length;
      var profileViews = parseInt(field(liLatest, 'Profile Views')) || 0;

      document.getElementById('liImpressions').textContent = formatNumber(totalImpressions);
      document.getElementById('liEngagement').textContent = engRate + '%';
      document.getElementById('liContentLeads').textContent = profileViews;
      document.querySelector('#liContentLeads + .li-kpi-label').textContent = 'Profile Views';
      document.getElementById('liPosts').textContent = postsCount;
      document.getElementById('liPeriod').textContent = field(liLatest, 'Semana') || 'This Week';

      // Trend arrows (compare last 2 weeks if available)
      if (linkedin.length >= 2) {
        var prev = linkedin[linkedin.length - 2];
        var prevImp = parseInt(field(prev, 'Impressions')) || 0;
        var prevEng = parseFloat(field(prev, 'Engagement Rate')) || 0;
        var prevPV = parseInt(field(prev, 'Profile Views')) || 0;
        var prevPosts = parseInt(field(prev, 'Posts')) || 0;
        setTrend('liImpressionsTrend', totalImpressions, prevImp);
        setTrend('liEngagementTrend', parseFloat(engRate), prevEng);
        setTrend('liContentLeadsTrend', profileViews, prevPV);
        setTrend('liPostsTrend', postsCount, prevPosts);
      }

      // Render weekly history chart
      renderLinkedInHistory(linkedin);
    } else if (hasLI) {
      totalImpressions = parseInt(field(latest, 'LI Impressions')) || 0;
      var engagement = parseFloat(field(latest, 'LI Engagement')) || 0;
      engRate = (engagement * 100).toFixed(1);
      var followersLI = parseInt(field(latest, 'Followers Gained')) || 0;
      postsCount = published.length;

      document.getElementById('liImpressions').textContent = formatNumber(totalImpressions);
      document.getElementById('liEngagement').textContent = engRate + '%';
      document.getElementById('liContentLeads').textContent = followersLI;
      document.querySelector('#liContentLeads + .li-kpi-label').textContent = 'New Followers';
      document.getElementById('liPosts').textContent = postsCount;
      document.getElementById('liPeriod').textContent = field(latest, 'Semana') || 'This Week';
    } else {
      totalImpressions = 0;
      var totalComments = 0;
      totalLeads = 0;
      published.forEach(function (r) {
        totalImpressions += parseInt(r['Impresiones']) || 0;
        totalComments += parseInt(r['Comentarios']) || 0;
        totalLeads += parseInt(r['Leads']) || 0;
      });
      engRate = totalImpressions > 0 ? ((totalComments / totalImpressions) * 100).toFixed(1) : '0.0';
      postsCount = published.length;

      document.getElementById('liImpressions').textContent = formatNumber(totalImpressions);
      document.getElementById('liEngagement').textContent = engRate + '%';
      document.getElementById('liContentLeads').textContent = totalLeads;
      document.getElementById('liPosts').textContent = postsCount;
      document.getElementById('liPeriod').textContent = 'This Week';
    }

    // Sort published posts by impressions for top posts
    var sorted = published.slice().sort(function (a, b) {
      return (parseInt(b['Impresiones']) || 0) - (parseInt(a['Impresiones']) || 0);
    });

    var topPostsEl = document.getElementById('liTopPosts');
    clear(topPostsEl);

    if (sorted.length === 0 && !hasLinkedInTab) {
      topPostsEl.appendChild(el('div', { className: 'empty-state', textContent: 'No published content yet' }));
      return;
    }

    if (sorted.length > 0) {
      topPostsEl.appendChild(el('div', { className: 'li-top-posts-title', textContent: 'Top Performing Posts' }));
      sorted.slice(0, 3).forEach(function (r, i) {
        var hook = r['Hook'] || r['Post'] || 'Untitled';
        var imp = parseInt(r['Impresiones']) || 0;
        var comm = parseInt(r['Comentarios']) || 0;
        var lds = parseInt(r['Leads']) || 0;
        var row = el('div', { className: 'li-post-row' }, [
          el('span', { className: 'li-post-rank', textContent: '0' + (i + 1) }),
          el('span', { className: 'li-post-hook', textContent: hook }),
          el('div', { className: 'li-post-stats' }, [
            el('span', { className: 'li-post-stat' }, [el('strong', { textContent: formatNumber(imp) }), ' views']),
            el('span', { className: 'li-post-stat' }, [el('strong', { textContent: comm }), ' comments']),
            el('span', { className: 'li-post-stat' }, [el('strong', { textContent: lds }), ' leads']),
          ]),
        ]);
        topPostsEl.appendChild(row);
      });
    }
  }

  function setTrend(elementId, current, previous) {
    var trendEl = document.getElementById(elementId);
    if (!trendEl) return;
    if (previous === 0) { trendEl.textContent = ''; return; }
    var pct = ((current - previous) / previous * 100).toFixed(0);
    var up = current >= previous;
    trendEl.textContent = (up ? '+' : '') + pct + '%';
    trendEl.style.color = up ? 'var(--success)' : 'var(--danger)';
  }

  function renderLinkedInHistory(linkedin) {
    var topPostsEl = document.getElementById('liTopPosts');
    if (!topPostsEl || linkedin.length < 2) return;

    topPostsEl.appendChild(el('div', { className: 'li-top-posts-title', textContent: 'Weekly Impressions Trend' }));
    var maxImp = 0;
    linkedin.forEach(function (r) {
      var v = parseInt(field(r, 'Impressions')) || 0;
      if (v > maxImp) maxImp = v;
    });
    var last8 = linkedin.slice(-8);
    var chartRow = el('div', { className: 'li-history-chart' });
    last8.forEach(function (r) {
      var imp = parseInt(field(r, 'Impressions')) || 0;
      var pct = maxImp > 0 ? (imp / maxImp * 100) : 0;
      var semana = field(r, 'Semana') || '';
      var bar = el('div', { className: 'li-history-bar-wrap' }, [
        el('div', { className: 'li-history-value', textContent: formatNumber(imp) }),
        el('div', { className: 'li-history-bar', style: 'height:' + Math.max(pct, 4) + '%' }),
        el('div', { className: 'li-history-label', textContent: semana })
      ]);
      chartRow.appendChild(bar);
    });
    topPostsEl.appendChild(chartRow);
  }

  // SSI Score
  var SSI_DATA = {
    score: 61,
    industryRank: 4,
    networkRank: 8,
    industryAvg: 42,
    networkAvg: 45,
    factors: [
      { label: 'Marca profesional', value: 12665, max: 25000, color: '#EF4444' },
      { label: 'Encontrar personas', value: 10539, max: 25000, color: '#3B82F6' },
      { label: 'Engagement (insights)', value: 13, max: 25000, color: '#0D9488' },
      { label: 'Crear relaciones', value: 25, max: 25000, color: '#6366F1' }
    ]
  };

  /** Render Social Selling Index score ring and factor breakdown. */
  function renderSSI() {
    var container = document.getElementById('ssiLayout');
    if (!container) return;
    clear(container);

    // Score ring + factors
    var scoreRing = el('div', { className: 'ssi-score-ring' }, [
      el('div', { className: 'ssi-ring' }, [
        el('svg', { viewBox: '0 0 120 120', className: 'ssi-ring-svg' }),
        el('div', { className: 'ssi-ring-value' }, [
          el('span', { className: 'ssi-ring-number', textContent: String(SSI_DATA.score) }),
          el('span', { className: 'ssi-ring-label', textContent: '/ 100' })
        ])
      ]),
      el('div', { className: 'ssi-comparisons' }, [
        el('div', { className: 'ssi-comparison' }, [
          el('span', { className: 'ssi-comp-label', textContent: 'Industry avg' }),
          el('span', { className: 'ssi-comp-value', textContent: String(SSI_DATA.industryAvg) })
        ]),
        el('div', { className: 'ssi-comparison' }, [
          el('span', { className: 'ssi-comp-label', textContent: 'Network avg' }),
          el('span', { className: 'ssi-comp-value', textContent: String(SSI_DATA.networkAvg) })
        ])
      ])
    ]);

    // Draw SVG ring
    var svg = scoreRing.querySelector('.ssi-ring-svg');
    var radius = 50;
    var circumference = 2 * Math.PI * radius;
    var pct = SSI_DATA.score / 100;
    var dashOffset = circumference * (1 - pct);
    svg.innerHTML = '<circle cx="60" cy="60" r="' + radius + '" fill="none" stroke="#E8E8E2" stroke-width="10"/>' +
      '<circle cx="60" cy="60" r="' + radius + '" fill="none" stroke="url(#ssiGrad)" stroke-width="10" ' +
      'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + dashOffset + '" ' +
      'stroke-linecap="round" transform="rotate(-90 60 60)"/>' +
      '<defs><linearGradient id="ssiGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#2563EB"/><stop offset="100%" stop-color="#2B4B8C"/></linearGradient></defs>';

    var factors = el('div', { className: 'ssi-factors' });
    SSI_DATA.factors.forEach(function (f) {
      var barPct = Math.min((f.value / f.max) * 100, 100).toFixed(0);
      var status = f.value < 1000 ? 'ssi-factor--weak' : '';
      var row = el('div', { className: 'ssi-factor ' + status }, [
        el('div', { className: 'ssi-factor-top' }, [
          el('span', { className: 'ssi-factor-label', textContent: f.label }),
          el('span', { className: 'ssi-factor-value', textContent: formatNumber(f.value) })
        ]),
        el('div', { className: 'audience-bar-bg' }, [
          el('div', { className: 'audience-bar', style: 'width:' + barPct + '%;background:' + f.color })
        ])
      ]);
      factors.appendChild(row);
    });

    container.appendChild(scoreRing);
    container.appendChild(factors);
  }

  // Audience Insights
  var AUDIENCE_DATA = {
    titulo: [
      { label: 'Cofundador', pct: 9.1 },
      { label: 'Fundador', pct: 7.5 },
      { label: 'CEO', pct: 6.8 },
      { label: 'Board Member', pct: 2.2 },
      { label: 'Director General', pct: 1.4 }
    ],
    ubicacion: [
      { label: 'Bogota', pct: 30.4 },
      { label: 'Buenos Aires', pct: 6.3 },
      { label: 'Ciudad de Mexico', pct: 5.0 },
      { label: 'Medellin', pct: 3.6 },
      { label: 'San Francisco', pct: 2.5 }
    ],
    sector: [
      { label: 'Tech & IT', pct: 10.1 },
      { label: 'IT Consulting', pct: 9.3 },
      { label: 'Financial Services', pct: 8.9 },
      { label: 'Consulting', pct: 8.1 },
      { label: 'VC / PE', pct: 7.8 }
    ],
    tamaño: [
      { label: '1-10', pct: 26.8 },
      { label: '11-50', pct: 22.2 },
      { label: '51-200', pct: 10.6 },
      { label: '10,001+', pct: 8.4 },
      { label: '1,001-5,000', pct: 7.3 }
    ]
  };

  /** Render LinkedIn audience demographics as horizontal bar charts. */
  function renderAudience() {
    var grid = document.getElementById('audienceGrid');
    if (!grid) return;
    clear(grid);

    var categories = [
      { key: 'titulo', title: 'Cargo', color: 'var(--accent-bright)' },
      { key: 'ubicacion', title: 'Ubicacion', color: 'var(--accent)' },
      { key: 'sector', title: 'Sector', color: 'var(--success)' },
      { key: 'tamaño', title: 'Company Size', color: 'var(--gold)' }
    ];

    categories.forEach(function (cat) {
      var items = AUDIENCE_DATA[cat.key];
      var maxPct = items[0].pct;
      var card = el('div', { className: 'audience-card' }, [
        el('h4', { className: 'audience-card-title', textContent: cat.title })
      ]);
      items.forEach(function (item) {
        var barWidth = (item.pct / maxPct * 100).toFixed(0);
        var row = el('div', { className: 'audience-row' }, [
          el('div', { className: 'audience-row-top' }, [
            el('span', { className: 'audience-row-label', textContent: item.label }),
            el('span', { className: 'audience-row-pct', textContent: item.pct + '%' })
          ]),
          el('div', { className: 'audience-bar-bg' }, [
            el('div', { className: 'audience-bar', style: 'width:' + barWidth + '%;background:' + cat.color })
          ])
        ]);
        card.appendChild(row);
      });
      grid.appendChild(card);
    });
  }

  /** Render sales velocity metrics: conversion rates, avg deal size, cost per lead. @param {Array} pipeline @param {Array} gastos @param {Array} contenido */
  function renderSalesVelocity(pipeline, gastos, contenido) {
    var stageCounts = { Lead: 0, '1st Meeting': 0, Closing: 0, Win: 0 };
    var winValues = [];
    pipeline.forEach(function (r) {
      var e = field(r, 'Etapa');
      if (stageCounts[e] !== undefined) stageCounts[e]++;
      if (e === 'Win') {
        var v = parseFloat(field(r, 'Valor Deal')) || 0;
        if (v > 0) winValues.push(v);
      }
    });

    // Update funnel bars
    var maxCount = Math.max(stageCounts.Lead, stageCounts['1st Meeting'], stageCounts.Closing, stageCounts.Win, 1);
    var barHeight = function (count) { return Math.max((count / maxCount) * 120, 8) + 'px'; };

    document.getElementById('velBarLead').style.height = barHeight(stageCounts.Lead);
    document.getElementById('velBarMeeting').style.height = barHeight(stageCounts['1st Meeting']);
    document.getElementById('velBarClosing').style.height = barHeight(stageCounts.Closing);
    document.getElementById('velBarWin').style.height = barHeight(stageCounts.Win);
    document.getElementById('velLead').textContent = stageCounts.Lead;
    document.getElementById('velMeeting').textContent = stageCounts['1st Meeting'];
    document.getElementById('velClosing').textContent = stageCounts.Closing;
    document.getElementById('velWin').textContent = stageCounts.Win;

    // Conversion rate: Lead-to-Win
    var totalEntered = stageCounts.Lead + stageCounts['1st Meeting'] + stageCounts.Closing + stageCounts.Win;
    var convRate = totalEntered > 0 ? ((stageCounts.Win / totalEntered) * 100).toFixed(0) : '0';
    document.getElementById('velConvRate').textContent = convRate + '%';

    // Avg deal size
    var avgDeal = winValues.length > 0 ? winValues.reduce(function (a, b) { return a + b; }, 0) / winValues.length : 0;
    document.getElementById('velAvgDeal').textContent = '$' + formatNumber(Math.round(avgDeal));

    // Cost per Lead (monthly gastos / active leads)
    var monthlyGastos = 0;
    gastos.forEach(function (r) {
      monthlyGastos += parseFloat(String(field(r, 'Monto USD')).replace(/[$,]/g, '')) || 0;
    });
    var activeLeads = stageCounts.Lead + stageCounts['1st Meeting'] + stageCounts.Closing + stageCounts.Win;
    var costPerLead = activeLeads > 0 ? (monthlyGastos / activeLeads).toFixed(0) : '0';
    document.getElementById('velCostPerLead').textContent = '$' + costPerLead;

    // Content ROI: Revenue from wins / monthly gastos
    var totalWinRev = winValues.reduce(function (a, b) { return a + b; }, 0);
    var roi = monthlyGastos > 0 ? (totalWinRev / monthlyGastos).toFixed(0) : '0';
    document.getElementById('velContentROI').textContent = roi + 'x';
  }

  /** Render 3-month revenue forecast based on pipeline and historical conversion. @param {Array} pipeline @param {Array} metricas */
  function renderForecast(pipeline, metricas) {
    var summaryEl = document.getElementById('forecastSummary');
    var barsEl = document.getElementById('forecastBars');
    var detailsEl = document.getElementById('forecastDetails');
    if (!summaryEl) return;

    // Historical conversion rates from metricas
    var totalLeads = 0, totalClosed = 0, totalRevenue = 0;
    metricas.forEach(function (r) {
      totalLeads += parseInt(field(r, 'Leads Nuevos')) || 0;
      totalClosed += parseInt(field(r, 'Cerrados') || field(r, 'Deals Ganados')) || 0;
      totalRevenue += parseFloat(field(r, 'Revenue')) || 0;
    });
    var weeksOfData = Math.max(metricas.length, 1);
    var convRate = totalLeads > 0 ? totalClosed / totalLeads : 0.15;
    var avgDealSize = totalClosed > 0 ? totalRevenue / totalClosed : 7500;
    var weeklyLeadRate = totalLeads / weeksOfData;

    // Current pipeline value by stage with weighted probabilities
    var stageProb = {};
    stageProb[STAGES.LEAD] = 0.10;
    stageProb[STAGES.MEETING] = 0.25;
    stageProb[STAGES.CLOSING] = 0.60;
    stageProb[STAGES.WIN] = 1.0;
    stageProb[STAGES.GAINBACK] = 0.05;
    var weightedPipeline = 0;
    var pipelineByStage = {};
    pipeline.forEach(function (r) {
      var stage = field(r, 'Etapa') || '';
      var val = parseFloat(field(r, 'Valor Deal')) || 0;
      var prob = stageProb[stage] || 0;
      weightedPipeline += val * prob;
      if (!pipelineByStage[stage]) pipelineByStage[stage] = { count: 0, value: 0 };
      pipelineByStage[stage].count++;
      pipelineByStage[stage].value += val;
    });

    // 3-month projections
    var months = [];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var now = new Date();
    for (var m = 1; m <= 3; m++) {
      var futureDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
      var weeksInMonth = 4.3;
      var newLeads = Math.round(weeklyLeadRate * weeksInMonth);
      var projectedCloses = Math.round(newLeads * convRate);
      var fromNewLeads = projectedCloses * avgDealSize;
      var fromPipeline = m === 1 ? weightedPipeline * 0.5 : m === 2 ? weightedPipeline * 0.3 : weightedPipeline * 0.2;
      var total = fromNewLeads + fromPipeline;
      // Apply cascada to show net
      var netRate = 1 - IVA_RATE - CATALINA_RATE - TAX_RATE;
      var netTotal = total * netRate;

      months.push({
        label: monthNames[futureDate.getMonth()] + ' ' + futureDate.getFullYear(),
        gross: Math.round(total),
        net: Math.round(netTotal),
        fromPipeline: Math.round(fromPipeline),
        fromNew: Math.round(fromNewLeads),
        newLeads: newLeads,
        closes: projectedCloses
      });
    }

    var totalGross3m = months.reduce(function (s, m) { return s + m.gross; }, 0);
    var totalNet3m = months.reduce(function (s, m) { return s + m.net; }, 0);

    // Summary
    clear(summaryEl);
    var summaryItems = [
      { label: 'Projected Gross (3mo)', value: '$' + formatNumber(totalGross3m), cls: '' },
      { label: 'Projected Net (3mo)', value: '$' + formatNumber(totalNet3m), cls: totalNet3m >= 0 ? 'forecast--green' : 'forecast--red' },
      { label: 'Conv. Rate', value: (convRate * 100).toFixed(1) + '%', cls: '' },
      { label: 'Avg Deal', value: '$' + formatNumber(Math.round(avgDealSize)), cls: '' },
      { label: 'Weighted Pipeline', value: '$' + formatNumber(Math.round(weightedPipeline)), cls: '' },
    ];
    summaryItems.forEach(function (item) {
      summaryEl.appendChild(el('div', { className: 'forecast-kpi' }, [
        el('span', { className: 'forecast-kpi-value ' + item.cls, textContent: item.value }),
        el('span', { className: 'forecast-kpi-label', textContent: item.label }),
      ]));
    });

    // Bars
    clear(barsEl);
    var maxGross = Math.max.apply(null, months.map(function (m) { return m.gross; })) || 1;
    months.forEach(function (m) {
      var pipelinePct = Math.max((m.fromPipeline / maxGross) * 100, 2);
      var newPct = Math.max((m.fromNew / maxGross) * 100, 2);
      var bar = el('div', { className: 'forecast-month' }, [
        el('div', { className: 'forecast-month-label', textContent: m.label }),
        el('div', { className: 'forecast-bar-stack' }, [
          el('div', { className: 'forecast-bar forecast-bar--pipeline', style: 'width:' + pipelinePct + '%' }),
          el('div', { className: 'forecast-bar forecast-bar--new', style: 'width:' + newPct + '%' }),
        ]),
        el('div', { className: 'forecast-month-amounts' }, [
          el('span', { className: 'forecast-gross', textContent: '$' + formatNumber(m.gross) }),
          el('span', { className: 'forecast-net', textContent: 'net $' + formatNumber(m.net) }),
        ]),
      ]);
      barsEl.appendChild(bar);
    });

    // Details legend
    clear(detailsEl);
    detailsEl.appendChild(el('div', { className: 'forecast-legend' }, [
      el('span', { className: 'forecast-legend-item' }, [
        el('span', { className: 'forecast-legend-color forecast-legend--pipeline' }),
        'From Pipeline',
      ]),
      el('span', { className: 'forecast-legend-item' }, [
        el('span', { className: 'forecast-legend-color forecast-legend--new' }),
        'From New Leads',
      ]),
    ]));
    detailsEl.appendChild(el('div', { className: 'forecast-assumptions', textContent:
      'Based on ' + weeksOfData + ' weeks of data. Lead rate: ~' + weeklyLeadRate.toFixed(1) + '/wk. Net = gross minus IVA 19% + Catalina 30% + Tax 18%.'
    }));
  }

  /** Render weekly metrics bar chart (leads, calls, proposals, closes). @param {Array} metricas */
  function renderChart(metricas) {
    var container = document.getElementById('chart');
    var legendEl = document.getElementById('chartLegend');

    var series = [
      { key: 'Leads Nuevos', cls: 'leads', color: '#2563EB', label: 'Leads' },
      { key: 'Calls', cls: 'calls', color: '#2B4B8C', label: 'Calls' },
      { key: 'Propuestas', cls: 'proposals', color: '#16A34A', label: 'Proposals' },
      { key: 'Cerrados', cls: 'closed', color: '#D4A149', label: 'Closed' },
    ];

    clear(legendEl);
    series.forEach(function (s) {
      legendEl.appendChild(el('span', { className: 'chart-legend-item' }, [
        el('span', { className: 'chart-legend-color', style: 'background:' + s.color }),
        s.label,
      ]));
    });

    var maxVal = 1;
    metricas.forEach(function (r) {
      series.forEach(function (s) {
        var v = parseInt(field(r, s.key)) || 0;
        if (v > maxVal) maxVal = v;
      });
    });

    clear(container);
    metricas.forEach(function (r) {
      var bars = el('div', { className: 'chart-bars' });
      series.forEach(function (s) {
        var v = parseInt(field(r, s.key)) || 0;
        var h = Math.max((v / maxVal) * 100, 3);
        var tooltip = el('div', { className: 'chart-bar-tooltip', textContent: s.label + ': ' + v });
        var bar = el('div', { className: 'chart-bar chart-bar--' + s.cls, style: 'height:' + h + '%' }, [tooltip]);
        bars.appendChild(bar);
      });

      var week = el('div', { className: 'chart-week' }, [
        bars,
        el('span', { className: 'chart-week-label', textContent: field(r, 'Semana') || '' }),
      ]);
      container.appendChild(week);
    });

    // Revenue row below chart
    var revenueEl = document.getElementById('chartRevenue');
    if (revenueEl) {
      clear(revenueEl);
      metricas.forEach(function (r) {
        var rev = parseFloat(field(r, 'Revenue')) || 0;
        var pipeVal = parseFloat(field(r, 'Pipeline Total')) || 0;
        var item = el('div', { className: 'chart-revenue-item' }, [
          el('div', { className: 'chart-revenue-value', textContent: rev > 0 ? '$' + formatNumber(rev) : '--' }),
          el('div', { className: 'chart-revenue-label', textContent: 'Revenue' }),
        ]);
        revenueEl.appendChild(item);
      });
    }
  }

  // Demo Data
  function loadDemoData() {
    var today = new Date();
    function daysAgo(n) {
      var d = new Date(today);
      d.setDate(d.getDate() - n);
      return d.toISOString().split('T')[0];
    }

    var pipeline = [
      { ID: '1', Nombre: 'Carlos Mendoza', Empresa: 'TechVentures MX', 'Revenue Estimado': '500000', Industria: 'Technology', Pais: 'Mexico', Email: 'carlos@techventures.mx', LinkedIn: '', Etapa: 'Lead', Fuente: 'LinkedIn', 'Producto Interes': 'Strategy Consulting', 'Valor Deal': '45000', 'Fecha Primer Contacto': daysAgo(12), 'Fecha Ultimo Contacto': daysAgo(12), 'Proximo Paso': 'Initial outreach', Notas: '' },
      { ID: '2', Nombre: 'Maria Fernanda Lopez', Empresa: 'Grupo Andino', 'Revenue Estimado': '2000000', Industria: 'Financial Services', Pais: 'Colombia', Email: 'mflopez@grupoandino.co', LinkedIn: '', Etapa: '1st Meeting', Fuente: 'Referral', 'Producto Interes': 'Digital Transformation', 'Valor Deal': '120000', 'Fecha Primer Contacto': daysAgo(20), 'Fecha Ultimo Contacto': daysAgo(8), 'Proximo Paso': 'Schedule discovery call', Notas: '' },
      { ID: '3', Nombre: 'Ricardo Alves', Empresa: 'NovaBank Brasil', 'Revenue Estimado': '10000000', Industria: 'Banking', Pais: 'Brazil', Email: 'ralves@novabank.br', LinkedIn: '', Etapa: '1st Meeting', Fuente: 'Conference', 'Producto Interes': 'AI Strategy', 'Valor Deal': '200000', 'Fecha Primer Contacto': daysAgo(15), 'Fecha Ultimo Contacto': daysAgo(3), 'Proximo Paso': 'Discovery call Mar 24', Notas: '' },
      { ID: '4', Nombre: 'Ana Gutierrez', Empresa: 'Seguro Total', 'Revenue Estimado': '5000000', Industria: 'Insurance', Pais: 'Chile', Email: 'agutierrez@segurototal.cl', LinkedIn: '', Etapa: 'Closing', Fuente: 'Inbound', 'Producto Interes': 'Market Entry Strategy', 'Valor Deal': '85000', 'Fecha Primer Contacto': daysAgo(30), 'Fecha Ultimo Contacto': daysAgo(2), 'Proximo Paso': 'Proposal review meeting', Notas: '' },
      { ID: '5', Nombre: 'Diego Herrera', Empresa: 'Fintech Labs', 'Revenue Estimado': '3000000', Industria: 'Fintech', Pais: 'Argentina', Email: 'diego@fintechlabs.ar', LinkedIn: '', Etapa: 'Closing', Fuente: 'LinkedIn', 'Producto Interes': 'Growth Strategy', 'Valor Deal': '65000', 'Fecha Primer Contacto': daysAgo(25), 'Fecha Ultimo Contacto': daysAgo(6), 'Proximo Paso': 'Follow up on proposal', Notas: '' },
      { ID: '6', Nombre: 'Patricia Rojas', Empresa: 'EcoEnergy Peru', 'Revenue Estimado': '8000000', Industria: 'Energy', Pais: 'Peru', Email: 'projas@ecoenergy.pe', LinkedIn: '', Etapa: 'Win', Fuente: 'Referral', 'Producto Interes': 'Operational Excellence', 'Valor Deal': '150000', 'Fecha Primer Contacto': daysAgo(45), 'Fecha Ultimo Contacto': daysAgo(5), 'Proximo Paso': 'Kickoff scheduled', Notas: '' },
      { ID: '7', Nombre: 'Fernando Castillo', Empresa: 'LogiTrans', 'Revenue Estimado': '1500000', Industria: 'Logistics', Pais: 'Mexico', Email: 'fcastillo@logitrans.mx', LinkedIn: '', Etapa: 'Lead', Fuente: 'Cold Outreach', 'Producto Interes': 'Supply Chain', 'Valor Deal': '35000', 'Fecha Primer Contacto': daysAgo(3), 'Fecha Ultimo Contacto': daysAgo(3), 'Proximo Paso': 'Send intro deck', Notas: '' },
      { ID: '8', Nombre: 'Valentina Morales', Empresa: 'HealthTech CO', 'Revenue Estimado': '4000000', Industria: 'Healthcare', Pais: 'Colombia', Email: 'vmorales@healthtech.co', LinkedIn: '', Etapa: '1st Meeting', Fuente: 'Webinar', 'Producto Interes': 'Digital Health Strategy', 'Valor Deal': '95000', 'Fecha Primer Contacto': daysAgo(10), 'Fecha Ultimo Contacto': daysAgo(10), 'Proximo Paso': 'Send case study', Notas: '' },
      { ID: '9', Nombre: 'Andres Villamizar', Empresa: 'ConstruPro', 'Revenue Estimado': '6000000', Industria: 'Construction', Pais: 'Colombia', Email: 'avillamizar@construpro.co', LinkedIn: '', Etapa: 'Closing', Fuente: 'LinkedIn', 'Producto Interes': 'Innovation Lab', 'Valor Deal': '110000', 'Fecha Primer Contacto': daysAgo(18), 'Fecha Ultimo Contacto': daysAgo(4), 'Proximo Paso': 'Technical deep-dive call', Notas: '' },
      { ID: '10', Nombre: 'Lucia Paredes', Empresa: 'RetailMax', 'Revenue Estimado': '12000000', Industria: 'Retail', Pais: 'Mexico', Email: 'lparedes@retailmax.mx', LinkedIn: '', Etapa: 'Win', Fuente: 'Conference', 'Producto Interes': 'Omnichannel Strategy', 'Valor Deal': '175000', 'Fecha Primer Contacto': daysAgo(60), 'Fecha Ultimo Contacto': daysAgo(10), 'Proximo Paso': 'Phase 2 planning', Notas: '' },
      { ID: '11', Nombre: 'Javier Perez', Empresa: 'AgroTech Solutions', 'Revenue Estimado': '2500000', Industria: 'Agriculture', Pais: 'Argentina', Email: 'jperez@agrotech.ar', LinkedIn: '', Etapa: 'Lead', Fuente: 'Inbound', 'Producto Interes': 'Precision Ag Strategy', 'Valor Deal': '55000', 'Fecha Primer Contacto': daysAgo(7), 'Fecha Ultimo Contacto': daysAgo(7), 'Proximo Paso': 'Qualify lead', Notas: '' },
      { ID: '12', Nombre: 'Camila Restrepo', Empresa: 'EdTech Latam', 'Revenue Estimado': '1000000', Industria: 'Education', Pais: 'Colombia', Email: 'crestrepo@edtechlatam.co', LinkedIn: '', Etapa: 'Lost', Fuente: 'Referral', 'Producto Interes': 'Go-to-Market', 'Valor Deal': '40000', 'Fecha Primer Contacto': daysAgo(40), 'Fecha Ultimo Contacto': daysAgo(15), 'Proximo Paso': '', Notas: 'Budget constraints' },
      { ID: '13', Nombre: 'Roberto Santos', Empresa: 'MedDevice BR', 'Revenue Estimado': '7000000', Industria: 'Medical Devices', Pais: 'Brazil', Email: 'rsantos@meddevice.br', LinkedIn: '', Etapa: 'Lead', Fuente: 'LinkedIn', 'Producto Interes': 'Regulatory Strategy', 'Valor Deal': '70000', 'Fecha Primer Contacto': daysAgo(5), 'Fecha Ultimo Contacto': daysAgo(5), 'Proximo Paso': 'Initial call', Notas: '' },
      { ID: '14', Nombre: 'Isabel Torres', Empresa: 'CloudSys Chile', 'Revenue Estimado': '3500000', Industria: 'SaaS', Pais: 'Chile', Email: 'itorres@cloudsys.cl', LinkedIn: '', Etapa: 'Gain back', Fuente: 'Cold Outreach', 'Producto Interes': 'Product Strategy', 'Valor Deal': '80000', 'Fecha Primer Contacto': daysAgo(14), 'Fecha Ultimo Contacto': daysAgo(2), 'Proximo Paso': 'Re-engage with new offer', Notas: '' },
      { ID: '15', Nombre: 'Miguel Ochoa', Empresa: 'PayLink', 'Revenue Estimado': '9000000', Industria: 'Payments', Pais: 'Mexico', Email: 'mochoa@paylink.mx', LinkedIn: '', Etapa: 'NO WAY JOSE', Fuente: 'Conference', 'Producto Interes': 'Expansion Strategy', 'Valor Deal': '130000', 'Fecha Primer Contacto': daysAgo(50), 'Fecha Ultimo Contacto': daysAgo(20), 'Proximo Paso': '', Notas: 'Went with competitor' },
    ];

    var contenido = [
      { Semana: 'W12', Dia: 'Lunes', Tipo: 'Insight', Hook: 'Las empresas que invierten en estrategia de AI antes que en herramientas ganan 3x mas rapido.', Post: 'Why LATAM enterprises are investing in AI strategy before AI tools -- and what this means for competitive moats in regulated industries.', Status: 'Publicado', Impresiones: '4230', Comentarios: '47', Leads: '3' },
      { Semana: 'W12', Dia: 'Miercoles', Tipo: 'Caso', Hook: 'Esta aseguradora chilena redujo fraude 73% con un roadmap de AI que costo menos que un hire.', Post: '5 frameworks we use with Fortune 500 clients to evaluate build vs. buy decisions for AI capabilities.', Status: 'Publicado', Impresiones: '6120', Comentarios: '83', Leads: '5' },
      { Semana: 'W12', Dia: 'Viernes', Tipo: 'Provocador', Hook: 'Si tu empresa necesita mas de 3 meses para implementar AI, el problema no es la tecnologia.', Post: 'Behind the scenes: How we ran a 2-week AI strategy sprint for a major insurance company in Chile. Results and methodology.', Status: 'Aprobado', Impresiones: '', Comentarios: '', Leads: '' },
      { Semana: 'W13', Dia: 'Lunes', Tipo: 'Insight', Hook: 'El costo oculto de no tener una estrategia de AI no es la tecnologia que no usas.', Post: 'The hidden cost of not having an AI strategy: A quantitative analysis of opportunity cost in financial services.', Status: 'Borrador', Impresiones: '', Comentarios: '', Leads: '' },
      { Semana: 'W13', Dia: 'Miercoles', Tipo: 'Caso', Hook: 'Un banco brasileno automatizo el 40% de sus procesos de compliance en 6 semanas.', Post: 'What is the biggest barrier to AI adoption in your organization?', Status: 'Borrador', Impresiones: '', Comentarios: '', Leads: '' },
      { Semana: 'W13', Dia: 'Viernes', Tipo: 'Provocador', Hook: 'La mayoria de consultoras de AI te venden herramientas. Nosotros construimos ventajas.', Post: 'How a Brazilian bank reduced fraud detection time by 73% with a structured AI implementation roadmap.', Status: 'Borrador', Impresiones: '', Comentarios: '', Leads: '' },
    ];

    var metricas = [
      { Semana: 'W7', 'Leads Nuevos': '6', Calls: '3', Propuestas: '1', Cerrados: '0', Revenue: '0', 'Pipeline Total': '320000' },
      { Semana: 'W8', 'Leads Nuevos': '8', Calls: '5', Propuestas: '2', Cerrados: '1', Revenue: '85000', 'Pipeline Total': '445000' },
      { Semana: 'W9', 'Leads Nuevos': '5', Calls: '4', Propuestas: '2', Cerrados: '0', Revenue: '0', 'Pipeline Total': '510000' },
      { Semana: 'W10', 'Leads Nuevos': '10', Calls: '6', Propuestas: '3', Cerrados: '1', Revenue: '150000', 'Pipeline Total': '680000' },
      { Semana: 'W11', 'Leads Nuevos': '7', Calls: '4', Propuestas: '1', Cerrados: '2', Revenue: '325000', 'Pipeline Total': '720000' },
      { Semana: 'W12', 'Leads Nuevos': '9', Calls: '7', Propuestas: '3', Cerrados: '1', Revenue: '175000', 'Pipeline Total': '895000' },
    ];

    var contabilidad = [
      { Nombre: 'Ivan', Empresa: 'Mozart AI', 'Valor Deal': '$3,000.00', Cuotas: '3', 'Cantidad de pagos hechos': '2', 'Dinero': '$2,000.00', 'Cumplido total': '66.67%', 'Deben': '$1,000.00', 'Estado pago': 'Pendiente' },
      { Nombre: 'Juliana', Empresa: 'Momenta', 'Valor Deal': '$1,875.00', Cuotas: '1', 'Cantidad de pagos hechos': '1', 'Dinero': '$1,875.00', 'Cumplido total': '100.00%', 'Deben': '$0.00', 'Estado pago': 'Pendiente' },
      { Nombre: 'Daniel', Empresa: 'AI Huevos', 'Valor Deal': '$5,800.00', Cuotas: '6', 'Cantidad de pagos hechos': '2', 'Dinero': '$1,933.33', 'Cumplido total': '33.33%', 'Deben': '$3,866.67', 'Estado pago': 'Pendiente' },
      { Nombre: 'Walter', Empresa: 'WCAR', 'Valor Deal': '$2,318.00', Cuotas: '1', 'Cantidad de pagos hechos': '1', 'Dinero': '$2,318.00', 'Cumplido total': '100.00%', 'Deben': '$0.00', 'Estado pago': 'Pendiente' },
      { Nombre: 'Kristina', Empresa: 'Certjoin', 'Valor Deal': '$1,200.00', Cuotas: '6', 'Cantidad de pagos hechos': '3', 'Dinero': '$600.00', 'Cumplido total': '50.00%', 'Deben': '$600.00', 'Estado pago': 'Pendiente' },
    ];

    var gastos = [
      { Servicio: 'Lovable', 'Monto USD': '50.00', Categoria: 'Dev Tools', Ciclo: 'Mensual', 'Ultima Factura': '05/03/2026' },
      { Servicio: 'HeyGen', 'Monto USD': '58.00', Categoria: 'Video/Content', Ciclo: 'Mensual', 'Ultima Factura': '02/03/2026' },
      { Servicio: 'Gamma', 'Monto USD': '18.00', Categoria: 'Presentaciones', Ciclo: 'Mensual', 'Ultima Factura': '02/03/2026' },
      { Servicio: 'Anthropic (Claude)', 'Monto USD': '10.00', Categoria: 'AI Tools', Ciclo: 'Variable', 'Ultima Factura': '16/03/2026' },
      { Servicio: 'Make.com', 'Monto USD': '9.00', Categoria: 'Automatizacion', Ciclo: 'Anual ($108)', 'Ultima Factura': '03/02/2026' },
      { Servicio: 'Figma', 'Monto USD': '15.00', Categoria: 'Diseno', Ciclo: 'Mensual', 'Ultima Factura': '15/03/2026' },
    ];

    var outbound = getDemoOutbound();

    var prospecting = [
      { Fecha: '2026-03-17', Resultados: 'Crane Worldwide Logistics expanding AI-driven supply chain operations in LATAM. New VP of Innovation hired. Ideal timing for MOAT diagnostic on competitive positioning.' },
      { Fecha: '2026-03-17', Resultados: 'Digi International IoT deployment growing in Brazil manufacturing sector. Partnership with local telcos signals market expansion. Potential for market entry strategy engagement.' },
      { Fecha: '2026-03-10', Resultados: 'Jobecam raised Series A for AI-powered video hiring in LATAM. Scaling from Brazil to Mexico and Colombia. Growth strategy consulting opportunity.' },
    ];

    render(pipeline, contenido, metricas, contabilidad, gastos, outbound, prospecting, [], []);
    scheduleRefresh(function () { if (!sheetId) loadDemoData(); });
  }

  function getDemoOutbound() {
    return [
      { Company: 'Crane', Contact: 'Fabio Shimana', Email: 'fabio@crane.is', Industry: 'Design Agency', Score: '92', LinkedIn: 'linkedin.com/in/fshimana', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'Crane is winning design briefs -- but AI is about to change how clients buy', Message: 'Fabio,\n\nDesign agencies that build AI into their delivery workflow are closing 40% faster than those still pitching the traditional way. The ones that wait 12 months will compete on price alone.\n\nAt MOAT Labs we help agencies like Crane identify exactly where AI amplifies your creative edge vs. where it commoditizes you -- and build a 90-day roadmap to stay ahead.\n\nWould a 20-minute call next week make sense? No pitch, just a diagnostic of where Crane stands on the AI readiness curve.\n\nBest,\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Digi', Contact: 'Cristiano Miano', Email: 'cristiano@digipronto.com.br', Industry: 'Digital Agency', Score: '91', LinkedIn: 'linkedin.com/in/cristianomiano', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'The digital agencies surviving 2027 all have one thing in common', Message: 'Cristiano,\n\nI have been studying how digital agencies in Brazil are responding to the AI wave. The pattern is clear: agencies that build AI-augmented service models now capture premium clients. Those that bolt on tools later end up in price wars.\n\nWe recently helped a 30-person agency restructure their offering around AI -- they increased average deal size 2.3x in 90 days.\n\nWould you be open to a quick conversation about where Digi fits on this spectrum? 20 minutes, zero sales pitch.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Jobecam', Contact: 'Eugenio De Carli', Email: 'eugenio.decarli@jobecam.com', Industry: 'Recruiting Tech', Score: '90', LinkedIn: 'linkedin.com/in/eugeniodecarli', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'Jobecam has the data moat -- but are you monetizing it?', Message: 'Eugenio,\n\nRecruiting platforms sitting on years of candidate data have an enormous AI advantage that most are not exploiting. The companies that build predictive hiring models from their existing data will own the next cycle. The ones that wait will watch OpenAI eat their market.\n\nAt MOAT Labs we help tech companies like Jobecam turn their data assets into defensible competitive advantages -- with a concrete 90-day execution plan.\n\nWorth a 20-minute call to explore? No deck, no pitch -- just a strategic conversation.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Descifra', Contact: 'Maria Fernanda Moreno', Email: 'mfmoreno@descifra.com', Industry: 'IT Consulting', Score: '89', LinkedIn: 'linkedin.com/in/mariafernandamorenodulche', Country: 'Mexico', Source: 'Vibe Prospecting', Subject: 'IT consultoras in Mexico are splitting into two camps', Message: 'Maria Fernanda,\n\nThe IT consulting market in Mexico is bifurcating fast: firms that embed AI into their consulting methodology command 3x margins. Those that sell hours watch utilization and rates both drop.\n\nWe work with consulting firms to design the AI-native service model -- not replacing consultants, but making each one 5x more valuable to clients.\n\nCould we schedule 20 minutes to discuss where Descifra sits in this shift? No agenda, just pattern-matching from the dozens of consulting firms we have analyzed.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Jaque Brenner', Contact: 'Jaqueline Brenner', Email: 'jaqueline@jaquebrenner.com', Industry: 'HR Consulting', Score: '88', LinkedIn: 'linkedin.com/in/jaquebrenner', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'HR consulting is getting disrupted -- but not the way people think', Message: 'Jaqueline,\n\nMost HR consultants fear AI will replace them. The real threat is different: AI is making internal HR teams so capable that external consultants must offer strategic-level insight or become irrelevant.\n\nWe help HR consulting firms reposition their offering around the problems AI creates (bias auditing, change management, workforce redesign) rather than the tasks AI automates.\n\n20-minute call to explore? Just a strategic conversation -- no pitch.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Short and Tall', Contact: 'Francisco Argerich', Email: 'pancho@short-tall.com', Industry: 'Advertising', Score: '88', LinkedIn: 'linkedin.com/in/panchoargerich', Country: 'Argentina', Source: 'Vibe Prospecting', Subject: 'Ad agencies in Argentina are about to face a pricing cliff', Message: 'Francisco,\n\nWhen clients can generate creative variations with AI in seconds, the traditional agency model breaks. But agencies that position themselves as strategic creative partners -- not production houses -- actually charge more.\n\nWe help agencies like Short and Tall identify which services to double down on, which to automate, and which to sunset -- with a 90-day execution plan.\n\nWorth a 20-minute conversation? Zero pitch, just an honest assessment of the landscape.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Zappts', Contact: 'Rodrigo Bornholdt', Email: 'rodrigo@zappts.com', Industry: 'Software Dev', Score: '87', LinkedIn: 'linkedin.com/in/rodrigobornholdt', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'Software dev shops that ignore AI will lose 60% of revenue by 2028', Message: 'Rodrigo,\n\nCoding copilots are cutting dev time in half. That means clients will expect to pay less -- unless your shop is selling outcomes, not hours. The dev companies winning right now are the ones who repositioned their offering before their clients asked.\n\nWe help software companies like Zappts design the transition from time-and-materials to AI-augmented outcome-based delivery.\n\n20 minutes for a quick strategic temperature check?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Grupo B&L', Contact: 'Jorge Lyon Anastassiou', Email: 'jorge@grupobyl.cl', Industry: 'Marketing Agency', Score: '86', LinkedIn: 'linkedin.com/in/jorge-lyon-anastassiou', Country: 'Chile', Source: 'Vibe Prospecting', Subject: 'Marketing agencies in Chile are underpricing their AI opportunity', Message: 'Jorge,\n\nChilean marketing agencies have a unique window: clients know they need AI but do not know how to buy it. The agencies that package AI-powered insights into their existing services will own the premium tier for the next 3 years.\n\nWe build exactly this kind of strategic positioning -- a 90-day roadmap from where you are today to an AI-differentiated offering.\n\nQuick 20-minute call to explore the opportunity?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Purple Metrics', Contact: 'Guta Tolmasquim', Email: 'guta@purplemetrics.com.br', Industry: 'Marketing Analytics', Score: '86', LinkedIn: 'linkedin.com/in/gutatolmasquim', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'Purple Metrics has the analytics moat -- the question is how to widen it', Message: 'Guta,\n\nMarketing analytics companies that layer AI prediction on top of their measurement data become indispensable. Those that stay in the dashboarding business get commoditized by the platforms themselves.\n\nWe help analytics companies identify the 2-3 AI capabilities that transform them from a reporting tool to a strategic decision engine -- and build the 90-day roadmap to get there.\n\n20 minutes to discuss? No pitch, just strategic pattern-matching.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Talentos IT', Contact: 'Rita Szerniak', Email: 'rita@talentosit.com.br', Industry: 'IT Staffing', Score: '85', LinkedIn: 'linkedin.com/in/ritadecassia', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'IT staffing firms that add AI screening will own the market', Message: 'Rita,\n\nIT staffing is being squeezed from both sides: AI tools help companies hire directly, and AI screening makes smaller firms as efficient as large ones. The staffing companies that survive will be those who use AI to offer something no platform can -- predictive talent matching.\n\nWe help staffing firms design this competitive moat with a 90-day strategic roadmap.\n\nWorth a quick 20-minute call?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Inercy Software', Contact: 'Erik Alejo', Email: 'erik@inercy.com', Industry: 'Software Dev', Score: '85', LinkedIn: 'linkedin.com/in/erikalejo', Country: 'Mexico', Source: 'Vibe Prospecting', Subject: 'Inercy is building software -- but is the business model AI-proof?', Message: 'Erik,\n\nMexican software shops are in a race: those that integrate AI into delivery reduce costs 40% and reinvest in higher-margin services. Those that sell the same way watch competitors undercut them.\n\nWe help companies like Inercy build the strategic framework for AI-native delivery before the market forces them into it.\n\n20 minutes for a diagnostic call? Just strategic insight, no pitch.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Lisa IT', Contact: 'Magali Rocha Cabral', Email: 'magali@lisait.com', Industry: 'IT Services', Score: '84', LinkedIn: 'linkedin.com/in/rochamagali1', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'IT services firms that build AI practices now will dominate 2028', Message: 'Magali,\n\nThe IT services firms that launch an AI practice today capture the early-mover premium. Those that wait for client demand will compete on price against firms that already have case studies and methodologies.\n\nWe design the launch strategy for AI service lines -- positioning, pricing, and a 90-day go-to-market plan.\n\nQuick 20-minute call to explore?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Laus', Contact: 'Miguel Angel Wong', Email: 'miguelangel@lausapp.com', Industry: 'Legal Tech', Score: '83', LinkedIn: 'linkedin.com/in/miguelangelwong', Country: 'Peru', Source: 'Vibe Prospecting', Subject: 'Legal tech in Peru is about to explode -- is Laus positioned to lead?', Message: 'Miguel Angel,\n\nAI is transforming legal tech faster than any vertical. The platforms that embed predictive AI into their workflows will command the market. Those that remain document-management tools will get disrupted.\n\nWe help legal tech companies identify their AI competitive advantage and build the 90-day roadmap to execute on it.\n\n20-minute strategic conversation? No pitch, just patterns from the industry.\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Iigual', Contact: 'Andrea Schwarz', Email: 'andrea@iigual.com.br', Industry: 'Staffing & Inclusion', Score: '82', LinkedIn: 'linkedin.com/in/andrea-schwarz', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'AI bias in hiring is creating a massive opportunity for Iigual', Message: 'Andrea,\n\nCompanies using AI for hiring are terrified of bias lawsuits. Inclusion-focused staffing firms that position themselves as the AI-bias auditing partner will capture a premium market that did not exist 12 months ago.\n\nWe help companies like Iigual design strategic positioning around emerging AI risks and build the offering to match.\n\n20 minutes to explore this angle?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Track.co', Contact: 'Tomas Duarte', Email: 'tomas@track.co', Industry: 'CX SaaS', Score: '81', LinkedIn: 'linkedin.com/in/tomasduarte', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'CX platforms that predict churn will replace those that just measure it', Message: 'Tomas,\n\nThe CX SaaS market is shifting from measurement to prediction. Platforms that use AI to predict churn before it happens will own enterprise contracts. Those that stay in NPS dashboards will get bundled into larger platforms.\n\nWe help SaaS companies identify the AI features that create defensible moats and build the strategic roadmap to launch them.\n\n20-minute call to discuss?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Ramper', Contact: 'Ricardo Correa', Email: 'ricardo@ramper.com.br', Industry: 'B2B SaaS', Score: '80', LinkedIn: 'linkedin.com/in/rlcorrea', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'B2B SaaS in Brazil -- the AI differentiation window is closing fast', Message: 'Ricardo,\n\nB2B SaaS companies that ship AI features in the next 6 months will set the standard. Those that wait will compete against products that already have them.\n\nWe help B2B SaaS companies design their AI product strategy -- which features to build, which to buy, and how to position the result for maximum competitive advantage.\n\n20 minutes for a strategic conversation?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'Modulo Security', Contact: 'Alberto Bastos', Email: 'abastos@modulo.com.br', Industry: 'IT Security', Score: '79', LinkedIn: 'linkedin.com/in/albertobastos', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'AI is creating new attack surfaces -- and new revenue for security firms', Message: 'Alberto,\n\nEvery company deploying AI is creating new attack surfaces they do not understand yet. Security firms that build AI-specific threat assessment capabilities will own the next wave of enterprise security budgets.\n\nWe help security companies design their AI strategy -- both using AI defensively and building services around the new threat landscape.\n\n20 minutes to explore?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
      { Company: 'mLabs', Contact: 'Carlos Saiani', Email: 'carlos.saiani@mlabs.com.br', Industry: 'Marketing SaaS', Score: '78', LinkedIn: 'linkedin.com/in/saiani', Country: 'Brazil', Source: 'Vibe Prospecting', Subject: 'Marketing SaaS tools without AI will lose to those that have it', Message: 'Carlos,\n\nThe marketing SaaS landscape is being reshaped: tools that generate content, predict performance, and optimize in real-time are pulling ahead. Those that remain scheduling-and-analytics platforms will get commoditized.\n\nWe help SaaS companies design the AI features that create competitive moats -- and the go-to-market strategy to position them.\n\n20 minutes for a strategic conversation?\n\nCristian Mendivelso\nMOAT Labs', Status: 'nuevo' },
    ];
  }

  // === v2 FEED =================================================
  function daysSinceDate(s) {
    if (!s) return Infinity;
    var d = new Date(s);
    if (isNaN(d.getTime())) return Infinity;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function buildFeedItems(pipeline, outbound) {
    var urgente = [], week = [], active = [];

    (outbound || []).forEach(function (r, idx) {
      var id = 'ob-' + idx;
      var status = (field(r, 'Status') || 'nuevo').toLowerCase();
      var company = field(r, 'Company') || '';
      var contact = field(r, 'Contact') || '';
      var industry = field(r, 'Industry') || '';
      var country = field(r, 'Country') || '';
      var seqStep = parseInt(field(r, 'SeqStep')) || 0;
      var lastSent = field(r, 'LastSent') || '';
      var days = daysSinceDate(lastSent);

      var title = contact ? (contact + (company ? ' \u00B7 ' + company : '')) : (company || 'Unknown');
      var meta = [industry, country].filter(Boolean).join(' \u00B7 ');

      if (status === 'respondio') {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Respondi\u00F3 \u00B7 revisar', actionLabel: 'Reply', actionKind: 'reply', source: r });
        return;
      }
      if (status === 'reunion' || status === 'convertido' || status === 'perdido') {
        if (status !== 'perdido') active.push({ id: id, kind: 'outbound', section: 'active', title: title, meta: meta + ' \u00B7 ' + status, actionLabel: 'Open', actionKind: 'open', source: r });
        return;
      }

      // Auto sequence timing: Touch 2 at 3d, Touch 3 at 5d (matches Make scenario 4498104)
      if (seqStep === 1 && days >= 3) {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Touch 2 listo \u00B7 ' + meta, actionLabel: 'Generate', actionKind: 'generate', source: r });
      } else if (seqStep === 2 && days >= 5) {
        urgente.push({ id: id, kind: 'outbound', section: 'urgente', title: title, meta: 'Touch 3 listo \u00B7 ' + meta, actionLabel: 'Generate', actionKind: 'generate', source: r });
      } else if (seqStep === 1 && days >= 1 && days < 3) {
        week.push({ id: id, kind: 'outbound', section: 'week', title: title, meta: 'Touch 2 en ' + (3 - days) + 'd', actionLabel: 'Open', actionKind: 'open', source: r });
      } else if (seqStep === 2 && days >= 3 && days < 5) {
        week.push({ id: id, kind: 'outbound', section: 'week', title: title, meta: 'Touch 3 en ' + (5 - days) + 'd', actionLabel: 'Open', actionKind: 'open', source: r });
      } else {
        active.push({ id: id, kind: 'outbound', section: 'active', title: title, meta: meta + (seqStep ? ' \u00B7 step ' + seqStep : ''), actionLabel: 'Open', actionKind: 'open', source: r });
      }
    });

    (pipeline || []).forEach(function (r, idx) {
      var id = 'pl-' + idx;
      var stage = field(r, 'Etapa') || '';
      if (stage === STAGES.LOST || stage === STAGES.NOWAY || stage === STAGES.WIN) return;

      var company = field(r, 'Empresa') || field(r, 'Company') || '';
      var contact = fullName(r);
      var val = parseFloat(String(field(r, 'Valor Deal') || '0').replace(/[$,]/g, '')) || 0;
      var valStr = val ? '$' + (val >= 1000 ? Math.round(val / 1000) + 'K' : val) : '';
      var title = (contact !== 'Unknown' ? contact : company) + (company && contact !== 'Unknown' ? ' \u00B7 ' + company : '');
      var meta = [stage, valStr].filter(Boolean).join(' \u00B7 ');

      // TODO(v3): add a NextStep/StageDate column in Pipeline sheet; use it to refine this rule.
      // v2 fallback: all Meeting-stage deals land in Urgente (user triages manually).
      if (stage === STAGES.MEETING) {
        urgente.push({ id: id, kind: 'pipeline', section: 'urgente', title: title, meta: meta + ' \u00B7 seguir paso', actionLabel: 'Advance', actionKind: 'advance', source: r });
      } else if (stage === STAGES.CLOSING) {
        week.push({ id: id, kind: 'pipeline', section: 'week', title: title, meta: meta + ' \u00B7 cerrando', actionLabel: 'Advance', actionKind: 'advance', source: r });
      } else {
        active.push({ id: id, kind: 'pipeline', section: 'active', title: title, meta: meta, actionLabel: 'Open', actionKind: 'open', source: r });
      }
    });

    return { urgente: urgente, week: week, active: active };
  }

  var _currentFeed = { urgente: [], week: [], active: [] };

  function renderFeedList(items, containerId, sectionClass) {
    var list = document.getElementById(containerId);
    if (!list) return;
    clear(list);
    if (items.length === 0) {
      list.appendChild(el('div', { className: 'feed-empty', textContent: 'Nada pendiente \uD83C\uDFAF' }));
      return;
    }
    items.forEach(function (it) {
      var item = el('div', {
        className: 'feed-item feed-item--' + sectionClass,
        'data-feed-id': it.id,
        onClick: function () { openDrawer(it.id); }
      }, [
        el('span', { className: 'feed-item__dot' }),
        el('div', { className: 'feed-item__main' }, [
          el('div', { className: 'feed-item__title', textContent: it.title }),
          el('div', { className: 'feed-item__meta', textContent: it.meta })
        ]),
        el('button', {
          className: 'feed-item__action',
          'data-action': it.actionKind,
          textContent: it.actionLabel,
          onClick: function (ev) {
            ev.stopPropagation();
            openDrawer(it.id);
          }
        })
      ]);
      list.appendChild(item);
    });
  }

  function renderFeed(pipeline, outbound) {
    _currentFeed = buildFeedItems(pipeline, outbound);
    renderFeedList(_currentFeed.urgente, 'feedListUrgente', 'urgente');
    renderFeedList(_currentFeed.week, 'feedListWeek', 'week');
    renderFeedList(_currentFeed.active, 'feedListActive', 'active');
    var cu = document.getElementById('feedCountUrgente'); if (cu) cu.textContent = _currentFeed.urgente.length;
    var cw = document.getElementById('feedCountWeek'); if (cw) cw.textContent = _currentFeed.week.length;
    var ca = document.getElementById('feedCountActive'); if (ca) ca.textContent = _currentFeed.active.length;
  }

  function wireFeedSectionToggles() {
    document.querySelectorAll('.feed-section__header').forEach(function (h) {
      h.addEventListener('click', function () {
        h.parentElement.classList.toggle('feed-section--collapsed');
      });
    });
  }

  function renderRevenueStrip(contabilidad) {
    var revenue = 0;
    (contabilidad || []).forEach(function (r) {
      revenue += parseFloat(String(field(r, 'Dinero')).replace(/[$,]/g, '')) || 0;
    });
    var pct = Math.min(Math.round((revenue / 100000) * 100), 100);
    var valEl = document.getElementById('revenueStripVal');
    var fillEl = document.getElementById('revenueStripFill');
    var pctEl = document.getElementById('revenueStripPct');
    if (valEl) valEl.textContent = '$' + revenue.toLocaleString('en-US');
    if (fillEl) fillEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '% of $100K';
  }
  // === END v2 FEED =============================================

  // === v2 DRAWER ==============================================
  var _drawerItem = null;

  function findFeedItem(id) {
    var pools = [_currentFeed.urgente, _currentFeed.week, _currentFeed.active];
    for (var i = 0; i < pools.length; i++) {
      for (var j = 0; j < pools[i].length; j++) {
        if (pools[i][j].id === id) return pools[i][j];
      }
    }
    return null;
  }

  function renderDrawerBody(item) {
    var body = document.getElementById('drawerBody');
    if (!body) return;
    clear(body);
    var r = item.source || {};

    function row(label, value) {
      if (!value) return null;
      return el('div', { className: 'drawer__row' }, [
        el('span', { className: 'drawer__row-label', textContent: label }),
        el('span', { className: 'drawer__row-value', textContent: String(value) })
      ]);
    }

    if (item.kind === 'outbound') {
      var status = field(r, 'Status') || 'nuevo';
      var seqStep = parseInt(field(r, 'SeqStep')) || 0;
      var lastSent = field(r, 'LastSent') || '';
      var score = field(r, 'Score') || '';
      var subj = field(r, 'Subject') || '';
      var msg = field(r, 'Message') || '';
      [
        row('Status', status),
        row('Industry', field(r, 'Industry')),
        row('Country', field(r, 'Country')),
        row('Score', score),
        row('Sequence step', seqStep ? 'Touch ' + seqStep : '\u2014'),
        row('Last sent', lastSent || '\u2014')
      ].filter(Boolean).forEach(function (n) { body.appendChild(n); });

      if (subj || msg) {
        body.appendChild(el('div', { className: 'drawer__section-title', textContent: 'Ultimo mensaje' }));
        if (subj) body.appendChild(el('div', { className: 'drawer__message', textContent: 'Asunto: ' + subj + '\n\n' + msg }));
        else body.appendChild(el('div', { className: 'drawer__message', textContent: msg }));
      }
    } else if (item.kind === 'pipeline') {
      [
        row('Etapa', field(r, 'Etapa')),
        row('Valor Deal', field(r, 'Valor Deal')),
        row('Empresa', field(r, 'Empresa') || field(r, 'Company')),
        row('Email', field(r, 'Email')),
        row('Notas', field(r, 'Notas') || field(r, 'Notes'))
      ].filter(Boolean).forEach(function (n) { body.appendChild(n); });
    }

    body.appendChild(el('div', { className: 'drawer__section-title', textContent: 'Acciones' }));
    var actions = el('div', { className: 'drawer__actions' });
    actions.appendChild(el('button', {
      className: 'drawer__action drawer__action--secondary',
      textContent: 'Open row in sheet',
      onClick: function () { window.open('https://docs.google.com/spreadsheets/d/1adMI9FgiVyTK2CJd18Bc0AMou7_lN-6mVF56VqUKkF4', '_blank'); }
    }));
    body.appendChild(actions);
  }

  function openDrawer(id) {
    var item = findFeedItem(id);
    if (!item) return;
    _drawerItem = item;
    var titleEl = document.getElementById('drawerTitle');
    if (titleEl) titleEl.textContent = item.title;
    renderDrawerBody(item);
    var drawer = document.getElementById('drawer');
    if (drawer) drawer.classList.add('drawer--open');
    var overlay = document.getElementById('drawerOverlay');
    if (overlay) {
      overlay.hidden = false;
      requestAnimationFrame(function () { overlay.classList.add('drawer-overlay--open'); });
    }
  }

  function closeDrawer() {
    var drawer = document.getElementById('drawer');
    if (drawer) drawer.classList.remove('drawer--open');
    var overlay = document.getElementById('drawerOverlay');
    if (overlay) {
      overlay.classList.remove('drawer-overlay--open');
      setTimeout(function () { overlay.hidden = true; }, 200);
    }
    _drawerItem = null;
  }

  function wireDrawer() {
    var close = document.getElementById('drawerClose');
    if (close) close.addEventListener('click', closeDrawer);
    var overlay = document.getElementById('drawerOverlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && _drawerItem) closeDrawer();
    });
  }
  // === END v2 DRAWER ==========================================

  document.addEventListener('DOMContentLoaded', init);
})();
