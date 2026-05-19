(function() {
  'use strict';

  function DriveSponsors(config) {
    this.containerId = config.containerId;
    this.folderId = config.folderId;
    this.apiKey = config.apiKey || window.DRIVE_API_KEY || '';
    this._init();
  }

  DriveSponsors.prototype._init = function() {
    var self = this;
    var container = document.getElementById(this.containerId);
    if (!container) return;

    if (!this.apiKey || this.apiKey === 'YOUR_GOOGLE_DRIVE_API_KEY') {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:13px">Конфигурирај DRIVE_API_KEY за спонзори.</div>';
      return;
    }

    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("'" + this.folderId + "' in parents and mimeType contains 'image/' and trashed=false")
      + '&key=' + encodeURIComponent(this.apiKey)
      + '&fields=files(id,name)'
      + '&orderBy=name'
      + '&pageSize=30';

    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var files = (data.files || []).slice(0, 16); // max 16 (doubled for loop = 8 visible)
        if (files.length === 0) { container.style.display = 'none'; return; }
        self._render(container, files);
      })
      .catch(function() { container.style.display = 'none'; });
  };

  DriveSponsors.prototype._render = function(container, files) {
    // Duplicate for seamless loop
    var logos = files.concat(files);
    var track = document.createElement('div');
    track.className = 'sponsors-track';
    logos.forEach(function(f) {
      var item = document.createElement('div');
      item.className = 'sponsors-item';
      var img = document.createElement('img');
      img.src = 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w200';
      img.alt = f.name.replace(/\.[^.]+$/, '');
      img.loading = 'lazy';
      item.appendChild(img);
      track.appendChild(item);
    });
    container.appendChild(track);
    // Set animation duration based on count
    var duration = Math.max(15, files.length * 2.5);
    track.style.animationDuration = duration + 's';
  };

  window.DriveSponsors = DriveSponsors;
})();
