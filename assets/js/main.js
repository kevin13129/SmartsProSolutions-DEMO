/**
 * SMARTS PRO SOLUTIONS - GENERAL UI CONTROLLER
 * Handles navigation, tab switching, and UI polish.
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

    // Close when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
      });
    });
  }

  // Header scroll appearance
  const header = document.querySelector('.site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  });

  // Services tabs filtering
  const serviceTabs = document.querySelectorAll('.tab-btn');
  const serviceCards = document.querySelectorAll('.service-feature-card');

  serviceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      serviceTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');

      serviceCards.forEach(card => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
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

  // Widescreen Hero Slideshow Controller
  const heroSlides = document.querySelectorAll('.hero-slide');
  const heroTabs = document.querySelectorAll('.hero-slide-tab');
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
      desc: 'Meticulous sanitization of living spaces, hardwood and stone floors, bedrooms, and high-touch surfaces using non-toxic, family-safe formulas.'
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

    const setHeroSlide = (index) => {
      activeSlide = (index + heroSlides.length) % heroSlides.length;

      heroSlides.forEach((slide, idx) => {
        slide.classList.toggle('is-active', idx === activeSlide);
      });

      heroTabs.forEach((tab, idx) => {
        const isCurrent = idx === activeSlide;
        tab.classList.toggle('is-active', isCurrent);
        tab.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });

      const currentCopy = slideCopy[activeSlide];
      if (currentCopy) {
        if (stepEl) stepEl.textContent = currentCopy.step;
        if (catEl) catEl.textContent = currentCopy.category;
        if (titleEl) titleEl.textContent = currentCopy.title;
        if (descEl) descEl.textContent = currentCopy.desc;
      }
    };

    const startSlideTimer = () => {
      if (slideTimer) clearInterval(slideTimer);
      slideTimer = setInterval(() => {
        setHeroSlide(activeSlide + 1);
      }, 5500);
    };

    heroTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = Number(tab.getAttribute('data-slide-target'));
        if (!Number.isNaN(target)) {
          setHeroSlide(target);
          startSlideTimer();
        }
      });
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        setHeroSlide(activeSlide - 1);
        startSlideTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        setHeroSlide(activeSlide + 1);
        startSlideTimer();
      });
    }

    startSlideTimer();
  }
})();
