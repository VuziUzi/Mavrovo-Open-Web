(function() {
  'use strict';

  // Shared lightbox singleton
  let lbEl = null, lbImgEl = null, lbImages = [], lbCurrent = 0;

  function ensureLightbox() {
    if (lbEl) return;
    lbEl = document.createElement('div');
    lbEl.id = 'drive-lightbox';
    lbEl.className = 'drive-lightbox';
    lbEl.innerHTML = `
      <button class="drive-lb-close" onclick="window._driveLbClose()">&times;</button>
      <button class="drive-lb-nav drive-lb-prev" onclick="window._driveLbPrev()">&#8249;</button>
      <div class="drive-lb-img-wrap"><img class="drive-lb-img" src="" alt=""></div>
      <button class="drive-lb-nav drive-lb-next" onclick="window._driveLbNext()">&#8250;</button>
    `;
    lbEl.addEventListener('click', function(e) { if (e.target === lbEl) window._driveLbClose(); });
    document.body.appendChild(lbEl);

    window._driveLbClose = function() {
      lbEl.classList.remove('drive-lb-open');
      document.body.style.overflow = '';
    };
    window._driveLbPrev = function() {
      lbCurrent = (lbCurrent - 1 + lbImages.length) % lbImages.length;
      lbImgEl.src = lbImages[lbCurrent];
    };
    window._driveLbNext = function() {
      lbCurrent = (lbCurrent + 1) % lbImages.length;
      lbImgEl.src = lbImages[lbCurrent];
    };
    document.addEventListener('keydown', function(e) {
      if (!lbEl.classList.contains('drive-lb-open')) return;
      if (e.key === 'Escape') window._driveLbClose();
      if (e.key === 'ArrowLeft') window._driveLbPrev();
      if (e.key === 'ArrowRight') window._driveLbNext();
    });
    lbImgEl = lbEl.querySelector('.drive-lb-img');
  }

  function openLightbox(images, index) {
    ensureLightbox();
    lbImages = images;
    lbCurrent = index;
    lbImgEl.src = images[index];
    lbEl.classList.add('drive-lb-open');
    document.body.style.overflow = 'hidden';
  }

  function DriveGallery(config) {
    this.containerId = config.containerId;
    this.folderId = config.folderId;
    this.apiKey = config.apiKey || window.DRIVE_API_KEY || '';
    this.itemsPerPage = config.itemsPerPage || 12;
    this.images = [];
    this.currentPage = 0;
    this._init();
  }

  DriveGallery.prototype._init = function() {
    var self = this;
    var container = document.getElementById(this.containerId);
    if (!container) return;

    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_DRIVE_API_KEY') {
      container.innerHTML = '<div class="drive-gallery-placeholder"><span>🔑</span><p>Конфигурирај DRIVE_API_KEY во config.js за да ја прикажеш галеријата.</p></div>';
      return;
    }

    container.innerHTML = '<div class="drive-gallery-loading"><div class="drive-gallery-spinner"></div><p>Се вчитува галеријата…</p></div>';
    this._fetchImages();
  };

  DriveGallery.prototype._fetchImages = function() {
    var self = this;
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("'" + this.folderId + "' in parents and mimeType contains 'image/' and trashed=false")
      + '&key=' + encodeURIComponent(this.apiKey)
      + '&fields=files(id,name)'
      + '&orderBy=name'
      + '&pageSize=100';

    fetch(url)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        self.images = (data.files || []).map(function(f) {
          return {
            id: f.id,
            name: f.name,
            thumb: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w600',
            full: 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w1920'
          };
        });
        self._render();
      })
      .catch(function(err) {
        var container = document.getElementById(self.containerId);
        if (container) container.innerHTML = '<div class="drive-gallery-placeholder"><span>⚠️</span><p>Не може да се вчита галеријата. Провери API клучот.</p></div>';
      });
  };

  DriveGallery.prototype._render = function() {
    var self = this;
    var container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = '';

    if (this.images.length === 0) {
      container.innerHTML = '<div class="drive-gallery-placeholder"><span>📷</span><p>Нема слики во оваа галерија.</p></div>';
      return;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'drive-gallery-wrapper';

    // Grid
    var grid = document.createElement('div');
    grid.className = 'drive-gallery-grid';

    var start = this.currentPage * this.itemsPerPage;
    var pageImages = this.images.slice(start, start + this.itemsPerPage);
    var fullImages = this.images.map(function(i) { return i.full; });

    pageImages.forEach(function(img, idx) {
      var item = document.createElement('div');
      item.className = 'drive-gallery-item';
      var im = document.createElement('img');
      im.src = img.thumb;
      im.alt = img.name;
      im.loading = 'lazy';
      var globalIdx = start + idx;
      im.addEventListener('click', function() { openLightbox(fullImages, globalIdx); });
      item.appendChild(im);
      grid.appendChild(item);
    });
    wrapper.appendChild(grid);

    // Pagination
    var totalPages = Math.ceil(this.images.length / this.itemsPerPage);
    if (totalPages > 1) {
      var pag = document.createElement('div');
      pag.className = 'drive-gallery-pagination';

      var prevBtn = document.createElement('button');
      prevBtn.className = 'drive-gallery-arrow';
      prevBtn.innerHTML = '&#8592;';
      prevBtn.disabled = this.currentPage === 0;
      prevBtn.addEventListener('click', function() {
        if (self.currentPage > 0) {
          self.currentPage--;
          self._render();
          document.getElementById(self.containerId).scrollIntoView({behavior:'smooth',block:'start'});
        }
      });

      var pageNums = document.createElement('div');
      pageNums.className = 'drive-gallery-pages';
      for (var i = 0; i < totalPages; i++) {
        (function(pageIdx) {
          var btn = document.createElement('button');
          btn.className = 'drive-gallery-page-btn' + (pageIdx === self.currentPage ? ' active' : '');
          btn.textContent = pageIdx + 1;
          btn.addEventListener('click', function() {
            self.currentPage = pageIdx;
            self._render();
            document.getElementById(self.containerId).scrollIntoView({behavior:'smooth',block:'start'});
          });
          pageNums.appendChild(btn);
        })(i);
      }

      var nextBtn = document.createElement('button');
      nextBtn.className = 'drive-gallery-arrow';
      nextBtn.innerHTML = '&#8594;';
      nextBtn.disabled = this.currentPage === totalPages - 1;
      nextBtn.addEventListener('click', function() {
        if (self.currentPage < totalPages - 1) {
          self.currentPage++;
          self._render();
          document.getElementById(self.containerId).scrollIntoView({behavior:'smooth',block:'start'});
        }
      });

      pag.appendChild(prevBtn);
      pag.appendChild(pageNums);
      pag.appendChild(nextBtn);
      wrapper.appendChild(pag);
    }

    container.appendChild(wrapper);
  };

  window.DriveGallery = DriveGallery;
})();
