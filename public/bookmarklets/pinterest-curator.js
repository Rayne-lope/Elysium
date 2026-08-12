(function () {
  const ELYSIUM_HOST = window.ELYSIUM_HOST || 'http://localhost:4321';
  const MODAL_ID = 'elysium-pinterest-curator-modal';

  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
  }

  // Collect images from Pinterest DOM (src or srcset)
  const images = [];
  const urls = new Set();

  document.querySelectorAll('img').forEach((img) => {
    let candidate = img.src || '';
    if (!candidate.includes('pinimg.com') && img.srcset) {
      const parts = img.srcset.split(',');
      const last = parts[parts.length - 1] || '';
      candidate = last.trim().split(' ')[0] || '';
    }
    if (candidate.includes('pinimg.com')) {
      const originalUrl = candidate.replace(/\/(?:236x|474x|736x|\d+x\d*)\//i, '/originals/');
      if (!urls.has(originalUrl)) {
        urls.add(originalUrl);
        const alt = img.alt || img.getAttribute('aria-label') || 'Pinterest Artwork';
        images.push({ originalUrl, thumbnailUrl: candidate, title: alt });
      }
    }
  });

  if (images.length === 0) {
    alert('Elysium Curator: Tidak ada gambar Pinterest yang ditemukan di halaman ini. Silakan scroll ke bawah terlebih dahulu!');
    return;
  }

  // Create Swiss Style Overlay Modal
  const modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.setAttribute('style', `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 440px;
    max-height: 85vh;
    background: #0f0f11;
    color: #f9f8f6;
    border: 1px solid #2d2d35;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
    z-index: 9999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `);

  modal.innerHTML = `
    <div style="padding: 16px 20px; border-bottom: 1px solid #2d2d35; display: flex; justify-content: space-between; align-items: center; background: #16161a;">
      <div>
        <h3 style="margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.02em; color: #ffffff;">ELYSIUM <span style="font-size: 10px; background: #3b82f6; color: #fff; padding: 2px 6px; border-radius: 99px; margin-left: 6px;">CURATOR</span></h3>
        <p style="margin: 4px 0 0; font-size: 11px; color: #8a8a98;">Berhasil mendeteksi ${images.length} master HD</p>
      </div>
      <button id="elysium-close-btn" style="background: none; border: none; color: #8a8a98; font-size: 20px; cursor: pointer; padding: 0 4px;">&times;</button>
    </div>

    <div id="elysium-grid" style="flex: 1; overflow-y: auto; padding: 14px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
      ${images.map((item) => `
        <label style="position: relative; border: 1px solid #2d2d35; border-radius: 8px; overflow: hidden; background: #1a1a20; cursor: pointer; display: block;">
          <input type="checkbox" class="elysium-pin-check" data-url="${item.originalUrl}" checked style="position: absolute; top: 8px; left: 8px; z-index: 2; width: 18px; height: 18px; accent-color: #3b82f6;" />
          <img src="${item.thumbnailUrl}" style="width: 100%; height: 120px; object-fit: cover; display: block;" />
          <div style="padding: 6px 8px; font-size: 10px; color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            HD Master
          </div>
        </label>
      `).join('')}
    </div>

    <div style="padding: 14px 20px; border-top: 1px solid #2d2d35; background: #16161a; display: flex; justify-content: space-between; align-items: center;">
      <button id="elysium-select-all" style="background: none; border: none; color: #3b82f6; font-size: 12px; font-weight: 600; cursor: pointer;">Pilih Semua</button>
      <button id="elysium-import-btn" style="background: #3b82f6; color: #ffffff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">
        Kirim ke Elysium &rarr;
      </button>
    </div>
    <div id="elysium-status" style="display: none; padding: 10px 20px; font-size: 11px; background: #1e1b4b; color: #a5b4fc; text-align: center; border-top: 1px solid #312e81;"></div>
  `;

  document.body.appendChild(modal);

  // Modal Interactivity
  document.getElementById('elysium-close-btn').onclick = () => modal.remove();

  document.getElementById('elysium-select-all').onclick = () => {
    const checks = modal.querySelectorAll('.elysium-pin-check');
    const allChecked = Array.from(checks).every((c) => c.checked);
    checks.forEach((c) => (c.checked = !allChecked));
  };

  document.getElementById('elysium-import-btn').onclick = async () => {
    const selectedChecks = Array.from(modal.querySelectorAll('.elysium-pin-check:checked'));
    if (selectedChecks.length === 0) {
      alert('Pilih minimal 1 gambar!');
      return;
    }

    const urls = selectedChecks.map((c) => c.getAttribute('data-url'));
    const statusDiv = document.getElementById('elysium-status');
    const importBtn = document.getElementById('elysium-import-btn');

    importBtn.disabled = true;
    importBtn.textContent = 'Mengirim...';
    statusDiv.style.display = 'block';
    statusDiv.textContent = `Mengirim ${urls.length} gambar ke Elysium...`;

    try {
      const res = await fetch(`${ELYSIUM_HOST}/api/admin/pinterest/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        statusDiv.style.background = '#064e3b';
        statusDiv.style.color = '#6ee7b7';
        statusDiv.innerHTML = `Berhasil mengimpor ${data.data.imported} wallpaper ke Drafts! <a href="${ELYSIUM_HOST}/admin/wallpapers?status=draft" target="_blank" style="color: #fff; text-decoration: underline;">Lihat Drafts &rarr;</a>`;
      } else {
        throw new Error(data.error || 'Gagal mengimpor.');
      }
    } catch (err) {
      statusDiv.style.background = '#7f1d1d';
      statusDiv.style.color = '#fca5a5';
      statusDiv.textContent = err.message || 'Gagal mengimpor.';
      importBtn.disabled = false;
      importBtn.textContent = 'Kirim ke Elysium \u2192';
    }
  };
})();
