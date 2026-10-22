// trueclone test fixture (our own code). The rules of change a clone must follow:
// - the gallery is shuffled once at startup (Fisher-Yates over Math.random), as heybhaskar's playground was;
// - the carousel advances every 3 s, wraps, and steps with its buttons;
// - the intro class set before load is removed once the page has loaded, and the hero fades in.
const COLORS = ['#2a5bd7', '#d7572a', '#2ad78a', '#8a2ad7', '#d7c32a', '#2ac3d7', '#d72a8a', '#5b5b5b'];
const items = COLORS.map((c, i) => ({ c, label: `Item ${i + 1}`, wide: i === 2 || i === 5 }));
for (let i = items.length - 1; i > 0; i--) {
  const j = (Math.random() * (i + 1)) | 0;
  [items[i], items[j]] = [items[j], items[i]];
}
const grid = document.getElementById('grid');
for (const it of items) {
  const d = document.createElement('div');
  d.className = `card${it.wide ? ' wide' : ''}`;
  d.style.background = it.c;
  d.textContent = it.label;
  grid.append(d);
}

const slides = document.getElementById('slides');
let index = 0;
const show = (i) => { index = (i + 3) % 3; slides.style.transform = `translateX(${-100 * index}%)`; slides.dataset.index = String(index); };
let timer = setInterval(() => show(index + 1), 3000);
const restart = () => { clearInterval(timer); timer = setInterval(() => show(index + 1), 3000); };
document.querySelector('.next').addEventListener('click', () => { show(index + 1); restart(); });
document.querySelector('.prev').addEventListener('click', () => { show(index - 1); restart(); });
show(0);

addEventListener('load', () => requestAnimationFrame(() => document.documentElement.classList.remove('intro')));
