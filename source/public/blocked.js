const q = new URLSearchParams(location.search);
document.getElementById('site').textContent = q.get('site') || '';
document.getElementById('mode').textContent = q.get('mode') || '';
document.getElementById('back').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));
