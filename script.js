
// Nav scroll
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) {
    if (window.scrollY > 40) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  document.querySelectorAll('.section').forEach(s => {
    if (s.getBoundingClientRect().top < window.innerHeight * 0.9) s.classList.add('visible');
  });
});

// Mobile menu
function toggleMenu() {
  const menu = document.getElementById('mobileMenu');
  if (menu) menu.classList.toggle('open');
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

window.dispatchEvent(new Event('scroll'));
