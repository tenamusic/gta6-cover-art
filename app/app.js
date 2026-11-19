/* Vice Cover Studio — GTA-style multi-panel cover art maker.
 * Offline static app: photos are read on the user's own machine and never
 * uploaded. The cover is drawn on a <canvas> and exported as a PNG. */
'use strict';

/* ------------------------------------------------------------------ */
/* Sizes and panel layouts                                            */
/* ------------------------------------------------------------------ */

const EXPORT_SIZES = {
  square: { width: 1080, height: 1080, label: '1080 × 1080' },
  portrait: { width: 1080, height: 1350, label: '1080 × 1350' },
  wide: { width: 1920, height: 1080, label: '1920 × 1080' },
};

/* Each layout is a function of (width, height, gutter) returning the
 * panel rectangles in draw order. Slot i of the state maps to rect i. */
const PANEL_LAYOUTS = {
  square: function squareLayout(w, h, g) {
    const heroH = Math.round((h - 3 * g) * 0.6);
    const by = g + heroH + g;
    const bw = Math.round((w - 3 * g) / 2);
    return [
      { x: g, y: g, w: w - 2 * g, h: heroH },
      { x: g, y: by, w: bw, h: h - by - g },
      { x: g + bw + g, y: by, w: bw, h: h - by - g },
    ];
  },
  portrait: function portraitLayout(w, h, g) {
    const heroH = Math.round((h - 4 * g) * 0.52);
    const my = g + heroH + g;
    const mh = Math.round((h - 4 * g) * 0.24);
    const mw = Math.round((w - 3 * g) / 2);
    const by = my + mh + g;
    return [
      { x: g, y: g, w: w - 2 * g, h: heroH },
      { x: g, y: my, w: mw, h: mh },
      { x: g + mw + g, y: my, w: mw, h: mh },
      { x: g, y: by, w: w - 2 * g, h: h - by - g },
    ];
  },
  wide: function wideLayout(w, h, g) {
    const heroW = Math.round((w - 3 * g) * 0.6);
    const rx = g + heroW + g;
    const rh = Math.round((h - 3 * g) / 2);
    return [
      { x: g, y: g, w: heroW, h: h - 2 * g },
      { x: rx, y: g, w: w - rx - g, h: rh },
      { x: rx, y: g + rh + g, w: w - rx - g, h: rh },
    ];
  },
};

/* ------------------------------------------------------------------ */
/* Colour grades                                                      */
/* ------------------------------------------------------------------ */

const GRADES = {
  sunset: {
    sky: ['#1b0b3b', '#7b2ff7', '#ff5da2', '#ff8a3d'],
    wash: ['rgba(255,122,61,0.20)', 'rgba(255,93,162,0.24)'],
    mode: 'soft-light',
  },
  neon: {
    sky: ['#0b1030', '#4b1d8f', '#ff2d95', '#00e5ff'],
    wash: ['rgba(255,0,128,0.22)', 'rgba(0,220,255,0.22)'],
    mode: 'overlay',
  },
  dusk: {
    sky: ['#070a24', '#241a5e', '#6a2b8f', '#c65a9e'],
    wash: ['rgba(60,30,120,0.28)', 'rgba(20,10,60,0.30)'],
    mode: 'multiply',
  },
  golden: {
    sky: ['#2b1200', '#7a3c00', '#e07b1f', '#ffd166'],
    wash: ['rgba(255,180,60,0.22)', 'rgba(255,120,20,0.18)'],
    mode: 'soft-light',
  },
};

const FRAME_COLORS = {
  white: '#f7f2ea',
  black: '#0d0618',
  none: null,
};

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */

function freshPanel() {
  return { photo: -1, zoom: 1, dx: 0, dy: 0 };
}

const state = {
  size: 'square',
  grade: 'sunset',
  frame: 'white',
  caption: 'Sunset Heist',
  subtitle: 'ONE LAST SCORE',
  titleSize: 100,
  titleColor: '#ffffff',
  titleSpot: 'hero',
  photos: [], /* { name, img } */
  panels: [freshPanel(), freshPanel(), freshPanel(), freshPanel()],
  selected: 0,
};

const canvas = document.getElementById('coverCanvas');
const ctx = canvas.getContext('2d');

/* ------------------------------------------------------------------ */
/* Small deterministic helpers                                        */
/* ------------------------------------------------------------------ */

/* Tiny seeded pseudo-random helper so the skyline is stable per panel. */
function seededValue(seed, i) {
  let v = (seed * 2654435761 + i * 40503) >>> 0;
  v = (v ^ (v >>> 13)) >>> 0;
  return ((v * 2654435761) >>> 0) / 4294967296;
}

function coverFitScale(imgW, imgH, rectW, rectH) {
  return Math.max(rectW / imgW, rectH / imgH);
}

/* ------------------------------------------------------------------ */
/* Cover drawing                                                      */
/* ------------------------------------------------------------------ */

function drawSkyBackground(c, w, h, grade) {
  const grad = c.createLinearGradient(0, 0, 0, h);
  grade.sky.forEach(function (color, i) {
    grad.addColorStop(i / (grade.sky.length - 1), color);
  });
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
  /* A low sun disc glowing behind the panels. */
  const sunX = w * 0.78;
  const sunY = h * 0.2;
  const sunR = Math.min(w, h) * 0.16;
  const glow = c.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR * 2.2);
  glow.addColorStop(0, 'rgba(255,190,90,0.55)');
  glow.addColorStop(0.4, 'rgba(255,110,90,0.22)');
  glow.addColorStop(1, 'rgba(255,110,90,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  const disc = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  disc.addColorStop(0, '#ffe9a8');
  disc.addColorStop(0.7, '#ffb347');
  disc.addColorStop(1, '#ff6a3d');
  c.fillStyle = disc;
  c.beginPath();
  c.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  c.fill();
}

function drawPhotoIntoPanel(c, img, rect, panel) {
  const base = coverFitScale(img.naturalWidth, img.naturalHeight, rect.w, rect.h);
  const scale = base * panel.zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (panel.dx / 100) * rect.w * 0.3;
  const dy = rect.y + (rect.h - dh) / 2 + (panel.dy / 100) * rect.h * 0.3;
  c.drawImage(img, dx, dy, dw, dh);
}

function drawGradeWash(c, rect, grade) {
  const wash = c.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  wash.addColorStop(0, grade.wash[0]);
  wash.addColorStop(1, grade.wash[1]);
  c.save();
  c.globalCompositeOperation = grade.mode;
  c.fillStyle = wash;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
  c.restore();
  /* Warm top light and a vignette so panels read as one poster. */
  const light = c.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  light.addColorStop(0, 'rgba(255,220,160,0.14)');
  light.addColorStop(0.5, 'rgba(255,220,160,0)');
  c.save();
  c.globalCompositeOperation = 'screen';
  c.fillStyle = light;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
  c.restore();
  const vig = c.createRadialGradient(
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.min(rect.w, rect.h) * 0.35,
    rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.75,
  );
  vig.addColorStop(0, 'rgba(20,5,40,0)');
  vig.addColorStop(1, 'rgba(20,5,40,0.38)');
  c.fillStyle = vig;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function drawEmptyPanel(c, rect, grade) {
  const grad = c.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, grade.sky[1]);
  grad.addColorStop(1, grade.sky[0]);
  c.fillStyle = grad;
  c.fillRect(rect.x, rect.y, rect.w, rect.h);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.font = '900 ' + Math.round(rect.h * 0.09) + 'px "Arial Black", Arial, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function drawPanelFrame(c, rect, frame) {
  if (frame === 'none') return;
  c.save();
  c.strokeStyle = frame === 'white' ? '#ffffff' : '#000000';
  c.lineWidth = Math.max(2, rect.w * 0.006);
  c.strokeRect(rect.x, rect.y, rect.w, rect.h);
  c.restore();
}

/* Dark building silhouettes along the bottom of a strip, for the poster skyline. */
function drawSkyline(c, x, y, w, h, seed) {
  c.save();
  c.fillStyle = 'rgba(16,6,36,0.88)';
  let bx = x;
  let i = 0;
  while (bx < x + w) {
    const bw = w * (0.05 + seededValue(seed, i) * 0.06);
    const bh = h * (0.35 + seededValue(seed, i + 100) * 0.65);
    c.fillRect(bx, y + h - bh, bw, bh);
    /* A few lit windows. */
    c.fillStyle = 'rgba(255,209,102,0.75)';
    const wy = y + h - bh + bh * 0.25;
    if (seededValue(seed, i + 200) > 0.5) c.fillRect(bx + bw * 0.3, wy, bw * 0.16, bh * 0.1);
    if (seededValue(seed, i + 300) > 0.6) c.fillRect(bx + bw * 0.6, wy + bh * 0.2, bw * 0.16, bh * 0.1);
    c.fillStyle = 'rgba(16,6,36,0.88)';
    bx += bw + 2;
    i += 1;
  }
  c.restore();
}

function fitCaptionFont(c, text, maxWidth, startSize) {
  let size = startSize;
  c.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
  while (size > 24 && c.measureText(text).width > maxWidth) {
    size -= 4;
    c.font = '900 ' + size + 'px "Arial Black", Arial, sans-serif';
  }
  return size;
}

function drawCaptionText(c, text, cx, cy, maxWidth, size, color, rotate) {
  const fitted = fitCaptionFont(c, text, maxWidth, size);
  c.save();
  c.translate(cx, cy);
  c.rotate(rotate);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.65)';
  c.shadowBlur = fitted * 0.12;
  c.shadowOffsetY = fitted * 0.05;
  c.lineJoin = 'round';
  c.lineWidth = Math.max(6, fitted * 0.14);
  c.strokeStyle = '#14042a';
  c.strokeText(text, 0, 0);
  c.shadowColor = 'transparent';
  c.fillStyle = color;
  c.fillText(text, 0, 0);
  c.restore();
  return fitted;
}

function drawSubtitleText(c, text, cx, cy, maxWidth, size, color) {
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '700 ' + size + 'px Arial, Helvetica, sans-serif';
  let s = size;
  while (s > 10 && c.measureText(text).width > maxWidth) {
    s -= 1;
    c.font = '700 ' + s + 'px Arial, Helvetica, sans-serif';
  }
  c.fillStyle = color;
  c.shadowColor = 'rgba(0,0,0,0.8)';
  c.shadowBlur = 6;
  c.fillText(text, cx, cy);
  c.restore();
}

function drawCover(c, w, h, opts) {
  const grade = GRADES[opts.grade];
  const gutter = opts.frame === 'none' ? 0 : Math.max(6, Math.round(w * 0.011));
  const rects = PANEL_LAYOUTS[opts.size](w, h, gutter);

  /* Backdrop: sky gradient, or flat frame colour for the gutters. */
  if (opts.frame === 'white' || opts.frame === 'black') {
    c.fillStyle = FRAME_COLORS[opts.frame];
    c.fillRect(0, 0, w, h);
  } else {
    drawSkyBackground(c, w, h, grade);
  }

  const hero = rects[0];
  rects.forEach(function (rect, i) {
    const panel = opts.panels[i] || freshPanel();
    c.save();
    c.beginPath();
    c.rect(rect.x, rect.y, rect.w, rect.h);
    c.clip();
    const photo = panel.photo >= 0 ? opts.photos[panel.photo] : null;
    if (photo && photo.img) {
      drawPhotoIntoPanel(c, photo.img, rect, panel);
      drawGradeWash(c, rect, grade);
    } else {
      drawEmptyPanel(c, rect, grade);
    }
    c.restore();
    drawPanelFrame(c, rect, opts.frame);
  });

  /* Caption: over the hero panel, or in a band across the bottom. */
  const pad = Math.round(w * 0.04);
  const baseSize = Math.round(hero.w * 0.115 * (opts.titleSize / 100));
  if (opts.titleSpot === 'bottom') {
    const bandH = Math.round(h * 0.17);
    const bandY = h - bandH;
    const bandGrad = c.createLinearGradient(0, bandY, 0, h);
    bandGrad.addColorStop(0, 'rgba(20,6,44,0.88)');
    bandGrad.addColorStop(1, 'rgba(60,10,70,0.96)');
    c.fillStyle = bandGrad;
    c.fillRect(0, bandY, w, bandH);
    drawSkyline(c, 0, bandY, w, Math.round(bandH * 0.42), 7);
    const capSize = drawCaptionText(
      c, opts.caption, w / 2, bandY + bandH * 0.42,
      w - pad * 2, baseSize, opts.titleColor, -0.02,
    );
    if (opts.subtitle) {
      drawSubtitleText(
        c, opts.subtitle, w / 2, bandY + bandH * 0.42 + capSize * 0.72,
        w - pad * 2, Math.round(capSize * 0.22), '#ffd166',
      );
    }
  } else {
    const stripH = Math.round(hero.h * 0.34);
    drawSkyline(c, hero.x, hero.y + hero.h - stripH, hero.w, stripH, 3);
    const shade = c.createLinearGradient(0, hero.y + hero.h - stripH, 0, hero.y + hero.h);
    shade.addColorStop(0, 'rgba(16,6,36,0)');
    shade.addColorStop(1, 'rgba(16,6,36,0.55)');
    c.fillStyle = shade;
    c.fillRect(hero.x, hero.y + hero.h - stripH, hero.w, stripH);
    const capSize = drawCaptionText(
      c, opts.caption, hero.x + hero.w / 2, hero.y + hero.h - stripH * 0.58,
      hero.w - pad * 2, baseSize, opts.titleColor, -0.02,
    );
    if (opts.subtitle) {
      drawSubtitleText(
        c, opts.subtitle, hero.x + hero.w / 2,
        hero.y + hero.h - stripH * 0.58 + capSize * 0.62,
        hero.w - pad * 2, Math.round(capSize * 0.22), '#ffd166',
      );
    }
  }

  /* Small corner tag, top-left of the cover. */
  c.save();
  c.font = '700 ' + Math.round(w * 0.016) + 'px Arial, Helvetica, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.shadowColor = 'rgba(0,0,0,0.7)';
  c.shadowBlur = 4;
  c.fillText('★ SUNSET EDITION', gutter + Math.round(w * 0.012), gutter + Math.round(w * 0.012));
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Rendering the editor preview                                       */
/* ------------------------------------------------------------------ */

function currentRects() {
  const size = EXPORT_SIZES[state.size];
  const gutter = state.frame === 'none' ? 0 : Math.max(6, Math.round(size.width * 0.011));
  return PANEL_LAYOUTS[state.size](size.width, size.height, gutter);
}

function renderPreview() {
  const size = EXPORT_SIZES[state.size];
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  drawCover(ctx, size.width, size.height, {
    size: state.size,
    grade: state.grade,
    frame: state.frame,
    caption: state.caption,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    titleColor: state.titleColor,
    titleSpot: state.titleSpot,
    photos: state.photos,
    panels: state.panels,
  });
  /* Selected-panel outline, editor only — never in an export. */
  const rects = currentRects();
  const rect = rects[state.selected];
  if (rect) {
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = Math.max(4, size.width * 0.006);
    ctx.setLineDash([size.width * 0.02, size.width * 0.012]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
  window.__shotReady = true;
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

function exportCover() {
  const size = EXPORT_SIZES[state.size];
  const off = document.createElement('canvas');
  off.width = size.width;
  off.height = size.height;
  const offCtx = off.getContext('2d');
  drawCover(offCtx, size.width, size.height, {
    size: state.size,
    grade: state.grade,
    frame: state.frame,
    caption: state.caption,
    subtitle: state.subtitle,
    titleSize: state.titleSize,
    titleColor: state.titleColor,
    titleSpot: state.titleSpot,
    photos: state.photos,
    panels: state.panels,
  });
  const name = 'vice-cover-' + size.width + 'x' + size.height + '.png';
  off.toBlob(function (blob) {
    if (!blob) {
      setStatus('Export failed — the browser could not make the PNG.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    setStatus('Exported ' + name + ' (' + size.label + ').');
  }, 'image/png');
}

/* ------------------------------------------------------------------ */
/* Photos                                                             */
/* ------------------------------------------------------------------ */

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Could not load image: ' + src)); };
    img.src = src;
  });
}

function addPhoto(name, img) {
  state.photos.push({ name: name, img: img });
  refreshPhotoUI();
}

function addPhotoFromFile(file) {
  const reader = new FileReader();
  reader.onload = function () {
    loadImage(reader.result).then(function (img) {
      addPhoto(file.name, img);
      setStatus('Added ' + file.name + '.');
      renderPreview();
    }).catch(function () {
      setStatus('That file is not a readable image.');
    });
  };
  reader.readAsDataURL(file);
}

function fillPanelsWithPhoto(photoIndex) {
  const rects = currentRects();
  for (let i = 0; i < rects.length; i += 1) {
    state.panels[i].photo = photoIndex;
  }
  refreshPanelControls();
  renderPreview();
}

/* Preload the two free sample photos so the app is usable at once. */
function preloadSamples() {
  const samples = [
    { name: 'boulevard.jpg', src: 'samples/boulevard.jpg' },
    { name: 'pier.jpg', src: 'samples/pier.jpg' },
  ];
  return Promise.all(samples.map(function (s) {
    return loadImage(s.src).then(function (img) {
      return { name: s.name, img: img };
    }).catch(function () { return null; });
  })).then(function (loaded) {
    loaded.forEach(function (p) { if (p) state.photos.push(p); });
    const pier = state.photos.findIndex(function (p) { return p.name === 'pier.jpg'; });
    const blvd = state.photos.findIndex(function (p) { return p.name === 'boulevard.jpg'; });
    const rects = currentRects();
    for (let i = 0; i < rects.length; i += 1) {
      state.panels[i].photo = i === 0 ? pier : blvd;
    }
    refreshPhotoUI();
    refreshPanelControls();
  });
}

/* ------------------------------------------------------------------ */
/* Editor UI wiring                                                   */
/* ------------------------------------------------------------------ */

const $ = function (id) { return document.getElementById(id); };

function setStatus(text) {
  $('statusLine').textContent = text;
}

function refreshPhotoUI() {
  $('photoCount').textContent = state.photos.length + (state.photos.length === 1 ? ' photo' : ' photos');
  const strip = $('thumbStrip');
  strip.innerHTML = '';
  state.photos.forEach(function (photo, i) {
    const thumb = document.createElement('img');
    thumb.className = 'thumb';
    thumb.src = photo.img.src;
    thumb.alt = photo.name;
    thumb.title = photo.name + ' — click to use in the selected panel';
    thumb.addEventListener('click', function () {
      state.panels[state.selected].photo = i;
      refreshPanelControls();
      renderPreview();
    });
    strip.appendChild(thumb);
  });
  const select = $('panelPhoto');
  select.innerHTML = '';
  const none = document.createElement('option');
  none.value = '-1';
  none.textContent = 'No photo';
  select.appendChild(none);
  state.photos.forEach(function (photo, i) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = (i + 1) + ' · ' + photo.name;
    select.appendChild(opt);
  });
  refreshPanelControls();
}

function refreshPanelControls() {
  const rects = currentRects();
  const names = ['1 (hero)', '2', '3', '4'];
  $('panelLabel').textContent = names[state.selected] || String(state.selected + 1);
  const panel = state.panels[state.selected];
  $('panelPhoto').value = String(panel.photo);
  $('zoomRange').value = String(panel.zoom);
  $('panXRange').value = String(panel.dx);
  $('panYRange').value = String(panel.dy);
  const thumbs = document.querySelectorAll('.thumb');
  thumbs.forEach(function (t, i) {
    t.classList.toggle('is-active', i === panel.photo);
  });
  void rects;
}

function bindControls() {
  $('fileInput').addEventListener('change', function (ev) {
    const files = Array.from(ev.target.files || []);
    files.forEach(addPhotoFromFile);
    ev.target.value = '';
  });

  $('fillAllBtn').addEventListener('click', function () {
    if (state.photos.length === 0) {
      setStatus('Add a photo first.');
      return;
    }
    fillPanelsWithPhoto(0);
    setStatus('First photo is now in every panel.');
  });

  $('panelPhoto').addEventListener('change', function (ev) {
    state.panels[state.selected].photo = Number(ev.target.value);
    refreshPanelControls();
    renderPreview();
  });
  $('zoomRange').addEventListener('input', function (ev) {
    state.panels[state.selected].zoom = Number(ev.target.value);
    renderPreview();
  });
  $('panXRange').addEventListener('input', function (ev) {
    state.panels[state.selected].dx = Number(ev.target.value);
    renderPreview();
  });
  $('panYRange').addEventListener('input', function (ev) {
    state.panels[state.selected].dy = Number(ev.target.value);
    renderPreview();
  });
  $('resetPanelBtn').addEventListener('click', function () {
    const keep = state.panels[state.selected].photo;
    state.panels[state.selected] = freshPanel();
    state.panels[state.selected].photo = keep;
    refreshPanelControls();
    renderPreview();
  });

  $('gradeSelect').addEventListener('change', function (ev) {
    state.grade = ev.target.value;
    renderPreview();
  });
  $('frameSelect').addEventListener('change', function (ev) {
    state.frame = ev.target.value;
    renderPreview();
  });

  $('captionInput').addEventListener('input', function (ev) {
    state.caption = ev.target.value;
    renderPreview();
  });
  $('subtitleInput').addEventListener('input', function (ev) {
    state.subtitle = ev.target.value;
    renderPreview();
  });
  $('titleSizeRange').addEventListener('input', function (ev) {
    state.titleSize = Number(ev.target.value);
    renderPreview();
  });
  $('titleColorSelect').addEventListener('change', function (ev) {
    state.titleColor = ev.target.value;
    renderPreview();
  });
  $('titleSpotSelect').addEventListener('change', function (ev) {
    state.titleSpot = ev.target.value;
    renderPreview();
  });

  document.querySelectorAll('.size-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.size = btn.dataset.size;
      document.querySelectorAll('.size-btn').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      if (state.selected >= currentRects().length) state.selected = 0;
      refreshPanelControls();
      renderPreview();
    });
  });

  $('exportBtn').addEventListener('click', exportCover);

  canvas.addEventListener('click', function (ev) {
    const box = canvas.getBoundingClientRect();
    const size = EXPORT_SIZES[state.size];
    const px = (ev.clientX - box.left) * (size.width / box.width);
    const py = (ev.clientY - box.top) * (size.height / box.height);
    const rects = currentRects();
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        state.selected = i;
        refreshPanelControls();
        renderPreview();
        return;
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Screenshot modes (?shot=cover / ?shot=editor)                      */
/* ------------------------------------------------------------------ */

function applyShotParams() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return Promise.resolve(false);

  const photoName = params.get('photo') || 'pier';
  const caption = params.get('caption');
  const size = params.get('size');
  const grade = params.get('grade');
  if (size && EXPORT_SIZES[size]) state.size = size;
  if (grade && GRADES[grade]) state.grade = grade;
  if (caption) state.caption = caption;
  if (params.get('subtitle')) state.subtitle = params.get('subtitle');
  if (params.get('spot')) state.titleSpot = params.get('spot');
  document.body.dataset.size = state.size;
  document.querySelectorAll('.size-btn').forEach(function (b) {
    b.classList.toggle('is-active', b.dataset.size === state.size);
  });

  const wanted = photoName === 'boulevard' ? 'boulevard.jpg' : 'pier.jpg';
  return loadImage('samples/' + wanted).then(function (img) {
    const idx = state.photos.findIndex(function (p) { return p.name === wanted; });
    let photoIndex = idx;
    if (idx === -1) {
      state.photos.push({ name: wanted, img: img });
      photoIndex = state.photos.length - 1;
    }
    const rects = currentRects();
    for (let i = 0; i < rects.length; i += 1) {
      state.panels[i].photo = photoIndex;
    }
    /* A second photo in the lower panels when both samples are in. */
    const other = state.photos.findIndex(function (p) { return p.name !== wanted; });
    if (other !== -1 && rects.length > 2) {
      state.panels[rects.length - 1].photo = other;
    }
    /* Framing: a portrait photo in a wide panel is centred on its middle
     * by default, which can cut a face at the top — nudge it down so the
     * top of the photo shows. */
    rects.forEach(function (rect, i) {
      const photo = state.photos[state.panels[i].photo];
      if (photo && photo.img && photo.img.naturalHeight > photo.img.naturalWidth && rect.w > rect.h) {
        state.panels[i].dy = 55;
      }
    });
    refreshPhotoUI();
    refreshPanelControls();
    if (shot === 'cover') {
      document.body.classList.add('shot-cover');
      const sizeNow = EXPORT_SIZES[state.size];
      canvas.width = sizeNow.width;
      canvas.height = sizeNow.height;
      drawCover(ctx, sizeNow.width, sizeNow.height, {
        size: state.size,
        grade: state.grade,
        frame: state.frame,
        caption: state.caption,
        subtitle: state.subtitle,
        titleSize: state.titleSize,
        titleColor: state.titleColor,
        titleSpot: state.titleSpot,
        photos: state.photos,
        panels: state.panels,
      });
      window.__shotReady = true;
    } else {
      renderPreview();
    }
    return true;
  }).catch(function () {
    renderPreview();
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

bindControls();
preloadSamples().then(function () {
  return applyShotParams();
}).then(function (shotMode) {
  if (!shotMode) {
    renderPreview();
    setStatus('Sample photos loaded — pick a panel, then export your cover.');
  }
}).catch(function () {
  renderPreview();
});
