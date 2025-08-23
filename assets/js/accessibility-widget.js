// Accessibility Widget - v1.8 (Dynamic Theme & Contextual Reader)
// Author: CaTeIM
// Last update: 2025-08-23
// Features & Fixes:
// - NEW: Dynamic Theme Engine automatically adapts the widget's appearance to the host site's colors.
// - NEW: Contextual Reader announces the type of element (e.g., "Button", "Link") before its text.
// - NEW: Visual highlighter that follows the spoken text on the page.
// - NEW: Mini-player for playback control when the panel is minimized.
// - IMPROVEMENT: Advanced text normalization correctly pronounces emails, URLs, and pauses.
// - IMPROVEMENT: Smarter content detection prioritizes main content areas (<main>, <article>).
// - REFACTOR: Overhauled text extraction and speech queue for higher accuracy and stability.
// - UI: SVG icons for player controls and overall style enhancements.
// For a clean reset: localStorage.removeItem('aw_settings_v1'); location.reload();

(function () {
  if (window.__ACCESSIBILITY_WIDGET_LOADED__) {
    console.warn('AccessibilityWidget: already loaded. Aborting duplicate instance.');
    return;
  }
  window.__ACCESSIBILITY_WIDGET_LOADED__ = true;

  const STORAGE_KEY = 'aw_settings_v1';

  const safeLoad = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.warn('AccessibilityWidget: invalid settings', e);
      return {};
    }
  };

  const safeSave = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('AccessibilityWidget: could not save settings', e);
    }
  };

  const defaults = {
    fontSize: 16,
    highContrast: false,
    disableAnimations: false,
    rate: 1,
    pitch: 1,
    voiceIndex: -1,
    hidden: false,
    minimized: true,
    lang: 'auto'
  };

  const saved = safeLoad();
  const state = { ...defaults, ...saved };
  // Ensure that if 'minimized' was never saved, it defaults to true
  if (!Object.prototype.hasOwnProperty.call(saved, 'minimized')) {
    state.minimized = true;
  }

  // -------------------------
  // Language helpers
  // -------------------------
  const normalizeLangTag = (tag) => {
    if (!tag) return '';
    const lowerTag = tag.toLowerCase();
    return lowerTag.startsWith('pt') ? 'pt-BR' : 'en-US';
  };
  const detectPageLanguage = () => {
    try {
      const htmlLang = (document.documentElement && document.documentElement.lang) ? document.documentElement.lang.trim() : '';
      if (htmlLang) return normalizeLangTag(htmlLang);
      const metaLang = (document.querySelector('meta[name="language"]') || {}).content || '';
      if (metaLang) return normalizeLangTag(metaLang);
      return 'en-US';
    } catch (e) {
      return 'en-US';
    }
  };
  const getEffectiveLang = () => {
    if (state.lang && state.lang !== 'auto') return state.lang;
    return detectPageLanguage();
  };

  // -------------------------
  // Spoken email conversion
  // -------------------------
  const spokenEmail = (text, langTag) => {
    if (!text) return text;
    try {
      langTag = langTag || getEffectiveLang();
      const replaceLogic = langTag.startsWith('pt') ?
        { at: 'arroba', domain: ' ponto ' } : { at: 'at', domain: ' dot ' };
      return text.replace(/([^\s@]+)@([^\s@]+)/g, (match, local, domain) => {
        const spokenDomain = domain.split('.').map(p => p.trim()).filter(Boolean).join(replaceLogic.domain);
        return `${local.trim()} ${replaceLogic.at} ${spokenDomain}`.trim();
      });
    } catch (e) {
      return text;
    }
  };

    // -------------------------
    // Domain protection & chunking
    // -------------------------
    function normalizeTextForReading(text) {
      if (!text) return '';

      const lang = getEffectiveLang();
      const isPt = lang.startsWith('pt');
      const at = isPt ? ' arroba ' : ' at ';
      const dot = isPt ? ' ponto ' : ' dot ';

      // 1. Lida com e-mails primeiro, convertendo-os para uma forma falada
      text = text.replace(/([^\s@]+)@([^\s@]+)/g, (match, local, domain) => {
          const spokenDomain = domain.replace(/\./g, dot);
          return `${local.trim()}${at}${spokenDomain}`.trim();
      });

      // 2. Lida com domínios/URLs que não são e-mails
      // A regex usa "negative lookbehind" ((?<!@)) para não pegar e-mails de novo
      // e ((?<!\d)) para não pegar números como 1.50
      text = text.replace(/(?<!@|\d)\b([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z.]{2,})\b/g, (match) => {
          // Ignora abreviações comuns para não estragá-las (ex: U.S.A.)
          if (match.match(/^[A-Z]\.[A-Z]/)) {
              return match;
          }
          return match.replace(/\./g, dot);
      });

      // 3. Normaliza quebras de linha e pontuação para pausas corretas
      let t = text.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '.\n').replace(/\n/g, '. ');
      try {
          // Adiciona espaço após pontuação para separar frases
          t = t.replace(/([.!?…])(\p{Lu}|\d|["'“”])/gu, '$1 $2');
      } catch (e) {
          t = t.replace(/([.!?…])([A-Z0-9"'])/g, '$1 $2');
      }

      // 4. Limpeza final
      t = t.replace(/\s{2,}/g, ' ').trim();
      return t;
    }

    // -------------------------
    // Domain protection & chunking
    // -------------------------
    function splitToChunks(mappedText, maxLen = 220) {
      if (!mappedText || !mappedText.length) return [];

      const chunks = [];
      let currentChunk = { text: '', elements: [] };

      mappedText.forEach(item => {
        // O ponto final que adicionamos para pausas não precisa ser lido
        if (item.text === '.') {
            if (currentChunk.text) {
                chunks.push(currentChunk);
                currentChunk = { text: '', elements: [] };
            }
            return;
        }

        const processedText = normalizeTextForReading(item.text);

        if ((currentChunk.text + ' ' + processedText).trim().length > maxLen && currentChunk.text) {
          chunks.push(currentChunk);
          currentChunk = { text: processedText, elements: [item.element] };
        } else {
          currentChunk.text = (currentChunk.text + ' ' + processedText).trim();
          if (!currentChunk.elements.includes(item.element)) {
            currentChunk.elements.push(item.element);
          }
        }
      });

      if (currentChunk.text) {
        chunks.push(currentChunk);
      }

      return chunks;
    }

    function pauseForChunkEnd(text) {
      if (!text) return 180;
      const last = text.trim().slice(-1);
      if (/[.!?…]/.test(last)) return 520;
      if (/[,;:]/.test(last)) return 260;
      return 180;
    }

    // -------------------------
    // Interactive prefix helper
    // -------------------------
    function getInteractivePrefix(el, tag, langTag) {
      const isPt = (langTag || '').toLowerCase().startsWith('pt');
      try {
        const role = (el.getAttribute && (el.getAttribute('role') || '') || '').toLowerCase();
        const type = (el.type || '').toLowerCase();
        const t = (pt, en) => (isPt ? pt : en);

        if (tag === 'button' || role === 'button' || ['button','submit','reset'].includes(type)) {
          return t('Botão ', 'Button ');
        }
        if (tag === 'a' || role === 'link' || (tag === 'area')) {
          return t('Link ', 'Link ');
        }
        if (tag === 'input') {
          switch (type) {
            case 'checkbox': return t('Caixa de seleção ', 'Checkbox ');
            case 'radio': return t('Opção ', 'Radio option ');
            case 'file': return t('Campo de arquivo ', 'File input ');
            case 'email': return t('Campo de e-mail ', 'Email field ');
            case 'password': return t('Campo de senha ', 'Password field ');
            case 'search': return t('Campo de busca ', 'Search field ');
            case 'tel': return t('Campo de telefone ', 'Telephone field ');
            case 'url': return t('Campo de URL ', 'URL field ');
            case 'number': return t('Campo numérico ', 'Number field ');
            case 'submit': case 'button': case 'reset': return t('Botão ', 'Button ');
            default: return t('Campo de texto ', 'Text field ');
          }
        }
        if (tag === 'textarea') return t('Campo de texto ', 'Text area ');
        if (tag === 'select') return t('Menu ', 'Dropdown ');
        if (tag === 'label') return t('Rótulo ', 'Label ');
        if (role) {
          if (role.indexOf('button') !== -1) return t('Botão ', 'Button ');
          if (role.indexOf('link') !== -1) return t('Link ', 'Link ');
          if (role.indexOf('checkbox') !== -1) return t('Caixa de seleção ', 'Checkbox ');
          if (role.indexOf('textbox') !== -1) return t('Campo de texto ', 'Text field ');
        }
        return '';
      } catch (e) {
        return '';
      }
    }

    // -------------------------
    // Node -> text extractor (with interactive prefixes)
    // -------------------------
    function nodeToText(node) {
      const mappedText = [];
      const blockTags = /^(P|H[1-6]|LI|DIV|BLOCKQUOTE|TD|TH|DT|DD|SECTION|ARTICLE|HEADER|FOOTER)$/;
      const ignoreTags = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|SVG|IMG|VIDEO)$/;

      function walk(currentNode) {
        if (!currentNode || currentNode.nodeType === Node.COMMENT_NODE) {
          return;
        }

        const tag = (currentNode.tagName || '').toUpperCase();
        if (currentNode.nodeType === Node.ELEMENT_NODE && ignoreTags.test(tag)) {
            return;
        }

        const interactiveTags = /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/;
        if (currentNode.nodeType === Node.ELEMENT_NODE && (interactiveTags.test(tag) || currentNode.hasAttribute('role'))) {
          let label = '';
          try {
            label = currentNode.getAttribute('aria-label') || currentNode.getAttribute('title') || currentNode.getAttribute('placeholder') || currentNode.value || (currentNode.innerText || currentNode.textContent).trim();
          } catch (e) {}
          const prefix = getInteractivePrefix(currentNode, tag.toLowerCase(), getEffectiveLang());
          let spoken = (prefix + (label || (getEffectiveLang().startsWith('pt') ? 'sem rótulo' : 'unlabeled'))).trim();
          if (!/[.!?…]$/.test(spoken)) spoken += '.';
          mappedText.push({ text: spoken, element: currentNode });
          return;
        }

        if (currentNode.nodeType === Node.TEXT_NODE) {
          const text = (currentNode.nodeValue || '').trim();
          if (text) {
            mappedText.push({ text: text, element: currentNode.parentElement });
          }
        }

        for (let i = 0; i < currentNode.childNodes.length; i++) {
          walk(currentNode.childNodes[i]);
        }

        if (currentNode.nodeType === Node.ELEMENT_NODE && blockTags.test(tag)) {
          if (mappedText.length > 0) {
            const lastEntry = mappedText[mappedText.length - 1];
            if (lastEntry.text !== '.') {
              mappedText.push({ text: '.', element: currentNode });
            }
          }
        }
      }

      walk(node);
      return mappedText;
    }

    // -------------------------
    // getReadableText - aggregates header + main or body
    // -------------------------
    function getReadableText() {
      try {
        const headerCandidates = ['header', 'nav', '.navbar-custom', '.site-header', '#header'];
        let headerMap = [];
        for (let sel of headerCandidates) {
          const h = document.querySelector(sel);
          if (h) {
            const map = nodeToText(h);
            if (map.length > 2) {
                headerMap = map;
                break;
            }
          }
        }

        const selectors = ['main', 'article', '#content', '.content', '#profile-main-content'];
        for (let s of selectors) {
          const el = document.querySelector(s);
          if (el) {
            const mainMap = nodeToText(el);
            if (mainMap.length > 5) {
              return headerMap.concat(mainMap);
            }
          }
        }
        // Fallback para o body
        return nodeToText(document.body) || [];
      } catch (e) {
        console.warn('AccessibilityWidget.getReadableText error', e); return nodeToText(document.body) || [];
      }
    }

    // -------------------------
    // Get Color Luminance
    // -------------------------
    function getColorLuminance(color) {
      if (!color) return 0;
      try {
          const tempDiv = document.createElement('div');
          tempDiv.style.color = color;
          document.body.appendChild(tempDiv);
          const rgbColor = window.getComputedStyle(tempDiv).color;
          document.body.removeChild(tempDiv);

          const rgb = rgbColor.match(/\d+/g).map(Number);
          const [r, g, b] = rgb;

          const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          return luminance;
      } catch (e) {
          return 0;
      }
    }

    // -------------------------
    // UI & CSS (include indicator styles)
    // -------------------------
    const css = `
/* Helper class for visibility toggling */
.aw-hidden { display: none !important; }

/* Estilos para o Marcador de Leitura Visual */
#aw-highlighter { position: absolute; z-index: 2147483640; background-color: var(--aw-highlighter-bg, rgba(0,0,0,0.2)); border: 2px solid var(--aw-highlighter-border, #000); border-radius: 8px; box-shadow: 0 0 15px var(--aw-highlighter-shadow, rgba(0,0,0,0.3)); pointer-events: none; transition: all 0.25s ease-in-out; opacity: 0; visibility: hidden; }
#aw-highlighter.aw-visible { opacity: 1; visibility: visible; }

#aw-floating-btn { width: 50px; height: 50px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,.25); background: var(--btn-primary-bg,#4b7bec); }
#aw-floating-btn img { width: 35px; height: 35px; filter: invert(1) sepia(1) saturate(0) hue-rotate(0deg) brightness(200%); }

/* Estilos para o Miniplayer Flutuante */
.aw-miniplayer { position: absolute; right: 68px; bottom: 0; height: 50px; display: none; align-items: center; gap: 8px; background: var(--card-bg, linear-gradient(145deg,#2f3542,#343a4a)); padding: 0 12px 0 8px; border-radius: 25px; box-shadow: 0 6px 18px rgba(0,0,0,.25); color: var(--panel-text, #e6eef8); animation: fadeInMiniplayer 0.3s ease; }

/* Classe que vamos usar no JS para mostrar o miniplayer */
#accessibility-widget.aw-miniplayer-visible .aw-miniplayer { display: flex; }
#accessibility-widget .aw-mini-btn:hover { background: var(--btn-primary-hover-bg, #5E81AC); }
#accessibility-widget .aw-mini-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--btn-primary-bg, #4b7bec); color: #fff; border: none; display: flex; align-items: center; justify-content: center; padding: 0; transition: background-color 0.2s ease; }
#accessibility-widget .aw-mini-btn svg { fill: #fff }
.aw-miniplayer-controls { display: flex; align-items: center; gap: 4px; }
.aw-mini-btn svg { width: 18px; height: 18px; }
.aw-miniplayer-chunk { font-size: 13px; color: var(--small-text,#d8e6f5); white-space: nowrap; }

/* Reutilizando a lógica de play/pause para o miniplayer */
#aw-mini-playpause .aw-pause-icon { display: none; }
#aw-mini-playpause .aw-play-icon { display: block; }
#aw-mini-playpause.aw-playing .aw-pause-icon { display: block; }
#aw-mini-playpause.aw-playing .aw-play-icon { display: none; }

@keyframes fadeInMiniplayer {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

#accessibility-widget select option { color: #212529; }

/* Estilo para o botão minimizar */
#aw-minimize-btn.aw-minimize { background: var(--btn-primary-bg, #4b7bec); color: #fff; border: none; width: 32px; height: 32px; font-size: 16px; line-height: 1; }

/* Estilos para os ícones SVG dentro dos botões do player */
.aw-player-btn svg { width: 65%; height: 65%; fill: currentColor; pointer-events: none; }

/* Lógica para mostrar/esconder ícone de play/pause */
.aw-player-btn .aw-pause-icon { display: none; }
.aw-player-btn .aw-play-icon { display: block; }
.aw-player-btn.aw-playing .aw-pause-icon { display: block; }
.aw-player-btn.aw-playing .aw-play-icon { display: none; }

#accessibility-widget { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; font-family: var(--font-family-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial); -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale; transform: translateZ(0); }
#accessibility-widget * { box-sizing: border-box; }

/* Minimized state logic */
#accessibility-widget.aw-minimized .aw-panel { display: none; }
#accessibility-widget.aw-minimized .aw-float { display: flex; }
#accessibility-widget:not(.aw-minimized) .aw-panel { display: block; }
#accessibility-widget:not(.aw-minimized) .aw-float { display: none; }

#accessibility-widget .aw-panel { width:380px; max-width:95vw; background: var(--card-bg, linear-gradient(145deg,#2f3542,#343a4a)); color: var(--panel-text, #e6eef8); border-radius:10px; box-shadow:0 12px 34px rgba(0,0,0,.45); padding:12px; border:1px solid rgba(255,255,255,0.04); font-size:14px; }
#accessibility-widget .aw-title { color: var(--title-muted,#cfd8e3); margin-bottom:6px; display:flex; align-items:center; justify-content:space-between; }
#accessibility-widget .aw-title strong { color: var(--title, #eef6ff); font-weight:600; }
#accessibility-widget .aw-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
#accessibility-widget button, #accessibility-widget select, #accessibility-widget input { font: inherit; }

#accessibility-widget button { padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); color:inherit; cursor:pointer; }
#accessibility-widget .aw-small { font-size:13px; color:var(--small-text,#d8e6f5); }

/* active state */
.aw-toggle-active { background: var(--btn-primary-bg, #4b7bec) !important; color: #fff !important; box-shadow:0 6px 18px rgba(75,123,236,0.18) !important; }

.aw-player { display:flex; gap:10px; align-items:center; justify-content:center; margin:6px 0 6px 0; }
.aw-player-btn { width:44px; height:44px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:16px; border:none; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.25); background:var(--btn-primary-bg,#4b7bec); color:#fff; }
.aw-player-btn.secondary { background:transparent; border:1px solid rgba(255,255,255,0.06); color:var(--nord3,#cfd8e3); }
.aw-player-btn[disabled] { opacity:0.38; pointer-events:none; box-shadow:none; }
.aw-player-active .aw-player-btn.secondary { background: var(--btn-primary-bg,#4b7bec); color: #fff; border: none; box-shadow:0 6px 18px rgba(75,123,236,0.18); }

/* chunk indicator */
#aw-chunk-indicator { display:none; align-items:center; gap:8px; margin:6px 6px 10px 6px; }
#aw-chunk-indicator.aw-indicator-visible { display: flex; }
#aw-chunk-indicator .aw-chunk-text { font-size:13px; color:var(--small-text,#d8e6f5); min-width:86px; text-align:left; }
#aw-chunk-indicator .aw-chunk-bar { flex:1; height:8px; background: rgba(255,255,255,0.06); border-radius:999px; overflow:hidden; }
#aw-chunk-indicator .aw-chunk-fill { height:100%; width:0%; background:var(--btn-primary-bg,#4b7bec); border-radius:999px; transition:width .18s linear; }

.aw-actions-top { display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.aw-controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px; }
.aw-language-row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
.aw-sliders { display:flex; flex-direction:column; gap:10px; margin-bottom:8px; }

.aw-bottom-actions { display:flex; gap:10px; align-items:center; margin-top:8px; }
.aw-bottom-actions .aw-full { flex:1; text-align:center; }

.aw-voice-select, .aw-lang-select { width:100%; padding:6px; border-radius:6px; border:1px solid rgba(255,255,255,0.04); background: rgba(255,255,255,0.02); color:inherit; }

#accessibility-widget input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 10px; border-radius: 999px;
  background: linear-gradient(90deg, var(--btn-primary-bg, #4b7bec) 0%, var(--btn-primary-bg, #4b7bec) var(--aw-range-fill, 40%), rgba(255,255,255,0.06) var(--aw-range-fill, 40%));
  outline: none; padding: 0; margin: 0; box-shadow: inset 0 1px 2px rgba(0,0,0,0.12);
}
#accessibility-widget input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid var(--aw-thumb-border-color, #4b7bec); box-shadow: 0 2px 6px rgba(0,0,0,0.25); cursor: pointer; }
#accessibility-widget input[type="range"]::-moz-range-track { background: rgba(255,255,255,0.06); height: 10px; border-radius: 999px; }
#accessibility-widget input[type="range"]::-moz-range-progress { background: var(--btn-primary-bg, #4b7bec); height: 10px; border-radius: 999px; }
#accessibility-widget input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 3px solid var(--aw-thumb-border-color, #4b7bec); cursor:pointer; }

html.aw-high-contrast #accessibility-widget .aw-panel,
body.aw-high-contrast #accessibility-widget .aw-panel,
#accessibility-widget.aw-high-contrast .aw-panel {
  background: #000 !important; color: #fff !important; border-color: #444 !important;
}
html.aw-high-contrast #accessibility-widget button,
body.aw-high-contrast #accessibility-widget button {
  background: #222 !important; color: #fff !important; border-color: #555 !important;
}

html.aw-disable-animations *, body.aw-disable-animations *, #accessibility-widget.aw-disable-animations * {
  animation: none !important; transition: none !important;
}

@media (max-width:420px) {
  #accessibility-widget .aw-panel { width:94vw; padding:10px; }
  .aw-player { gap:8px; }
  .aw-player-btn { width:40px; height:40px; font-size:15px; }
}
`;
    const style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    const GLOBAL_CONTRAST_STYLE_ID = 'aw-global-contrast-style';
function injectGlobalContrastStyles() {
      if (document.getElementById(GLOBAL_CONTRAST_STYLE_ID)) return;
      const s = document.createElement('style');
      s.id = GLOBAL_CONTRAST_STYLE_ID;
      s.type = 'text/css';
      s.appendChild(document.createTextNode(`
/* AW global high contrast (AGRESSIVO) */
html.aw-high-contrast,
html.aw-high-contrast body {
  background: #000 !important;
  color: #fff !important;
}

/* Força TODOS os elementos a terem fundo preto e texto branco */
html.aw-high-contrast * {
  background-color: #000 !important;
  color: #fff !important;
  border-color: #fff !important; /* Deixa as bordas visíveis */
  box-shadow: none !important; /* Remove sombras que podem atrapalhar */
}

/* Regras específicas para manter a usabilidade */
html.aw-high-contrast a,
html.aw-high-contrast a * { /* Links e qualquer coisa dentro deles */
  color: #6fe3ff !important; /* Ciano para links, se destaca no preto */
  text-decoration: underline !important;
}

html.aw-high-contrast button,
html.aw-high-contrast input,
html.aw-high-contrast select,
html.aw-high-contrast textarea {
  background-color: #111 !important; /* Um cinza escuro para campos */
  border: 1px solid #888 !important;
}

/* Exceções: não queremos inverter imagens, vídeos, etc. */
html.aw-high-contrast img,
html.aw-high-contrast video,
html.aw-high-contrast svg,
html.aw-high-contrast iframe {
  background-color: transparent !important; /* Mantém o fundo original */
  filter: grayscale(80%) contrast(200%); /* Aumenta o contraste da imagem sem inverter */
}
`));
      document.head.appendChild(s);
    }
    function removeGlobalContrastStyles() {
      const el = document.getElementById(GLOBAL_CONTRAST_STYLE_ID);
      if (el) el.remove();
    }

    // -------------------------
    // Build DOM
    // -------------------------
    const root = document.createElement('div');
    root.id = 'accessibility-widget';
    root.setAttribute('aria-hidden', 'false');
    root.innerHTML = `
      <button class="aw-float" id="aw-floating-btn" aria-label="Abrir painel de acessibilidade" aria-controls="aw-panel" aria-expanded="false">
        <img src="https://cateim.github.io/accessibility-widget/assets/accessibility.svg" alt="Ícone de Acessibilidade" />
      </button>
      <div class="aw-miniplayer" id="aw-miniplayer">
        <div class="aw-miniplayer-chunk" id="aw-mini-chunk-text">Trecho: 0 / 0</div>
        <div class="aw-miniplayer-controls">
          <button id="aw-mini-prev" class="aw-mini-btn" title="Voltar" aria-label="Voltar">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button id="aw-mini-playpause" class="aw-mini-btn" title="Pausar" aria-label="Pausar">
            <svg class="aw-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="aw-pause-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button id="aw-mini-next" class="aw-mini-btn" title="Avançar" aria-label="Avançar">
            <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-3.5 6l-8.5 6V6z"/></svg>
          </button>
        </div>
      </div>
      <div class="aw-panel" id="aw-panel" role="dialog" aria-modal="true" aria-labelledby="aw-title-text" aria-hidden="true">
        <div class="aw-title">
          <div style="display:flex;align-items:center;gap:8px;">
            <strong id="aw-title-text">Acessibilidade</strong>
            <span style="font-size:12px;color:var(--title-muted,#cfd8e3);">(Alt+M)</span>
          </div>
          <div>
            <button id="aw-minimize-btn" class="aw-minimize" title="Minimizar" aria-label="Minimizar">─</button>
          </div>
        </div>

        <div class="aw-player" role="group" aria-label="Controles de reprodução">
          <button id="aw-prev" class="aw-player-btn secondary" title="Voltar (trecho anterior)" aria-label="Voltar">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button id="aw-playpause" class="aw-player-btn" title="Ler / Pausar" aria-label="Ler">
            <svg class="aw-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="aw-pause-icon" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button id="aw-next" class="aw-player-btn secondary" title="Avançar (próximo trecho)" aria-label="Avançar">
            <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zm-3.5 6l-8.5 6V6z"/></svg>
          </button>
          <button id="aw-stop" class="aw-player-btn secondary" title="Parar" aria-label="Parar">
            <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
          </button>
        </div>

        <div id="aw-chunk-indicator" aria-hidden="true">
          <div class="aw-chunk-text" id="aw-chunk-text">Trecho: 0 / 0</div>
          <div class="aw-chunk-bar" aria-hidden="true"><div class="aw-chunk-fill" id="aw-chunk-fill" style="width:0%"></div></div>
        </div>

        <div class="aw-actions-top">
          <button id="aw-increase" title="Aumentar fonte" aria-pressed="false">A+</button>
          <button id="aw-decrease" title="Diminuir fonte" aria-pressed="false">A-</button>
          <button id="aw-contrast" title="Alto contraste" aria-pressed="false">Contraste</button>
          <button id="aw-animations" title="Desativar animações" aria-pressed="false">Animações</button>
        </div>

        <div class="aw-language-row">
          <select id="aw-lang" class="aw-lang-select aw-small" aria-label="Idioma" style="min-width:120px;">
            <option value="auto">Auto</option>
            <option value="pt-BR">Português (pt-BR)</option>
            <option value="en-US">English (en-US)</option>
          </select>
          <select id="aw-voice" class="aw-voice-select" aria-label="Selecione voz"><option>Carregando vozes...</option></select>
        </div>

        <div class="aw-sliders">
          <div>
            <label class="aw-small" for="aw-rate">Velocidade</label>
            <input id="aw-rate" type="range" min="0.6" max="1.6" step="0.05" value="${state.rate}">
            <div class="aw-small" id="aw-rate-val">${(state.rate||defaults.rate).toFixed(2)}</div>
          </div>
          <div>
            <label class="aw-small" for="aw-pitch">Pitch</label>
            <input id="aw-pitch" type="range" min="0.6" max="1.6" step="0.05" value="${state.pitch}">
            <div class="aw-small" id="aw-pitch-val">${(state.pitch||defaults.pitch).toFixed(2)}</div>
          </div>
        </div>

        <div class="aw-bottom-actions">
          <button id="aw-read" class="aw-btn-primary aw-full" style="flex:1;">Ler tudo</button>
          <button id="aw-read-selection" class="aw-btn-primary aw-full" style="flex:1; background: rgba(255,255,255,0.04); color:inherit;">Ler seleção</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <div class="aw-small">Fonte: <span id="aw-font-size">${state.fontSize}px</span></div>
          <div class="aw-small">v1.7</div>
        </div>
      </div>
    `;
    document.body.prepend(root);

    // Element refs
    const floatingBtn = document.getElementById('aw-floating-btn');
    const panel = document.getElementById('aw-panel');
    const btnMinimize = document.getElementById('aw-minimize-btn');
    const btnIncrease = document.getElementById('aw-increase');
    const btnDecrease = document.getElementById('aw-decrease');
    const btnContrast = document.getElementById('aw-contrast');
    const btnAnimations = document.getElementById('aw-animations');
    const selectLang = document.getElementById('aw-lang');
    const selectVoice = document.getElementById('aw-voice');
    const inputRate = document.getElementById('aw-rate');
    const inputPitch = document.getElementById('aw-pitch');
    const spanRateVal = document.getElementById('aw-rate-val');
    const spanPitchVal = document.getElementById('aw-pitch-val');
    const btnPrev = document.getElementById('aw-prev');
    const btnPlay = document.getElementById('aw-playpause');
    const btnNext = document.getElementById('aw-next');
    const btnStop = document.getElementById('aw-stop');
    const btnRead = document.getElementById('aw-read');
    const btnReadSelection = document.getElementById('aw-read-selection');
    const spanFontSize = document.getElementById('aw-font-size');
    const highlighter = document.createElement('div'); highlighter.id = 'aw-highlighter'; document.body.appendChild(highlighter);

    // Referências do Miniplayer
    const miniPlayer = document.getElementById('aw-miniplayer');
    const btnMiniPrev = document.getElementById('aw-mini-prev');
    const btnMiniPlay = document.getElementById('aw-mini-playpause');
    const btnMiniNext = document.getElementById('aw-mini-next');
    const miniChunkText = document.getElementById('aw-mini-chunk-text');

    // Indicator refs
    const chunkIndicator = document.getElementById('aw-chunk-indicator');
    const chunkText = document.getElementById('aw-chunk-text');
    const chunkFill = document.getElementById('aw-chunk-fill');

    // -------------------------
    // Lógica do Marcador Visual
    // -------------------------
    function removeHighlight() {
      if (highlighter) {
        highlighter.classList.remove('aw-visible');
        if (highlightResetTimer) clearTimeout(highlightResetTimer);
        highlightResetTimer = setTimeout(() => {
          highlighter.style.width = '0px';
          highlighter.style.height = '0px';
          highlighter.style.top = '0px';
          highlighter.style.left = '0px';
        }, 300); // Deve ser um pouco mais que o tempo da transição no CSS
      }
    }

    function highlightSpokenText(elements) {
      if (highlightResetTimer) {
        clearTimeout(highlightResetTimer);
        highlightResetTimer = null;
      }
      
      if (!elements || !elements.length || lastReadMode === 'selection') {
        removeHighlight();
        return;
      }

      let elementToHighlight = elements[0];

      // Tenta encontrar um parente de bloco mais significativo para destacar
      const goodParent = elements[0].closest('p, h1, h2, h3, h4, h5, h6, li, dt, dd, .info-display p, .btn, .wallet-disclaimer');
      if (goodParent) {
        elementToHighlight = goodParent;
      }

      const rect = elementToHighlight.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) {
        removeHighlight();
        return;
      }

      highlighter.style.top = `${rect.top + window.scrollY}px`;
      highlighter.style.left = `${rect.left + window.scrollX}px`;
      highlighter.style.width = `${rect.width}px`;
      highlighter.style.height = `${rect.height}px`;

      highlighter.classList.add('aw-visible');

      elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // -------------------------
    // Speech synthesis setup
    // -------------------------
    const synth = window.speechSynthesis;
    let voices = [];

    function populateVoices() {
      try {
        voices = synth ? synth.getVoices() : [];
        selectVoice.innerHTML = '';
        if (!voices || !voices.length) {
          const opt = document.createElement('option'); opt.textContent = (getEffectiveLang().startsWith('pt') ? 'Voz do navegador (padrão)' : 'Default browser voice'); opt.value = -1; selectVoice.appendChild(opt); return;
        }
        const defaultOpt = document.createElement('option'); defaultOpt.textContent = (getEffectiveLang().startsWith('pt') ? 'Voz do navegador (padrão)' : 'Default browser voice'); defaultOpt.value = -1; selectVoice.appendChild(defaultOpt);
        voices.forEach((v, idx) => {
          const o = document.createElement('option');
          o.value = idx;
          o.textContent = `${v.name} — ${v.lang}${v.default ? ' (default)' : ''}`;
          selectVoice.appendChild(o);
        });
        if (typeof state.voiceIndex === 'number' && state.voiceIndex >= 0 && state.voiceIndex < voices.length) selectVoice.value = state.voiceIndex;
        else {
          const eff = getEffectiveLang().split('-')[0];
          const match = voices.findIndex(v => (v.lang || '').toLowerCase().startsWith(eff));
          selectVoice.value = match >= 0 ? match : -1;
        }
      } catch (e) {
        console.warn('populateVoices', e);
      }
    }
    if (synth) {
      populateVoices();
      if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = populateVoices;
    } else {
      selectVoice.innerHTML = '<option>Text-to-speech not supported</option>';
    }

    // -------------------------
    // TTS runtime + indicator
    // -------------------------
    let utterQueue = [];
    let globalCurrentIndex = 0;
    let isPaused = false;
    let pendingNextIndex = null;
    let navigatedWhilePaused = false;
    let highlightResetTimer = null;
    let lastChunks = [];
    let isPlaying = false;
    let lastReadMode = null;
    let currentUtterIdx = -1;

    function updateChunkIndicator() {
      try {
        if (!lastChunks || !lastChunks.length) {
          chunkIndicator.classList.remove('aw-indicator-visible');
          return;
        }
        let displayIndex = 0;
        if (currentUtterIdx >= 0) displayIndex = currentUtterIdx + 1;
        else displayIndex = Math.min(globalCurrentIndex + 1, lastChunks.length);

        const total = lastChunks.length;
        const textContent = `Trecho: ${Math.max(1, displayIndex)} / ${total}`;

        // Atualiza os dois indicadores
        chunkIndicator.classList.add('aw-indicator-visible');
        chunkText.textContent = textContent;
        miniChunkText.textContent = textContent;

        const pct = total <= 1 ? 100 : Math.round(((Math.max(0, (displayIndex - 1)) / (total - 1)) * 100));
        chunkFill.style.width = pct + '%';
      } catch (e) { /* noop */ }
    }

    function updatePlayerUI() {
      try {
        if (isPlaying && !isPaused) {
          btnPlay.classList.add('aw-playing');
          btnMiniPlay.classList.add('aw-playing');
          btnPlay.title = getUiString('pause');
          btnPlay.setAttribute('aria-label', getUiString('pause'));
        } else {
          btnPlay.classList.remove('aw-playing');
          btnMiniPlay.classList.remove('aw-playing');
          btnPlay.title = getUiString('play');
          btnPlay.setAttribute('aria-label', getUiString('play'));
        }
        if (!lastChunks || !lastChunks.length) {
          btnPrev.setAttribute('disabled','disabled'); btnNext.setAttribute('disabled','disabled'); btnStop.setAttribute('disabled','disabled');
        } else {
          btnPrev.removeAttribute('disabled'); btnNext.removeAttribute('disabled'); btnStop.removeAttribute('disabled');
        }

        if (isPlaying || isPaused) root.classList.add('aw-player-active'); else root.classList.remove('aw-player-active');

        if ((isPlaying || isPaused) && lastReadMode === 'page') btnRead.classList.add('aw-toggle-active'); else btnRead.classList.remove('aw-toggle-active');
        if ((isPlaying || isPaused) && lastReadMode === 'selection') btnReadSelection.classList.add('aw-toggle-active'); else btnReadSelection.classList.remove('aw-toggle-active');

        updateChunkIndicator();
      } catch (e) {
        console.warn('updatePlayerUI', e);
      }
    }

    function speakChunksSequentially(chunks, startIndex = 0) {
      if (!synth) { alert(getUiString('tts_not_supported')); return; }
      stopReading();
      if (!Array.isArray(chunks) || !chunks.length) {
        lastChunks = [];
        updatePlayerUI();
        return;
      }

      lastChunks = chunks.slice(0);
      globalCurrentIndex = Math.max(0, Math.min(startIndex, lastChunks.length - 1));
      utterQueue = []; isPaused = false; pendingNextIndex = null; isPlaying = true; currentUtterIdx = -1;

      for (let i = 0; i < lastChunks.length; i++) {
        const chunkObject = lastChunks[i];
        const u = new SpeechSynthesisUtterance(chunkObject.text);
        u.rate = state.rate || defaults.rate;
        u.pitch = state.pitch || defaults.pitch;
        u._elements = chunkObject.elements;

        try {
          const vi = parseInt(selectVoice.value || -1, 10);
          if (!isNaN(vi) && vi >= 0 && voices[vi]) { u.voice = voices[vi]; u.lang = voices[vi].lang || getEffectiveLang(); }
          else u.lang = getEffectiveLang();
        } catch (e) { u.lang = getEffectiveLang(); }
        u._idx = i;

        u.onstart = function () {
          currentUtterIdx = u._idx;
          highlightSpokenText(u._elements);
          updatePlayerUI();
        };

        u.onend = function () {
          currentUtterIdx = -1;
          if (!isPaused) {
            globalCurrentIndex = u._idx + 1;
            const delay = pauseForChunkEnd(u.text) || 200;
            setTimeout(() => {
              if (isPaused) return;
              const nextIdx = u._idx + 1;
              if (nextIdx < utterQueue.length) {
                try {
                  synth.speak(utterQueue[nextIdx]);
                } catch (e) {
                  console.warn(e);
                }
              } else {
                isPlaying = false;
                removeHighlight();
                updatePlayerUI();
              }
            }, delay);
          }
        };
        u.onerror = function (e) {
          console.warn('utterance error', e);
        };

        utterQueue.push(u);
      }

      updatePlayerUI();

      try {
        if (startIndex < utterQueue.length) {
          highlightSpokenText(utterQueue[startIndex]._elements);
          synth.speak(utterQueue[startIndex]);
          globalCurrentIndex = startIndex;
        }
      } catch (e) { console.error(e); }
    }

    function stopReading() {
      removeHighlight();
      try { if (synth) synth.cancel(); } catch (e) {}
      utterQueue = [];
      isPaused = false;
      pendingNextIndex = null;
      isPlaying = false;
      lastChunks = [];
      globalCurrentIndex = 0;
      lastReadMode = null;
      currentUtterIdx = -1;
      btnRead.classList.remove('aw-toggle-active');
      btnReadSelection.classList.remove('aw-toggle-active');
      root.classList.remove('aw-player-active');
      updatePlayerUI();
    }

    function pauseResume() {
      if (!synth) return;
      try {
        if (isPaused) {
          isPaused = false;
          isPlaying = true;
          updatePlayerUI();
          if (pendingNextIndex !== null && pendingNextIndex < lastChunks.length) {
            const resumeIndex = navigatedWhilePaused ? pendingNextIndex + 1 : pendingNextIndex;
            speakChunksSequentially(lastChunks, resumeIndex);
          } else {
            synth.resume();
          }
        } else if (isPlaying) {
          isPaused = true;
          navigatedWhilePaused = false;
          pendingNextIndex = currentUtterIdx !== -1 ? currentUtterIdx : globalCurrentIndex;
          synth.pause();
          updatePlayerUI();
        }
      } catch (err) {
        console.warn('pauseResume error', err);
      }
    }

    function readPage(fromIndex = 0) {
      if (state.minimized) {
        state.minimized = false;
        safeSave(state);
        applyUI();
      }
      try {
        const mappedText = getReadableText();
        if (!mappedText || mappedText.length < 1) { alert(getUiString('no_text')); return; }
        const chunks = splitToChunks(mappedText, 220);
        lastReadMode = 'page';
        speakChunksSequentially(chunks, fromIndex || 0);
      } catch (e) { console.error('readPage error', e); alert(getUiString('error_start')); }
    }

    function readSelection(fromIndex = 0) {
      if (state.minimized) {
        state.minimized = false;
        safeSave(state);
        applyUI();
      }
      try {
        const selText = window.getSelection().toString().trim();
        if (selText && selText.length > 2) {
          const mappedText = [{ text: selText, element: document.body }];
          const chunks = splitToChunks(mappedText, 220);
          lastReadMode = 'selection';
          speakChunksSequentially(chunks, fromIndex || 0);
        } else alert(getUiString('select_text'));
      } catch (e) { console.error('readSelection error', e); }
    }

    function speakChunkAtIndex(index) {
      if (!synth || !utterQueue.length) return;
      try {
        if (isPaused) {
          navigatedWhilePaused = true;
        }
        globalCurrentIndex = Math.max(0, Math.min(index, utterQueue.length - 1));
        pendingNextIndex = globalCurrentIndex;
        synth.cancel();
        if (utterQueue[globalCurrentIndex]) {
          synth.speak(utterQueue[globalCurrentIndex]);
        }
      } catch (e) {
        console.error('speakChunkAtIndex error', e);
      }
    }

    function nextChunk() {
      if (!lastChunks || !lastChunks.length) { return; }
      const currentIndex = currentUtterIdx !== -1 ? currentUtterIdx : globalCurrentIndex;
      const nextIdx = Math.min(lastChunks.length - 1, currentIndex + 1);
      speakChunkAtIndex(nextIdx);
    }

    function prevChunk() {
      if (!lastChunks || !lastChunks.length) { return; }
      const currentIndex = currentUtterIdx !== -1 ? currentUtterIdx : globalCurrentIndex;
      const prevIdx = Math.max(0, currentIndex - 1);
      speakChunkAtIndex(prevIdx);
    }

    // -------------------------
    // UI wiring
    // -------------------------
    floatingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.minimized = false;
      state.hidden = false;
      safeSave(state);
      applyUI();
      setTimeout(() => btnMinimize.focus(), 100);
    });

    btnMinimize.addEventListener('click', (e) => {
      e.stopPropagation();
      state.minimized = true;
      safeSave(state);
      applyUI();
      setTimeout(() => floatingBtn.focus(), 100);
    });

    btnIncrease.addEventListener('click', () => { state.fontSize = Math.min(28, (state.fontSize || defaults.fontSize) + 2); safeSave(state); applyUI(); });
    btnDecrease.addEventListener('click', () => { state.fontSize = Math.max(10, (state.fontSize || defaults.fontSize) - 2); safeSave(state); applyUI(); });

    function updateControlButtonsUI() {
      try {
        if (state.highContrast) {
          btnContrast.classList.add('aw-toggle-active');
          btnContrast.setAttribute('aria-pressed', 'true');
          document.documentElement.classList.add('aw-high-contrast');
          document.body.classList.add('aw-high-contrast');
          root.classList.add('aw-high-contrast');
          injectGlobalContrastStyles();
        } else {
          btnContrast.classList.remove('aw-toggle-active');
          btnContrast.setAttribute('aria-pressed', 'false');
          document.documentElement.classList.remove('aw-high-contrast');
          document.body.classList.remove('aw-high-contrast');
          root.classList.remove('aw-high-contrast');
          removeGlobalContrastStyles();
        }

        if (state.disableAnimations) {
          btnAnimations.classList.add('aw-toggle-active');
          btnAnimations.setAttribute('aria-pressed', 'true');
          document.documentElement.classList.add('aw-disable-animations');
          document.body.classList.add('aw-disable-animations');
          root.classList.add('aw-disable-animations');
        } else {
          btnAnimations.classList.remove('aw-toggle-active');
          btnAnimations.setAttribute('aria-pressed', 'false');
          document.documentElement.classList.remove('aw-disable-animations');
          document.body.classList.remove('aw-disable-animations');
          root.classList.remove('aw-disable-animations');
        }
      } catch (e) {
        console.warn(e);
      }
    }

    btnContrast.addEventListener('click', (e) => {
      e.stopPropagation();
      state.highContrast = !state.highContrast;
      safeSave(state);
      updateControlButtonsUI();
      applyUI();
    });

    btnAnimations.addEventListener('click', (e) => {
      e.stopPropagation();
      state.disableAnimations = !state.disableAnimations;
      safeSave(state);
      updateControlButtonsUI();
      applyUI();
    });

    selectLang.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'auto') state.lang = 'auto'; else state.lang = normalizeLangTag(val);
      safeSave(state);
      try { populateVoices(); } catch (err) {}
    });

    inputRate.addEventListener('input', (e) => { state.rate = parseFloat(e.target.value); spanRateVal.textContent = state.rate.toFixed(2); safeSave(state); });
    inputPitch.addEventListener('input', (e) => { state.pitch = parseFloat(e.target.value); spanPitchVal.textContent = state.pitch.toFixed(2); safeSave(state); });

    selectVoice.addEventListener('change', (e) => { const i = parseInt(e.target.value, 10); state.voiceIndex = isNaN(i) ? -1 : i; safeSave(state); });

    btnPrev.addEventListener('click', (e) => { e.stopPropagation(); prevChunk(); });
    btnNext.addEventListener('click', (e) => { e.stopPropagation(); nextChunk(); });

    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isPlaying && !isPaused) pauseResume();
      else if (isPlaying && isPaused) pauseResume();
      else {
        if (lastChunks && lastChunks.length) speakChunksSequentially(lastChunks, globalCurrentIndex || 0);
        else readPage(0);
      }
      updatePlayerUI();
    });

    btnStop.addEventListener('click', (e) => { e.stopPropagation(); stopReading(); });

    btnRead.addEventListener('click', (e) => { e.stopPropagation(); readPage(0); });
    btnReadSelection.addEventListener('click', (e) => { e.stopPropagation(); readSelection(0); });

    btnMiniPrev.addEventListener('click', (e) => { e.stopPropagation(); prevChunk(); });
    btnMiniNext.addEventListener('click', (e) => { e.stopPropagation(); nextChunk(); });
    btnMiniPlay.addEventListener('click', (e) => { e.stopPropagation(); pauseResume(); });

    document.addEventListener('keydown', function (e) {
      if (e.altKey && !e.shiftKey && !e.ctrlKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        state.minimized = !state.minimized;
        if (!state.minimized) {
            state.hidden = false;
        }
        safeSave(state);
        applyUI();
      }
      try {
        const rootEl = document.getElementById('accessibility-widget');
        if (!rootEl || rootEl.classList.contains('aw-hidden') || rootEl.classList.contains('aw-minimized')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); nextChunk(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); prevChunk(); }
        if (e.key === ' ') { e.preventDefault(); btnPlay.click(); }
      } catch (e) {}
    });

    function getUiString(key) {
      const lang = getEffectiveLang();
      const strings = {
        'pt-BR': {
          'pause': 'Pausar',
          'resume': 'Retomar',
          'no_text': 'Nenhum texto encontrado para leitura.',
          'error_start': 'Erro ao iniciar leitura. Veja console.',
          'select_text': 'Selecione algum texto na página para ler.',
          'tts_not_supported': 'Text-to-speech não suportado neste navegador.',
          'play': 'Ler'
        },
        'en-US': {
          'pause': 'Pause',
          'resume': 'Resume',
          'no_text': 'No readable text found.',
          'error_start': 'Error starting reading. See console.',
          'select_text': 'Select some text on the page to read.',
          'tts_not_supported': 'Text-to-speech not supported in this browser.',
          'play': 'Play'
        }
      };
      return (strings[lang] && strings[lang][key]) || (strings['en-US'][key]) || key;
    }

    function applyComputedTheme() {
      console.log('[AW] 🕵️ Rodando applyComputedTheme...');
      try {
        const cs = getComputedStyle(document.documentElement);
        let btnPrimary = cs.getPropertyValue('--btn-primary-bg').trim();

        if (!btnPrimary) {
          console.log("[AW] Variável não encontrada. Detectando cor do fundo...");
          const bodyBg = window.getComputedStyle(document.body).backgroundColor;
          const isColorValid = (c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';

          if (isColorValid(bodyBg)) {
            btnPrimary = bodyBg;
          } else {
            const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
            if (isColorValid(htmlBg)) {
              btnPrimary = htmlBg;
            }
          }
        }

        if (!btnPrimary) {
          console.log("[AW] Nenhuma cor detectável. Usando CSS padrão.");
          return;
        }

        console.log('[AW] Cor final detectada:', btnPrimary);
        const iconColor = isLight ? '#000' : '#fff';

        if (highlighter) {
          if (isLight) {
            highlighter.style.setProperty('--aw-highlighter-bg', 'rgba(0, 0, 0, 0.18)');
            highlighter.style.setProperty('--aw-highlighter-border', '#000000');
            highlighter.style.setProperty('--aw-highlighter-shadow', 'rgba(0, 0, 0, 0.3)');
          } else {
            const tempDiv = document.createElement('div');
            tempDiv.style.color = btnPrimary;
            document.body.appendChild(tempDiv);
            const rgbColor = window.getComputedStyle(tempDiv).color;
            document.body.removeChild(tempDiv);

            const rgbValues = rgbColor.match(/\d+/g);
            if (rgbValues && rgbValues.length >= 3) {
              const [r, g, b] = rgbValues;
              highlighter.style.setProperty('--aw-highlighter-bg', `rgba(${r}, ${g}, ${b}, 0.25)`);
              highlighter.style.setProperty('--aw-highlighter-shadow', `rgba(${r}, ${g}, ${b}, 0.4)`);
            } else {
              highlighter.style.setProperty('--aw-highlighter-bg', 'rgba(255, 255, 255, 0.20)');
              highlighter.style.setProperty('--aw-highlighter-shadow', 'rgba(255, 255, 255, 0.3)');
            }

            highlighter.style.setProperty('--aw-highlighter-border', btnPrimary);
          }
        }

        const iconImg = floatingBtn.querySelector('img');
        if (iconImg) {
          const iconFilter = isLight ? 'brightness(0) saturate(100%)' : 'brightness(0) saturate(100%) invert(1)';
          iconImg.style.setProperty('filter', iconFilter, 'important');
        }

        btnMinimize.style.background = btnPrimary;
        btnMinimize.style.color = iconColor;

        document.querySelectorAll('#accessibility-widget .aw-mini-btn').forEach(b => {
          b.style.background = btnPrimary;
          const svgs = b.querySelectorAll('svg');
          svgs.forEach(svg => {
            if (svg) {
              svg.style.fill = iconColor;
            }
          });
        });

        document.querySelectorAll('#accessibility-widget .aw-player-btn').forEach(b => {
          b.style.background = btnPrimary;
          b.style.color = iconColor;
        });

        root.style.setProperty('--btn-primary-bg', btnPrimary);
        root.style.setProperty('--aw-thumb-border-color', isLight ? '#000' : btnPrimary);
      } catch (e) {
        // console.warn('applyComputedTheme error', e);
        console.error('[AW] ERRO CRÍTICO dentro de applyComputedTheme:', e);
      }
    }

    function applyUI() {
      try {
        if (state.hidden) {
          root.classList.add('aw-hidden');
          return;
        } else {
          root.classList.remove('aw-hidden');
        }
  
        const isMinimized = state.minimized;
  
        floatingBtn.setAttribute('aria-expanded', !isMinimized);
        panel.setAttribute('aria-hidden', isMinimized);
  
        if (isMinimized) {
          root.classList.add('aw-minimized');
          if (isPlaying || isPaused) {
            root.classList.add('aw-miniplayer-visible');
          } else {
            root.classList.remove('aw-miniplayer-visible');
          }
        } else {
          root.classList.remove('aw-minimized');
          root.classList.remove('aw-miniplayer-visible');
        }
  
        document.documentElement.style.fontSize = (state.fontSize || defaults.fontSize) + 'px';
        spanFontSize && (spanFontSize.textContent = (state.fontSize || defaults.fontSize) + 'px');
  
        updateControlButtonsUI();
        updatePlayerUI();
      } catch (e) {
        console.warn('AccessibilityWidget.applyUI error', e);
      }
    }

    function attachRangeFillHandlers() {
      const ranges = document.querySelectorAll('#accessibility-widget input[type="range"]');
      ranges.forEach(inp => {
        function updateFill() {
          try {
            const min = parseFloat(inp.min) || 0;
            const max = parseFloat(inp.max) || 100;
            const val = parseFloat(inp.value) || 0;
            const pct = Math.round(((val - min) / (max - min)) * 100);
            inp.style.setProperty('--aw-range-fill', pct + '%');
          } catch (e) {}
        }
        updateFill();
        inp.addEventListener('input', updateFill, {passive: true});
      });
      const rootEl = document.getElementById('accessibility-widget');
      if (rootEl) rootEl.style.removeProperty('--aw-range-fill');
    }

    // Initial setup
    attachRangeFillHandlers();
    setTimeout(() => { applyComputedTheme(); if (synth) populateVoices(); }, 700);
    applyUI(); // First run

    // Expose API + debug helpers
    window.AccessibilityWidget = {
      open: () => { state.hidden = false; state.minimized = false; safeSave(state); applyUI(); },
      close: () => { state.hidden = true; safeSave(state); applyUI(); },
      minimize: () => { state.minimized = true; safeSave(state); applyUI(); },
      readPage: () => { readPage(0); },
      readSelection: () => { readSelection(0); },
      stop: stopReading,
      pauseResume: pauseResume,
      increaseFont: () => { btnIncrease.click(); },
      decreaseFont: () => { btnDecrease.click(); },
      setLang: (lang) => { state.lang = (lang || 'auto'); safeSave(state); try { populateVoices(); } catch(e){} },
      next: nextChunk,
      prev: prevChunk,
      play: () => { btnPlay.click(); },
    };
})();
