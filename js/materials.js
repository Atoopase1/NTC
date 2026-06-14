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
  
  // Social State
  let allLikes = [];
  let allComments = [];
  let profileMap = {};
  let currentUser = null;
  let currentUserId = null;
  let isAdmin = false;

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
        // Fetch current user
        if (window.supaAuth && window.supaAuth.getCurrentUser) {
          currentUser = await window.supaAuth.getCurrentUser();
          currentUserId = currentUser ? currentUser.id : null;
          isAdmin = currentUser && currentUser.email === 'atoopase@gmail.com';
        }
        
        // Fetch profiles (fail silently)
        try {
          const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
          if (client) {
            const { data: profiles } = await client.from('profiles').select('id, full_name');
            if (profiles) {
              profiles.forEach(p => { profileMap[p.id] = p.full_name; });
            }
          }
        } catch(e) { console.warn('Profiles fetch failed:', e); }
        
        // Fetch lessons first (critical)
        const res = await window.supaDB.getLessons();
        allMaterials = res.data || [];
        
        // Fetch social data (fail silently if tables not yet created)
        try {
          if (window.supaDB.getAllLessonLikes) {
            const likesRes = await window.supaDB.getAllLessonLikes();
            allLikes = likesRes.data || [];
          }
        } catch(e) { console.warn('Likes table not ready yet:', e.message); allLikes = []; }
        
        try {
          if (window.supaDB.getAllLessonComments) {
            const commentsRes = await window.supaDB.getAllLessonComments();
            allComments = commentsRes.data || [];
          }
        } catch(e) { console.warn('Comments table not ready yet:', e.message); allComments = []; }
        
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
        const likes = allLikes.filter(l => l.lesson_id === item.id);
        const hasLiked = currentUserId && likes.some(l => l.user_id === currentUserId);
        const commentsCount = allComments.filter(c => c.lesson_id === item.id).length;
        const caption = (item.content || item.description || '').trim();
        
        cardHtml = `
          <div class="mat-card social-post" id="post-${item.id}">
            ${btnHtml}
            <div class="post-image-wrapper" onclick="openImage('${item.id}')">
              <img class="post-img" src="${item.media_url}" alt="${item.title || item.subtopic}" loading="lazy">
            </div>
            <div class="post-content-wrapper">
              <h3 class="post-title">${item.title || item.subtopic}</h3>
              ${caption ? `
              <div class="post-caption-row">
                <span class="post-caption-text" id="caption-${item.id}">${caption}</span>
                <button class="post-more-btn" id="readmore-${item.id}" onclick="event.stopPropagation(); window.toggleCaption('${item.id}')" style="display:none;">More</button>
              </div>
              ` : ''}
              
              <div class="post-actions">
                <button class="post-action-btn like-btn ${hasLiked ? 'liked' : ''}" onclick="event.stopPropagation(); window.togglePostLike('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${hasLiked ? '#22c55e' : 'none'}" stroke="${hasLiked ? '#22c55e' : '#718096'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                  <span id="like-count-${item.id}">${likes.length}</span>
                </button>
                <button class="post-action-btn comment-btn" onclick="event.stopPropagation(); window.toggleComments('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#718096" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  <span id="comment-count-${item.id}">${commentsCount}</span>
                </button>
                <button class="post-action-btn share-btn" onclick="event.stopPropagation(); window.sharePost('${item.id}')">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#718096" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                  <span class="share-label">Share</span>
                </button>
                <button class="post-action-btn download-btn" onclick="event.stopPropagation(); window.downloadMedia('${item.media_url}', '${(item.title || 'download').replace(/'/g, "\\'")}')" title="Download">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#718096" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
                ${isAdmin ? `
                <button class="post-action-btn admin-btn edit-btn" onclick="event.stopPropagation(); window.editPost('${item.id}')" title="Edit">
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3182ce" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="post-action-btn admin-btn delete-btn" onclick="event.stopPropagation(); window.deletePost('${item.id}')" title="Delete">
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
                ` : ''}
              </div>
              
              <div class="post-comments-section" id="comments-section-${item.id}" style="display:none;">
                <div class="comments-list" id="comments-list-${item.id}"></div>
                <div class="comment-input-wrapper">
                  <input type="text" id="comment-input-${item.id}" class="comment-input" placeholder="Write a comment..." onkeypress="if(event.key==='Enter') window.submitComment('${item.id}')">
                  <button class="comment-submit-btn" onclick="window.submitComment('${item.id}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                </div>
              </div>
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
    // Check captions for "Read More" button
    setTimeout(checkCaptions, 150);
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
    
    const titleElModal = document.getElementById('modalImageTitle');
    if (titleElModal) titleElModal.textContent = item.title || item.subtopic || 'Image Viewer';
    
    const downloadBtn = document.getElementById('imageDownloadBtn');
    if (downloadBtn) downloadBtn.dataset.url = item.media_url;

    const img = document.getElementById('viewerImg');
    img.src = item.media_url;
    
    // Update Details
    const titleEl = document.getElementById('imageViewerTitle');
    const descEl = document.getElementById('imageViewerDesc');
    const detailsContainer = document.getElementById('imageViewerDetails');
    
    if (titleEl && descEl && detailsContainer) {
      titleEl.textContent = item.title || item.subtopic || 'Image';
      descEl.textContent = item.description || item.content || '';
      
      detailsContainer.style.display = 'block';
      
      // Handle Read More Toggle
      descEl.classList.remove('expanded');
      const readMoreBtn = document.getElementById('imageViewerReadMore');
      if (readMoreBtn) {
        readMoreBtn.style.display = 'none';
        readMoreBtn.textContent = 'Read More';
        
        // Use timeout to let DOM render and calculate heights
        setTimeout(() => {
          if (descEl.scrollHeight > descEl.clientHeight) {
            readMoreBtn.style.display = 'inline-block';
            readMoreBtn.onclick = () => {
              if (descEl.classList.contains('expanded')) {
                descEl.classList.remove('expanded');
                readMoreBtn.textContent = 'Read More';
              } else {
                descEl.classList.add('expanded');
                readMoreBtn.textContent = 'Show Less';
              }
            };
          }
        }, 50);
      }
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
    const downloadBtn = document.getElementById('pdfDownloadBtn');
    if (downloadBtn) downloadBtn.dataset.url = url;
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
  // --- Social Interactions --- //

  window.toggleCaption = (postId) => {
    const caption = document.getElementById(`caption-${postId}`);
    const btn = document.getElementById(`readmore-${postId}`);
    if (!caption || !btn) return;
    if (caption.classList.contains('expanded')) {
      caption.classList.remove('expanded');
      btn.textContent = 'More';
    } else {
      caption.classList.add('expanded');
      btn.textContent = 'Less';
    }
  };

  // Re-check caption overflow after render
  function checkCaptions() {
    document.querySelectorAll('.post-caption-text').forEach(caption => {
      if (caption.scrollHeight > caption.clientHeight + 2) {
        const id = caption.id.replace('caption-', '');
        const btn = document.getElementById(`readmore-${id}`);
        if (btn) btn.style.display = 'inline';
      }
    });
  }

  window.togglePostLike = async (postId) => {
    if (!currentUser) {
      window.showToast('Please log in to like posts.', 'warning');
      return;
    }
    const btn = document.querySelector(`#post-${postId} .like-btn`);
    const countSpan = document.getElementById(`like-count-${postId}`);
    
    // Optimistic UI update
    const isLiked = btn.classList.contains('liked');
    let count = parseInt(countSpan.textContent) || 0;
    
    if (isLiked) {
      btn.classList.remove('liked');
      btn.querySelector('svg').setAttribute('fill', 'none');
      btn.querySelector('svg').setAttribute('stroke', '#718096');
      countSpan.textContent = Math.max(0, count - 1);
      allLikes = allLikes.filter(l => !(l.lesson_id === postId && l.user_id === currentUserId));
    } else {
      btn.classList.add('liked');
      btn.querySelector('svg').setAttribute('fill', '#22c55e');
      btn.querySelector('svg').setAttribute('stroke', '#22c55e');
      countSpan.textContent = count + 1;
      allLikes.push({ lesson_id: postId, user_id: currentUserId });
    }
    
    // Server update
    if (window.supaDB && window.supaDB.toggleLessonLike) {
      const res = await window.supaDB.toggleLessonLike(postId, currentUserId);
      if (res.error) {
        window.showToast('Failed to save like.', 'error');
        // Revert UI on failure
        applyFilters(); 
      }
    }
  };

  window.toggleComments = async (postId) => {
    const section = document.getElementById(`comments-section-${postId}`);
    if (!section) return;
    if (section.style.display === 'none' || section.style.display === '') {
      section.style.display = 'block';
      // Always fetch fresh comments when opening
      try {
        if (window.supaDB && window.supaDB.getLessonComments) {
          const { data } = await window.supaDB.getLessonComments(postId);
          if (data) {
            // Merge these fresh comments into global state (replace for this post)
            allComments = allComments.filter(c => c.lesson_id !== postId).concat(data);
          }
        }
      } catch(e) { console.warn('Could not fetch comments:', e.message); }
      renderComments(postId);
    } else {
      section.style.display = 'none';
    }
  };

  function renderComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;
    
    const postComments = allComments.filter(c => c.lesson_id === postId);
    if (postComments.length === 0) {
      list.innerHTML = '<div style="color:var(--text-light); font-size:12px; padding:10px 0;">No comments yet. Be the first!</div>';
      return;
    }
    
    // Build thread tree
    const rootComments = postComments.filter(c => !c.parent_id);
    const replies = postComments.filter(c => c.parent_id);
    
    let html = '';
    rootComments.forEach(c => {
      const cReplies = replies.filter(r => r.parent_id === c.id);
      html += generateCommentHtml(c, cReplies);
    });
    list.innerHTML = html;
  }

  function generateCommentHtml(comment, replies = [], isReply = false) {
    const name = profileMap[comment.user_id] || 'Student';
    const avatar = name.charAt(0);
    const time = new Date(comment.created_at).toLocaleString();
    
    let repliesHtml = '';
    if (replies.length > 0) {
      repliesHtml = `<div class="comment-replies">` + replies.map(r => generateCommentHtml(r, [], true)).join('') + `</div>`;
    }
    
    return `
      <div class="comment-item ${isReply ? 'is-reply' : ''}" id="comment-${comment.id}">
        <div class="comment-avatar">${avatar}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-name">${name}</span>
            <span class="comment-time">${time}</span>
          </div>
          <div class="comment-text">${comment.content}</div>
          <div class="comment-actions">
            <button onclick="window.replyToComment('${comment.lesson_id}', '${comment.id}', '${name}')">Reply</button>
            ${isAdmin ? `<button style="color:var(--danger)" onclick="window.deleteComment('${comment.id}', '${comment.lesson_id}')">Delete</button>` : ''}
          </div>
          ${repliesHtml}
        </div>
      </div>
    `;
  }

  window.replyToComment = (postId, parentId, parentName) => {
    if (!currentUser) {
      window.showToast('Please log in to reply.', 'warning');
      return;
    }
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
      input.value = `@${parentName} `;
      input.dataset.parentId = parentId;
      input.focus();
    }
  };

  window.submitComment = async (postId) => {
    if (!currentUser) {
      window.showToast('Please log in to comment.', 'warning');
      return;
    }
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    
    const parentId = input.dataset.parentId || null;
    input.value = '';
    input.disabled = true;
    
    if (window.supaDB && window.supaDB.addLessonComment) {
      const { data, error } = await window.supaDB.addLessonComment(postId, currentUserId, content, parentId);
      if (error) {
        window.showToast('Failed to post comment.', 'error');
      } else if (data) {
        allComments.push(data);
        const countSpan = document.getElementById(`comment-count-${postId}`);
        if (countSpan) {
          const currentCount = parseInt(countSpan.textContent) || 0;
          countSpan.textContent = currentCount + 1;
        }
        renderComments(postId);
      }
    }
    input.disabled = false;
    delete input.dataset.parentId;
  };

  window.deleteComment = async (commentId, postId) => {
    if (!isAdmin) return;
    if (!confirm('Delete this comment?')) return;
    
    const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (client) {
      const { error } = await client.from('lesson_comments').delete().eq('id', commentId);
      if (!error) {
        allComments = allComments.filter(c => c.id !== commentId && c.parent_id !== commentId);
        renderComments(postId);
        const countSpan = document.getElementById(`comment-count-${postId}`);
        if (countSpan) countSpan.textContent = allComments.filter(c => c.lesson_id === postId).length;
      }
    }
  };

  window.sharePost = async (postId) => {
    const url = window.location.href.split('?')[0] + '?post=' + postId;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NTC Prep Material',
          url: url
        });
      } catch (err) {
        console.log('Share dismissed');
      }
    } else {
      navigator.clipboard.writeText(url).then(() => {
        window.showToast('Link copied to clipboard!', 'success');
      });
    }
  };

  window.downloadMedia = async (url, title) => {
    try {
      window.showToast('Starting download...', 'success');
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      
      // Clean up title for filename
      let safeTitle = (title || 'download').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      // Try to get extension from URL
      const extMatch = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
      const ext = extMatch ? extMatch[1] : 'jpg';
      
      a.download = `${safeTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.warn('Blob download failed, falling back to direct link:', e);
      // Fallback: just open in new tab and let browser handle it
      const a = document.createElement('a');
      a.href = url;
      a.download = title || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  window.editPost = (postId) => {
    // Redirect admin to dashboard to edit
    window.location.href = '/pages/dashboard.html#lessons';
  };

  window.deletePost = async (postId) => {
    if (!isAdmin) return;
    if (!confirm('Are you sure you want to delete this post?')) return;
    if (window.supaDB && window.supaDB.deleteLesson) {
      const { error } = await window.supaDB.deleteLesson(postId);
      if (!error) {
        allMaterials = allMaterials.filter(m => m.id !== postId);
        applyFilters();
        window.showToast('Post deleted.', 'success');
      }
    }
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
