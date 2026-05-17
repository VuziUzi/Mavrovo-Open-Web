
// Nav scroll
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (window.scrollY > 40) nav.classList.add('scrolled');
  else nav.classList.remove('scrolled');
  document.querySelectorAll('.section').forEach(s => {
    if (s.getBoundingClientRect().top < window.innerHeight * 0.9) s.classList.add('visible');
  });
});

// Mobile menu
function toggleMenu() {
  document.getElementById('mobileMenu').classList.toggle('open');
}

// FAQ
document.addEventListener('click', e => {
  const faq = e.target.closest('.faq-item');
  if (faq) faq.classList.toggle('open');
});

// Counter animation
const counterObs = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.querySelectorAll('[data-count]').forEach(el => {
        const end = parseInt(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        let current = 0;
        const step = end / 60;
        const timer = setInterval(() => {
          current += step;
          if (current >= end) { el.textContent = end.toLocaleString() + suffix; clearInterval(timer); }
          else el.textContent = Math.floor(current).toLocaleString() + suffix;
        }, 16);
      });
      counterObs.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.stats').forEach(s => counterObs.observe(s));

// Gallery lightbox
let currentImg = 0;
const galleryImages = [];
document.querySelectorAll('.gallery-item img').forEach((img, i) => {
  galleryImages.push(img.src);
  img.addEventListener('click', () => { currentImg = i; openLightbox(); });
});
function openLightbox() {
  const lb = document.getElementById('lightbox');
  lb.classList.add('open');
  document.getElementById('lightbox-img').src = galleryImages[currentImg];
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}
function nextImg() { currentImg = (currentImg + 1) % galleryImages.length; document.getElementById('lightbox-img').src = galleryImages[currentImg]; }
function prevImg() { currentImg = (currentImg - 1 + galleryImages.length) % galleryImages.length; document.getElementById('lightbox-img').src = galleryImages[currentImg]; }
document.addEventListener('keydown', e => {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowRight') nextImg();
  if (e.key === 'ArrowLeft') prevImg();
});

window.dispatchEvent(new Event('scroll'));
