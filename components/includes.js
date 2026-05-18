(function() {
  var page = (function() {
    var p = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    if (p === '') p = 'index';
    return p;
  })();

  function markActive(root) {
    root.querySelectorAll('[data-navlink]').forEach(function(el) {
      if (el.dataset.navlink === page) el.classList.add('active');
      else el.classList.remove('active');
    });
  }

  function inject(placeholderId, url, callback) {
    var placeholder = document.getElementById(placeholderId);
    if (!placeholder) return;
    fetch(url)
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var node = tmp.firstElementChild;
        placeholder.parentNode.replaceChild(node, placeholder);
        if (callback) callback(node);
      })
      .catch(function() {});
  }

  inject('nav-placeholder', '/components/nav.html', function(navEl) {
    markActive(navEl);
    // Re-wire hamburger click since it's now in DOM
    var hamburger = navEl.querySelector('.hamburger');
    if (hamburger) hamburger.setAttribute('onclick', 'toggleMenu()');
    // Trigger scroll state
    window.dispatchEvent(new Event('scroll'));
  });

  inject('footer-placeholder', '/components/footer.html', null);
})();
