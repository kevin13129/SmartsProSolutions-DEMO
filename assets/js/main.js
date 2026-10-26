/**
 * SMARTS PRO SOLUTIONS - GENERAL UI CONTROLLER
 * Handles slide-out mobile drawer, widescreen hero transitions,
 * scroll-reveal animations, service filtering, and UI polish.
 */

(function () {
  'use strict';

  // --- 1. Slide-Out Mobile Drawer Navigation ---
  const mobileToggle = document.getElementById('mobile-nav-toggle');
  const drawerOverlay = document.getElementById('mobile-drawer-overlay');
  const drawerPanel = document.getElementById('mobile-drawer');
  const drawerCloseBtn = document.getElementById('mobile-drawer-close');
  const drawerBrandLink = document.getElementById('drawer-brand-link');
  const drawerNavLinks = document.querySelectorAll('.drawer-nav-link, .drawer-cta-btn');

  const setDrawerState = (open) => {
    if (!drawerOverlay || !mobileToggle) return;
    drawerOverlay.classList.toggle('is-open', open);
    drawerOverlay.classList.toggle('open', open);
    drawerOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    mobileToggle.classList.toggle('is-open', open);
    mobileToggle.classList.toggle('open', open);
    mobileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('modal-open', open);
  };

  if (mobileToggle && drawerOverlay) {
    mobileToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const isCurrentlyOpen =
        drawerOverlay.classList.contains('is-open') ||
        drawerOverlay.classList.contains('open');
      setDrawerState(!isCurrentlyOpen);
    });

    if (drawerCloseBtn) {
      drawerCloseBtn.addEventListener('click', () => setDrawerState(false));
    }

    if (drawerBrandLink) {
      drawerBrandLink.addEventListener('click', () => setDrawerState(false));
    }

    drawerOverlay.addEventListener('click', (event) => {
      if (drawerPanel && !drawerPanel.contains(event.target)) {
        setDrawerState(false);
      }
    });

    drawerNavLinks.forEach((link) => {
      link.addEventListener('click', () => {
        setDrawerState(false);
      });
    });

    document.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        (drawerOverlay.classList.contains('is-open') || drawerOverlay.classList.contains('open'))
      ) {
        setDrawerState(false);
        mobileToggle.focus();
      }
    });
  }

  // --- 2. Header Scroll Elevation & Active Section Scroll-Spy ---
  const header = document.querySelector('.site-header');
  const desktopNavLinks = document.querySelectorAll('.nav-links .nav-link');
  const trackedSectionIds = ['calculator', 'services', 'commercial', 'checklist', 'why-us', 'contact'];
  const trackedSections = trackedSectionIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const updateScrollState = () => {
    if (window.scrollY > 20) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }

    if (trackedSections.length > 0 && desktopNavLinks.length > 0) {
      const scrollPosition = window.scrollY + 180;
      let currentSectionId = '';

      trackedSections.forEach((section) => {
        if (section.offsetTop <= scrollPosition) {
          currentSectionId = section.id;
        }
      });

      desktopNavLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const matches = Boolean(currentSectionId && href === '#' + currentSectionId);
        link.classList.toggle('is-active', matches);
      });
    }
  };

  window.addEventListener('scroll', updateScrollState, { passive: true });
  updateScrollState();

  // --- 3. Animated Services Tabs Filtering ---
  const serviceTabs = document.querySelectorAll('.tab-btn');
  const serviceCards = document.querySelectorAll('.service-feature-card');

  serviceTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');

      serviceCards.forEach((card) => {
        const category = card.getAttribute('data-category');
        const shouldShow = filter === 'all' || category === filter;

        if (shouldShow) {
          card.style.display = 'flex';
          card.classList.remove('card-filtering-in');
          void card.offsetWidth;
          card.classList.add('card-filtering-in');
        } else {
          card.classList.remove('card-filtering-in');
          card.style.display = 'none';
        }
      });
    });
  });

  // --- 4. Scroll-to-Top Button ---
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

  // --- 5. Widescreen Hero Slideshow & Spotlight Transitions ---
  const heroSlides = document.querySelectorAll('.hero-slide');
  const heroTabs = document.querySelectorAll('.hero-slide-tab');
  const spotlightCard = document.getElementById('hero-spotlight-card');
  const prevBtn = document.getElementById('hero-slide-prev');
  const nextBtn = document.getElementById('hero-slide-next');
  const stepEl = document.getElementById('hero-active-step');
  const catEl = document.getElementById('hero-active-category');
  const titleEl = document.getElementById('hero-active-title');
  const descEl = document.getElementById('hero-active-desc');

  const slideCopy = [
    {
      step: '01 / 03',
      category: 'Luxury Residential Homes',
      title: 'Precision Recurring & One-Time Home Care',
      desc: 'Meticulous detailing of living spaces, hardwood and stone floors, bedrooms, and high-touch surfaces with pet-friendly, detail-oriented care.'
    },
    {
      step: '02 / 03',
      category: 'Deep Kitchen & Bath Restoration',
      title: 'Intensive Hand-Scrubbed Detail & Move Turnovers',
      desc: 'From marble countertops and stainless appliances to baseboards, cabinetry, and grout lines—restoring every corner to inspection-ready brilliance.'
    },
    {
      step: '03 / 03',
      category: 'Executive Commercial & Office Suites',
      title: 'Dependable After-Hours & Scheduled Janitorial',
      desc: 'Spotless conference rooms, reception lobbies, workstations, and restrooms maintained on your custom schedule across Shreveport and Bossier City.'
    }
  ];

  if (heroSlides.length > 0) {
    let activeSlide = 0;
    let slideTimer = null;
    let copyTimer = null;

    const updateSpotlightCopy = (copy) => {
      if (!copy) return;
      if (stepEl) stepEl.textContent = copy.step;
      if (catEl) catEl.textContent = copy.category;
      if (titleEl) titleEl.textContent = copy.title;
      if (descEl) descEl.textContent = copy.desc;
    };

    const setHeroSlide = (index, animateCopy = true) => {
      const nextIndex = (index + heroSlides.length) % heroSlides.length;
      if (nextIndex === activeSlide && animateCopy) return;
      activeSlide = nextIndex;

      heroSlides.forEach((slide, idx) => {
        slide.classList.toggle('is-active', idx === activeSlide);
      });

      heroTabs.forEach((tab, idx) => {
        const isCurrent = idx === activeSlide;
        tab.classList.remove('is-active');
        tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
        if (isCurrent) {
          void tab.offsetWidth;
          tab.classList.add('is-active');
        }
      });

      const currentCopy = slideCopy[activeSlide];
      if (spotlightCard && animateCopy) {
        spotlightCard.classList.add('is-transitioning');
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          updateSpotlightCopy(currentCopy);
          spotlightCard.classList.remove('is-transitioning');
        }, 160);
      } else {
        updateSpotlightCopy(currentCopy);
      }
    };

    const startSlideTimer = () => {
      if (slideTimer) clearInterval(slideTimer);
      slideTimer = setInterval(() => {
        setHeroSlide(activeSlide + 1, true);
      }, 5500);
    };

    heroTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = Number(tab.getAttribute('data-slide-target'));
        if (!Number.isNaN(target)) {
          setHeroSlide(target, true);
          startSlideTimer();
        }
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        setHeroSlide(activeSlide - 1, true);
        startSlideTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        setHeroSlide(activeSlide + 1, true);
        startSlideTimer();
      });
    }

    startSlideTimer();
  }

  // --- 6. Scroll-Reveal Viewport Observer ---
  const revealElements = document.querySelectorAll('.reveal-on-scroll');
  if (revealElements.length > 0) {
    document.documentElement.classList.add('js-ready');

    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              observer.unobserve(entry.target);
            }
          });
        },
        {
          root: null,
          rootMargin: '0px 0px -8% 0px',
          threshold: 0.12
        }
      );

      revealElements.forEach((el) => revealObserver.observe(el));
    } else {
      revealElements.forEach((el) => el.classList.add('is-visible'));
    }
  }

  // --- 7. Live Calculator Price Feedback Pulse ---
  const calcContainer = document.querySelector('.calc-inputs-wrapper');
  const priceDisplay = document.querySelector('.quote-price-amount');
  if (calcContainer && priceDisplay) {
    let pulseTimeout = null;
    const triggerPricePulse = () => {
      priceDisplay.classList.add('price-pulse');
      if (pulseTimeout) clearTimeout(pulseTimeout);
      pulseTimeout = setTimeout(() => {
        priceDisplay.classList.remove('price-pulse');
      }, 220);
    };

    calcContainer.addEventListener('click', (event) => {
      const interactive = event.target.closest('button, label.service-card-option, label.freq-card-option');
      if (interactive) triggerPricePulse();
    });

    calcContainer.addEventListener('input', () => {
      triggerPricePulse();
    });
  }
})();

