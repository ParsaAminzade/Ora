// Sample for the "HTML code" background: flowing silk lines that lean toward the mouse.
// Anything from CodePen-style pages works: <canvas>, WebGL, CSS animation, even scripts from a CDN.
export const SAMPLE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; height: 100%; background: #05060a; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const c = document.getElementById('c'), g = c.getContext('2d');
let w, h, t = 0, mx = .5, my = .5;
const resize = () => { const d = Math.min(devicePixelRatio, 2); w = c.width = innerWidth * d; h = c.height = innerHeight * d; };
addEventListener('resize', resize); resize();
addEventListener('mousemove', (e) => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });
const LINES = 46;
function frame() {
  t += 0.004;
  g.fillStyle = 'rgba(5,6,10,0.22)';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < LINES; i++) {
    const k = i / LINES;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const u = x / w;
      const pull = Math.exp(-((u - mx) ** 2) * 18) * (my - .5) * h * .35;
      const y = h * (.3 + k * .45)
        + Math.sin(u * 3.2 + t * 2 + k * 4) * h * .06
        + Math.sin(u * 7.1 - t * 1.3 + k * 9) * h * .02
        + pull * (1 - k);
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    const hue = 255 - k * 70 + Math.sin(t) * 10;
    g.strokeStyle = 'hsla(' + hue + ', 70%, ' + (55 + k * 15) + '%, ' + (0.05 + k * 0.08) + ')';
    g.lineWidth = 1.2;
    g.stroke();
  }
  requestAnimationFrame(frame);
}
frame();
</script>
</body>
</html>
`;
