// Set up PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', async () => {
  const materialsGrid = document.getElementById('materialsGrid');
  const searchInput = document.getElementById('searchMaterials');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const subjectFilter = document.getElementById('subjectFilter');
  
  let allMaterials = [];
  let savedIds = JSON.parse(localStorage.getItem('ntc_saved_materials') || '[]');
  
  // Viewer Elements
  const modals = {
    image: document.getElementById('modalImage'),
    pdf: document.getElementById('modalPdf'),
    text: document.getElementById('modalText'),
    video: document.getElementById('modalVideo')
  };
  
  // Close buttons
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.target.closest('.viewer-modal').classList.remove('active');
      // Stop video if playing
      const video = document.getElementById('videoPlayer');
      if (video) video.pause();
    });
  });

  async function loadData() {
    materialsGrid.innerHTML = Array(6).fill(`
      <div class="skel-card">
        <div class="skeleton skel-img"></div>
        <div class="skel-body">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
        </div>
      </div>
    `).join('');

    try {
      if (window.supaDB && window.supaDB.getLessons) {
        const res = await window.supaDB.getLessons();
        allMaterials = res.data || [];
        populateSubjectFilter(allMaterials);
        renderGrid(allMaterials);
      } else {
        throw new Error('Supabase DB not initialized');
      }
    } catch (e) {
      console.error(e);
      materialsGrid.innerHTML = `<div class="empty-state"><p>Failed to load materials.</p></div>`;
    }
  }

  function populateSubjectFilter(materials) {
    if (!subjectFilter) return;
    const subjects = new Set();
    materials.forEach(m => {
      if (m.subject) {
        subjects.add(m.subject);
      }
    });

    subjectFilter.innerHTML = '<option value="all">All Subjects</option>';
    
    Array.from(subjects).sort().forEach(subject => {
      const option = document.createElement('option');
      option.value = subject;
      option.textContent = subject;
      subjectFilter.appendChild(option);
    });
  }

  function getWordCount(str) {
    return str ? str.split(/\s+/).length : 0;
  }

  function estimateReadTime(wordCount) {
    const mins = Math.max(1, Math.ceil(wordCount / 200));
    return `${mins} min read`;
  }
  
  function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url?.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  function renderGrid(items) {
    if (items.length === 0) {
      materialsGrid.innerHTML = `<div class="empty-state"><p>No materials found.</p></div>`;
      return;
    }

    materialsGrid.innerHTML = items.map(item => {
      const isSaved = savedIds.includes(item.id);
      const bookmarkClass = isSaved ? 'saved' : '';
      const bookmarkIcon = isSaved ? 
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>` : 
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

      let cardHtml = '';
      let type = (item.media_type || 'text').toLowerCase();
      
      // Auto-detect images stored as text in DB
      if (type === 'text' && item.media_url) {
        if (item.media_url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i)) {
          type = 'image';
        }
      }
      
      // Bookmark button HTML
      const btnHtml = `<button class="mat-bookmark ${bookmarkClass}" data-id="${item.id}" onclick="event.stopPropagation(); toggleSave('${item.id}')">${bookmarkIcon}</button>`;

      if (type === 'image') {
        cardHtml = `
          <div class="mat-card mat-image-card" onclick="openImage('${item.id}')">
            ${btnHtml}
            <div class="mat-image-bg" style="background-image: url('${item.media_url}')"></div>
            <div class="mat-image-overlay">
              <h3 class="mat-image-title">${item.title || item.subtopic}</h3>
            </div>
          </div>
        `;
      } 
      else if (type === 'video') {
        const ytId = getYouTubeId(item.media_url);
        const thumb = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80';
        
        cardHtml = `
          <div class="mat-card mat-media-card" onclick="openVideo('${item.media_url}', '${item.title || item.subtopic}')">
            ${btnHtml}
            <div class="mat-media-bg" style="background-image: url('${thumb}')"></div>
            <div class="mat-media-overlay">
              <div class="mat-badge-top"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Video</div>
              <div class="mat-play-btn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>
              <h3 class="mat-media-title">${item.title || item.subtopic}</h3>
              <div class="mat-media-meta">${item.subject || 'Resource'}</div>
            </div>
          </div>
        `;
      }
      else if (type === 'pdf' || type === 'document') {
        cardHtml = `
          <div class="mat-card mat-pdf-card" onclick="openPdf('${item.media_url}', '${item.title || item.subtopic}')">
            ${btnHtml}
            <div class="mat-pdf-preview" data-pdf="${item.media_url}">
              <canvas class="mat-pdf-canvas"></canvas>
            </div>
            <div class="mat-pdf-info">
              <h3 class="mat-pdf-title">${item.title || item.subtopic}</h3>
              <div class="mat-meta-row">
                <span class="mat-meta-item"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg> PDF</span>
                <span class="mat-meta-item page-count-span">...</span>
              </div>
            </div>
          </div>
        `;
      }
      else {
        // Text / Article
        const content = item.content || item.description || '';
        const readTime = estimateReadTime(getWordCount(content));
        
        cardHtml = `
          <div class="mat-card mat-text-card" onclick="openText('${item.id}')">
            ${btnHtml}
            <div class="mat-text-badge"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg> Article</div>
            <h3 class="mat-text-title">${item.title || item.subtopic}</h3>
            <p class="mat-text-snippet">${content.substring(0, 150)}${content.length > 150 ? '...' : ''}</p>
            <div class="mat-text-footer">
              <div class="mat-meta-row">
                <span>${readTime}</span>
                <span>•</span>
                <span>${item.subject || 'General'}</span>
              </div>
            </div>
          </div>
        `;
      }

      return cardHtml;
    }).join('');

    // Trigger PDF rendering
    setTimeout(renderPdfThumbnails, 100);
  }

  // --- PDF Thumbnail Rendering ---
  async function renderPdfThumbnails() {
    if (!window.pdfjsLib) return;
    const previews = document.querySelectorAll('.mat-pdf-preview');
    
    for (const preview of previews) {
      const url = preview.getAttribute('data-pdf');
      const canvas = preview.querySelector('.mat-pdf-canvas');
      const countSpan = preview.parentElement.querySelector('.page-count-span');
      
      if (!url || !canvas) continue;
      
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        
        if (countSpan) countSpan.textContent = `${pdf.numPages} Pages`;

        const page = await pdf.getPage(1);
        const scale = 0.5; // thumbnail scale
        const viewport = page.getViewport({scale: scale});
        
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
      } catch (err) {
        console.warn('PDF Render failed:', err);
        // Fallback styling
        canvas.style.display = 'none';
        preview.innerHTML = `<div style="font-size:40px; color:#cbd5e1;"><svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></div>`;
      }
    }
  }

  // --- Global Viewer Functions ---
  let panzoomInstance = null;
  
  // Gallery State
  let currentImageGallery = [];
  let currentImageIndex = -1;

  window.openImage = (id) => {
    // Determine the current gallery (all images currently visible)
    const galleryItems = Array.from(materialsGrid.querySelectorAll('.mat-image-card')).map(card => {
      const btn = card.querySelector('.mat-bookmark');
      const matId = btn.getAttribute('data-id');
      return allMaterials.find(m => m.id === matId);
    }).filter(Boolean);
    
    // Fallback if not found in grid (e.g. called from somewhere else)
    if (galleryItems.length === 0) {
      const item = allMaterials.find(m => m.id === id);
      if (item) galleryItems.push(item);
    }
    
    currentImageGallery = galleryItems;
    currentImageIndex = currentImageGallery.findIndex(m => m.id === id);
    
    if (currentImageIndex === -1) return;
    
    renderImageModal();
    modals.image.classList.add('active');
  };

  function renderImageModal() {
    if (currentImageIndex < 0 || currentImageIndex >= currentImageGallery.length) return;
    const item = currentImageGallery[currentImageIndex];
    
    document.getElementById('modalImageTitle').textContent = item.title || item.subtopic || 'Image Viewer';
    const img = document.getElementById('viewerImg');
    img.src = item.media_url;
    
    // Update Details
    const titleEl = document.getElementById('imageViewerTitle');
    const descEl = document.getElementById('imageViewerDesc');
    const detailsContainer = document.getElementById('imageViewerDetails');
    
    if (titleEl && descEl && detailsContainer) {
      titleEl.textContent = item.title || item.subtopic || 'Image';
      descEl.textContent = item.description || item.content || '';
      
      // If no details at all, we could hide it, but title is always present due to fallback
      detailsContainer.style.display = 'block';
    }
    
    // Update Badge & Navigation
    const badge = document.getElementById('imageCountBadge');
    const btnPrev = document.getElementById('imageNavPrev');
    const btnNext = document.getElementById('imageNavNext');
    
    if (currentImageGallery.length > 1) {
      badge.style.display = 'block';
      badge.textContent = `${currentImageIndex + 1} / ${currentImageGallery.length}`;
      btnPrev.style.display = 'flex';
      btnNext.style.display = 'flex';
      
      // Update states
      btnPrev.style.opacity = currentImageIndex > 0 ? '1' : '0.5';
      btnPrev.style.pointerEvents = currentImageIndex > 0 ? 'auto' : 'none';
      
      btnNext.style.opacity = currentImageIndex < currentImageGallery.length - 1 ? '1' : '0.5';
      btnNext.style.pointerEvents = currentImageIndex < currentImageGallery.length - 1 ? 'auto' : 'none';
    } else {
      badge.style.display = 'none';
      btnPrev.style.display = 'none';
      btnNext.style.display = 'none';
    }
    
    if (panzoomInstance) panzoomInstance.destroy();
    if (window.Panzoom) {
      panzoomInstance = Panzoom(img, { maxScale: 5, contain: 'outside' });
      img.parentElement.addEventListener('wheel', panzoomInstance.zoomWithWheel);
    }
  }

  // Navigation handlers
  window.nextImageGallery = () => {
    if (currentImageIndex < currentImageGallery.length - 1) {
      currentImageIndex++;
      renderImageModal();
    }
  };
  
  window.prevImageGallery = () => {
    if (currentImageIndex > 0) {
      currentImageIndex--;
      renderImageModal();
    }
  };

  // Add event listeners for navigation buttons if they exist
  const btnPrev = document.getElementById('imageNavPrev');
  const btnNext = document.getElementById('imageNavNext');
  if (btnPrev) btnPrev.addEventListener('click', (e) => { e.stopPropagation(); window.prevImageGallery(); });
  if (btnNext) btnNext.addEventListener('click', (e) => { e.stopPropagation(); window.nextImageGallery(); });

  // Swipe detection
  let touchStartX = 0;
  let touchEndX = 0;
  const imageViewerBody = document.getElementById('imageViewerBody');
  
  if (imageViewerBody) {
    imageViewerBody.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    
    imageViewerBody.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }

  function handleSwipe() {
    if (currentImageGallery.length <= 1) return;
    // Don't swipe if zoomed in
    if (panzoomInstance && panzoomInstance.getScale() > 1.05) return;
    
    const diff = touchStartX - touchEndX;
    const threshold = 50; // minimum distance to be considered a swipe
    
    if (diff > threshold) {
      // Swiped left -> next image
      window.nextImageGallery();
    } else if (diff < -threshold) {
      // Swiped right -> prev image
      window.prevImageGallery();
    }
  }

  window.openVideo = (url, title) => {
    document.getElementById('modalVideoTitle').textContent = title || 'Video Player';
    const player = document.getElementById('videoPlayer');
    const ytId = getYouTubeId(url);
    
    if (ytId) {
      // YouTube embed
      player.outerHTML = `<iframe id="videoPlayer" class="video-player" src="https://www.youtube.com/embed/${ytId}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
    } else {
      player.outerHTML = `<video id="videoPlayer" class="video-player" controls autoplay><source src="${url}">Your browser does not support the video tag.</video>`;
    }
    
    modals.video.classList.add('active');
  };

  window.openText = (id) => {
    const item = allMaterials.find(m => m.id === id);
    if (!item) return;
    
    document.getElementById('modalTextTitle').textContent = item.title || item.subtopic;
    document.getElementById('trTitle').textContent = item.title || item.subtopic;
    document.getElementById('trSubject').textContent = item.subject || 'Resource';
    
    const content = item.content || item.description || '';
    document.getElementById('trTime').textContent = estimateReadTime(getWordCount(content));
    document.getElementById('trBody').textContent = content;
    
    modals.text.classList.add('active');
  };

  let currentPdfDoc = null;
  let currentPdfPage = 1;
  
  window.openPdf = async (url, title) => {
    document.getElementById('modalPdfTitle').textContent = title || 'PDF Document';
    modals.pdf.classList.add('active');
    
    const container = document.getElementById('pdfContainer');
    container.innerHTML = '<div class="spinner spinner-lg" style="margin: 50px auto;"></div>';
    
    try {
      if (!window.pdfjsLib) throw new Error("PDF Library not loaded");
      currentPdfDoc = await pdfjsLib.getDocument(url).promise;
      renderPdfPage(1);
    } catch (e) {
      container.innerHTML = `<p style="color:var(--danger)">Failed to load PDF. <a href="${url}" target="_blank" style="text-decoration:underline;">Click here to download</a>.</p>`;
    }
  };

  async function renderPdfPage(num) {
    if (!currentPdfDoc) return;
    const container = document.getElementById('pdfContainer');
    
    const page = await currentPdfDoc.getPage(num);
    const viewport = page.getViewport({scale: 1.5}); // Large readable scale
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    
    container.innerHTML = '';
    container.appendChild(canvas);
  }

  window.toggleSave = (id) => {
    const index = savedIds.indexOf(id);
    if (index > -1) {
      savedIds.splice(index, 1);
    } else {
      savedIds.push(id);
    }
    localStorage.setItem('ntc_saved_materials', JSON.stringify(savedIds));
    applyFilters(); // Re-render to update bookmark icons
  };

  // --- Filtering & Search ---
  let currentFilter = 'all';

  function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const selectedSubject = subjectFilter ? subjectFilter.value : 'all';
    
    const filtered = allMaterials.filter(item => {
      // Filter by type
      let type = (item.media_type || 'text').toLowerCase();
      if (type === 'text' && item.media_url && item.media_url.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i)) {
        type = 'image';
      }
      
      let matchesType = true;
      
      if (currentFilter === 'pdfs') matchesType = (type === 'pdf' || type === 'document');
      else if (currentFilter === 'images') matchesType = (type === 'image');
      else if (currentFilter === 'videos') matchesType = (type === 'video');
      else if (currentFilter === 'text') matchesType = (type === 'text' || !item.media_type);
      else if (currentFilter === 'saved') matchesType = savedIds.includes(item.id);

      // Filter by subject
      let matchesSubject = true;
      if (selectedSubject !== 'all') {
        matchesSubject = (item.subject === selectedSubject);
      }

      // Filter by search
      const textToSearch = `${item.title} ${item.subtopic} ${item.description} ${item.content} ${item.subject}`.toLowerCase();
      const matchesSearch = textToSearch.includes(query);

      return matchesType && matchesSearch && matchesSubject;
    });

    renderGrid(filtered);
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', applyFilters);
  if (subjectFilter) {
    subjectFilter.addEventListener('change', applyFilters);
  }

  // Init
  loadData();
});
