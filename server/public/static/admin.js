// Ask before destructive admin actions (forms marked data-confirm).
document.addEventListener('submit', (e) => {
  const msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
  if (msg && !confirm(msg)) e.preventDefault();
});
