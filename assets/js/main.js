/**
 * SMARTS PRO SOLUTIONS - GENERAL UI & HERO REEL CONTROLLER
 * Handles navigation, slow-motion video reel crossfades, tab switching, and scroll polish.
 */

(function () {
  'use strict';

  // Mobile menu toggle
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isExpanded = navLinks.classList.toggle('mobile-open');
      mobileToggle.setAttribute('aria-expanded', isExpanded);
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        mobileToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Header scroll appearance & Mobile Quote Dock visibility
  const header = document.querySelector('.site-header');
  const mobileDock = document.getElementById('mobile-quote-dock');
  const calcSection = document.getElementById('calculator');

  function updateScrollUI() {
    if (window.scrollY > 20) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
    if (mobileDock && calcSection) {
      const rect = calcSection.getBoundingClientRect();
      const inView = rect.top < window.innerHeight * 0.85 && rect.bottom > 160;
      mobileDock.classList.toggle('visible', inView);
    }
  }

  window.addEventListener('scroll', updateScrollUI, { passive: true });
  window.addEventListener('resize', updateScrollUI, { passive: true });

  // Services tabs filtering (using .hidden for strict CSP cleanliness)
  const serviceTabs = document.querySelectorAll('.tab-btn');
  const serviceCards = document.querySelectorAll('.service-feature-card');

  serviceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');

      serviceCards.forEach(card => {
        const category = card.getAttribute('data-category');
        const matches = filter === 'all' || category === filter;
        card.hidden = !matches;
      });
    });
  });

  // Scroll to top button
  const scrollTopBtn = document.getElementById('btn-scroll-top');
  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    }, { passive: true });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // Hero Slow-Motion Video Reel Crossfader
  const reel = document.getElementById('hero-reel');
  if (reel) {
    const slides = [...reel.querySelectorAll('.hero-reel-slide')];
    const tabs = [...reel.querySelectorAll('.hero-reel-tab')];
    const badgeEl = document.getElementById('hero-reel-badge');
    const titleEl = document.getElementById('hero-reel-title');
    const subEl = document.getElementById('hero-reel-sub');
    const ctaEl = document.getElementById('hero-reel-cta');
    const toggleBtn = document.getElementById('hero-reel-toggle');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;

    let currentIndex = 0;
    let paused = reducedMotion;
    let timerId = null;
    const intervalMs = 5200;

    function syncVideoPlayback(activeSlide) {
      slides.forEach(slide => {
        const video = slide.querySelector('video');
        if (!video) return;
        video.playbackRate = 0.65;
        if (slide === activeSlide && !paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }

    function selectSlide(nextIndex) {
      currentIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
      const activeSlide = slides[currentIndex];
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentIndex);
      });
      tabs.forEach((tab, idx) => {
        const isCurrent = idx === currentIndex;
        tab.classList.toggle('active', isCurrent);
        tab.setAttribute('aria-selected', String(isCurrent));
      });
      if (badgeEl) badgeEl.textContent = activeSlide.dataset.reelTag || '';
      if (titleEl) titleEl.textContent = activeSlide.dataset.reelTitle || '';
      if (subEl) subEl.textContent = activeSlide.dataset.reelSub || '';
      if (ctaEl) {
        ctaEl.textContent = activeSlide.dataset.reelCta || 'Explore Estimate →';
        ctaEl.dataset.quickService = activeSlide.dataset.reelService || 'residential';
        ctaEl.dataset.quickLevel = activeSlide.dataset.reelLevel || '';
      }
      syncVideoPlayback(activeSlide);
    }

    function scheduleNext() {
      if (timerId) clearInterval(timerId);
      if (!paused) {
        timerId = setInterval(() => {
          selectSlide(currentIndex + 1);
        }, intervalMs);
      }
    }

    function togglePause(forceState) {
      paused = typeof forceState === 'boolean' ? forceState : !paused;
      reel.classList.toggle('reel-paused', paused);
      if (toggleBtn) {
        toggleBtn.textContent = paused ? 'Play' : 'Pause';
        toggleBtn.setAttribute('aria-pressed', String(paused));
        toggleBtn.setAttribute('aria-label', paused ? 'Play cleaning reel' : 'Pause cleaning reel');
      }
      syncVideoPlayback(slides[currentIndex]);
      scheduleNext();
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        selectSlide(Number(tab.dataset.slide) || 0);
        scheduleNext();
      });
    });

    toggleBtn?.addEventListener('click', () => togglePause());

    selectSlide(0);
    if (paused) togglePause(true);
    else scheduleNext();

    window.SmartsProReel = Object.freeze({
      selectSlide,
      togglePause,
      getCurrentIndex: () => currentIndex
    });
  }

  updateScrollUI();
})();
