// Header show/hide on scroll + scrolled state
(() => {
    const header = document.querySelector('.nav');
    if (!header) return;

    let lastY = window.scrollY || 0;
    const tolerance = 10; // small threshold to avoid jitter
    const hideOffset = 80; // only hide when scrolled this far
    let ticking = false;

    const updateHeader = () => {
        const y = window.scrollY || 0;

        // scrolled state (blur + background)
        if (y >= 50) header.classList.add('nav-scrolled');
        else header.classList.remove('nav-scrolled');

        // detect direction
        const delta = y - lastY;

        if (Math.abs(delta) > tolerance) {
            if (delta > 0 && y > hideOffset) {
                // scrolling down
                header.classList.add('nav-hidden');
            } else if (delta < 0) {
                // scrolling up
                header.classList.remove('nav-hidden');
            }
        }

        lastY = y;
        ticking = false;
    };

    const onScroll = () => {
        if (!ticking) {
            requestAnimationFrame(updateHeader);
            ticking = true;
        }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
})();


// Initialize Swiper only if container exists and Swiper library is loaded
let swiperProducts;
if (document.querySelector(".products__container") && typeof Swiper !== 'undefined') {
    swiperProducts = new Swiper(".products__container" , {
        spaceBetween: 32,
        grabCursor: true,
        centeredSlides: true,
        slidePerView: 'auto',
        loop: true,
        autoplay: {delay: 3500 , disableOnInteraction: false},

        navigation: {
            nextEl: ".swiper-button-next",
            prevEl: ".swiper-button-prev",
        },
        breakpoints: {
            320: {
                slidesPerView: 1,
                spaceBetween: 20,
            },
            480: {
                slidesPerView: 2,
                spaceBetween: 20,
            },
            640: {
                slidesPerView: 2,
                spaceBetween: 40,
            },
            768: {
                slidesPerView: 2,
                spaceBetween: 50,
            },
            1024: {
            slidesPerView: 3,
            spaceBetween: 62,
        },
 
    },
    });
}



 const sections = document.querySelectorAll( 'section[id]' )

 const scrollActive = () => {
    const scrollY = window.pageYOffset

    sections.forEach( current => {
        const sectionHeight = current.offsetHeight,
              sectionTop = current.offsetTop - 58,
              sectionId = current.getAttribute( 'id' )
        
        // Cache the element to avoid redundant DOM lookups
        const sectionLink = document.querySelector( '.nav__menu a[href*=' + sectionId + ']' )

        if (sectionLink) {
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                sectionLink.classList.add('active-link')
            } else {
                sectionLink.classList.remove('active-link')
            }
        }
    })
 }

 let scrollActiveTicking = false;
 const onScrollActive = () => {
    if (!scrollActiveTicking) {
        requestAnimationFrame(() => {
            scrollActive();
            scrollActiveTicking = false;
        });
        scrollActiveTicking = true;
    }
 };
 if (sections.length) window.addEventListener( 'scroll' , onScrollActive, { passive: true });


(() => {
    const scrollUp = () => {
        const scrollUpEl = document.getElementById('scroll-up');
        if (scrollUpEl) {
            window.scrollY >= 350 ? scrollUpEl.classList.add('show-scroll')
            : scrollUpEl.classList.remove('show-scroll')
        }
    }
    window.addEventListener('scroll', scrollUp, { passive: true });
    scrollUp(); // Check on load
})();

/* ScrollReveal configuration for scroll animations */
if (typeof ScrollReveal !== 'undefined') {
    const sr = ScrollReveal({
        origin: 'bottom',
        distance: '60px',
        duration: 800,
        delay: 100,
        reset: false,
        easing: 'ease'
    });

    // let ScrollReveal handle some elements but we'll use IntersectionObserver for sections
    // sr.reveal('.section', { interval: 100 });
    sr.reveal('.collections-title', { delay: 200 });
}

/* Page load animation trigger */
document.addEventListener('DOMContentLoaded', () => {
    document.body.style.animation = 'pageLoadFade 0.8s ease-out forwards';
});

/* IntersectionObserver to reveal .section elements from sides (replay on re-entry) */
(() => {
    const revealEls = document.querySelectorAll('.section, .slider-wrapper');
    if (!('IntersectionObserver' in window) || !revealEls.length) return;

    const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const el = entry.target;
            const idx = parseInt(el.dataset.index) || 0;

            if (entry.isIntersecting) {
                // set a per-entry stagger so repeated entries still feel staggered
                el.style.transitionDelay = (idx * 90) + 'ms';
                el.classList.add('in-view');
            } else {
                // remove the class on exit so the animation can replay on next entry
                el.classList.remove('in-view');
                // clear any inline delay so it will be recomputed on next entry
                el.style.transitionDelay = '';
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });

    revealEls.forEach(s => io.observe(s));
})();

/* Separate IntersectionObserver for footer columns - each column animates independently */
(() => {
    const footer = document.querySelector('.footer');
    if (!footer || !('IntersectionObserver' in window)) return;
    
    const footerCols = footer.querySelectorAll(':scope > div');
    if (!footerCols.length) return;
    
    // Observe footer itself for the base animation
    const footerIO = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                footer.classList.add('in-view');
            } else {
                footer.classList.remove('in-view');
            }
        });
    }, { threshold: 0.05 });
    footerIO.observe(footer);
    
    // Observe each column separately for independent fade in/out
    // Use different thresholds based on column index for staggered effect
    footerCols.forEach((col, index) => {
        const colIO = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Add delay based on column index for staggered entrance
                    setTimeout(() => {
                        col.classList.add('in-view');
                    }, index * 150);
                } else {
                    col.classList.remove('in-view');
                }
            });
        }, { 
            threshold: 0.3,
            rootMargin: '0px 0px -15% 0px'
        });
        
        colIO.observe(col);
    });
})();


// Theme toggle (only if element exists)
const themeButton = document.getElementById('theme-button')
if (themeButton) {
    const darkTheme = 'dark-theme'
    const iconTheme = 'ri-sun-line'

    const selectedTheme = localStorage.getItem('selected-theme')
    const selectedIcon = localStorage.getItem('selected-icon')

    const getCurrentTheme = () => document.body.classList.contains(darkTheme) ? 'dark' : 'light'
    const getCurrentIcon = () => themeButton.classList.contains(iconTheme) ? 'ri-moon-line' : 'ri-sun-line'

    if (selectedTheme) {
        document.body.classList[selectedTheme === 'dark' ? 'add' : 'remove'](darkTheme)
        themeButton.classList[selectedIcon === 'ri-moon-line' ? 'add' : 'remove'](iconTheme)
    }

    themeButton.addEventListener('click', () => {
        document.body.classList.toggle(darkTheme)
        themeButton.classList.toggle(iconTheme)
        localStorage.setItem('selected-theme', getCurrentTheme())
        localStorage.setItem('selected-icon', getCurrentIcon())
    })
}


// ScrollReveal (only if available)
if (typeof ScrollReveal !== 'undefined') {
    const sr = ScrollReveal({ 
        origin: 'top',
        distance: '60px',
        duration: 2500,
        delay: 400,
    // reset: true,
    })

    sr.reveal('.home__data')
    sr.reveal('.home__images', {delay: 600,origin: 'bottom'})
    sr.reveal('.new__card' , {delay: 400})
    sr.reveal('.products__container')
    sr.reveal('.brand__container')
    sr.reveal('.footer__info')
    sr.reveal('.footer__container')
    sr.reveal('.collection__explore:nth-child(1)', {origin: 'right'})
    sr.reveal('.collection__explore:nth-child(2)', {origin: 'left'})
}

const video = document.querySelector('.video video');
const playButton = document.querySelector('.video-button');
const videoIcon = document.querySelector('.video-button i');

/* Smooth scroll helper for internal links (accounts for fixed header) */
function smoothScrollTo(targetY, duration = 600) {
    const startY = window.scrollY || window.pageYOffset;
    const diff = targetY - startY;
    if (!diff) return;
    const start = performance.now();

    const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function step(now) {
        const elapsed = Math.min((now - start) / duration, 1);
        const pct = easeInOutCubic(elapsed);
        window.scrollTo(0, Math.round(startY + diff * pct));
        if (elapsed < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

// Delegate clicks for anchor links to enable smooth scrolling and account for header
document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#') return;

    const targetEl = document.querySelector(href);
    if (!targetEl) return;

    e.preventDefault();

    // If fullscreen menu is open, close it first so layout is stable
    try { if (typeof closeFullMenu === 'function') closeFullMenu(); } catch (err) {}

    const header = document.querySelector('.nav');
    const headerHeight = header ? Math.round(header.getBoundingClientRect().height) : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-height')) || 80;
    const offset = 8; // small gap from top
    const targetY = window.scrollY + targetEl.getBoundingClientRect().top - headerHeight - offset;

    smoothScrollTo(targetY, 650);
    // move focus for accessibility after scrolling
    setTimeout(() => {
        targetEl.setAttribute('tabindex', '-1');
        targetEl.focus({ preventScroll: true });
    }, 700);
});

// ============ SERVICE WORKER & PWA AUTO-UPDATE ============
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { 
            scope: '/',
            updateViaCache: 'none' // Bypass HTTP cache for sw.js
        })
        .then(reg => {
            console.log('[PWA] Service Worker registered');
            
            // Check for updates when returning to the tab (non-intrusive)
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) reg.update();
            });
        })
        .catch(err => console.error('[PWA] Registration failed:', err));
    });
}

// ============ PAGE TRANSITIONS ============
document.addEventListener('DOMContentLoaded', () => {
    // Create overlay if not exists - start with active class for fade-in effect
    if (!document.querySelector('.page-transition-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'page-transition-overlay active';
        document.body.appendChild(overlay);
    }

    const overlay = document.querySelector('.page-transition-overlay');
    
    // Fade in effect - remove active class after a brief delay
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.remove('active');
        });
    });

    // Handle internal links
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        // Ignore external links, anchors, special protocols, or javascript: links
        if (!href || 
            href.startsWith('#') || 
            href.startsWith('mailto:') || 
            href.startsWith('tel:') || 
            href.startsWith('javascript:') ||
            href.startsWith('http://') ||
            href.startsWith('https://') ||
            link.target === '_blank' ||
            link.hasAttribute('download')) return;
        
        // Check if it's an internal navigation link (any relative link)
        const isInternal = !href.includes('://') && !href.startsWith('//');
        if (isInternal) {
            e.preventDefault();
            overlay.classList.add('active');

            setTimeout(() => {
                window.location.href = href;
            }, 250); // Smooth 250ms transition
        }
    });

    // Fade in on page load and back/forward navigation
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) {
            // Page was loaded from bfcache
            overlay.classList.add('active');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    overlay.classList.remove('active');
                });
            });
        }
    });
});

// ============ SCROLL ANIMATIONS ============
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

window.observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            window.observer.unobserve(entry.target); // Only animate once
        }
    });
}, observerOptions);

// Expose a helper to observe new elements
window.observeElements = (selector = '.animate-fade-up') => {
    document.querySelectorAll(selector).forEach(el => window.observer.observe(el));
};

document.addEventListener('DOMContentLoaded', () => {
    // Observe elements with .animate-fade-up
    window.observeElements();
    
    // Add smooth scrolling to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            
            if (href === '#') {
                window.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
                return;
            }
            
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

/* Cookie Consent Logic */
document.addEventListener('DOMContentLoaded', () => {
    const cookieConsent = document.getElementById('cookie-consent');
    const acceptBtn = document.getElementById('accept-cookies');
    const declineBtn = document.getElementById('decline-cookies');

    if (!cookieConsent) return;

    // Check if user has already made a choice
    if (!localStorage.getItem('cookieConsent')) {
        // Show banner after a short delay
        setTimeout(() => {
            cookieConsent.classList.remove('hidden');
        }, 2000);
    }

    acceptBtn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'accepted');
        cookieConsent.classList.add('hidden');
        // Initialize analytics or other cookie-dependent scripts here
    });

    declineBtn.addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'declined');
        cookieConsent.classList.add('hidden');
    });
});

// Newsletter Subscription
async function subscribeNewsletter(event) {
    event.preventDefault();
    
    const form = event.target;
    const emailInput = form.querySelector('.newsletter-input');
    const btn = form.querySelector('.newsletter-btn');
    const email = emailInput.value.trim();
    
    if (!email) {
        window.showToast('Please enter your email address', 'error');
        return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        window.showToast('Please enter a valid email address', 'error');
        return;
    }
    
    // Disable button while processing
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s linear infinite;"></i>';
    
    try {
        const API_BASE = window.location.origin + '/api';
        const response = await fetch(`${API_BASE}/marketing/newsletter/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Check if already subscribed
            if (data.message && data.message.includes('already')) {
                window.showToast('You are already subscribed to our newsletter!', 'info');
            } else {
                window.showToast('Thank you for subscribing! 🎉', 'success');
                emailInput.value = '';
            }
        } else {
            window.showToast(data.error || 'Failed to subscribe', 'error');
        }
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        window.showToast('Failed to subscribe. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

/* Main Marketing Popup Logic */
async function initMarketingPopup() {
    // Only show on home page (where marketing-popup element exists)
    const popupEl = document.getElementById('marketing-popup');
    if (!popupEl) return;

    // Don't show if user has seen it this session
    if (sessionStorage.getItem('blackonn_popup_shown')) return;

    try {
        const response = await fetch('/api/marketing/popups/active');
        const data = await response.json();

        if (data.success && data.popup) {
            const popup = data.popup;
            const delay = popup.delay || 5000;

            setTimeout(() => {
                const body = document.getElementById('marketing-popup-body');
                body.innerHTML = `
                    <div class="marketing-modal-body">
                        ${popup.image ? `<img src="${popup.image}" alt="Special Offer" style="max-width: 100%; border-radius: 10px; margin-bottom: 20px;">` : ''}
                        <h2>${popup.title}</h2>
                        <p>${popup.message || ''}</p>
                        <a href="${popup.ctaLink || '/products.html'}" class="cta-button">${popup.ctaText || 'Grab Offer'}</a>
                    </div>
                `;

                popupEl.style.display = 'flex';
                // Trigger reflow for transition
                popupEl.offsetHeight;
                popupEl.classList.add('show');

                // Mark as shown
                if (popup.showOnce !== false) {
                    sessionStorage.setItem('blackonn_popup_shown', 'true');
                }

                // Close logic
                document.getElementById('close-marketing-popup').onclick = () => {
                    popupEl.classList.remove('show');
                    setTimeout(() => { popupEl.style.display = 'none'; }, 300);
                };

                // Close on outside click
                popupEl.onclick = (e) => {
                    if (e.target === popupEl) {
                        popupEl.classList.remove('show');
                        setTimeout(() => { popupEl.style.display = 'none'; }, 300);
                    }
                };
            }, delay);
        }
    } catch (error) {
        console.error('Failed to load marketing popup:', error);
    }
}

// Initialize popup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketingPopup);
} else {
    initMarketingPopup();
}

