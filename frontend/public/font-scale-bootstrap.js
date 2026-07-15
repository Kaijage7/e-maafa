(function () {
  'use strict';
  try {
    var key = 'dmis.fontRootPx';
    var value = localStorage.getItem(key);
    var size = value == null ? 19 : parseInt(value, 10);
    if (!isFinite(size)) size = 19;
    if (size < 15) size = 15;
    if (size > 24) size = 24;
    document.documentElement.style.fontSize = size + 'px';
    document.documentElement.style.setProperty('--fs-root', size + 'px');
  } catch (_) {
    // Storage can be unavailable in hardened/private browser contexts; the CSS default remains valid.
  }
})();
