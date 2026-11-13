// Thin mint bar at the top of the screen that fills as you read an article.
export function readingProgress(article) {
  if (!article || document.querySelector('.read-progress')) return;
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = article.getBoundingClientRect();
    const total = r.height - innerHeight * 0.6;
    const done = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
    bar.style.transform = `scaleX(${done})`;
  };
  addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}
