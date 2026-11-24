interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  age: number;
}

interface ConfettiOptions {
  count: number;
  colors: string[];
  fallbackColor?: string;
  /** Initial horizontal spread and upward speed. */
  spread: number;
  lift: number;
  baseSize: number;
  baseLift: number;
  sizeRange: number;
  gravity: number;
  drag: number;
  maxAge: number;
  /** How far below the canvas a particle may fall before it is dropped. */
  margin: number;
}

/** Returns a function that fires one burst from the given point. */
export function createConfetti(canvas: HTMLCanvasElement, options: ConfettiOptions) {
  const context = canvas.getContext('2d')!;
  let particles: Particle[] = [];

  function createParticle(x: number, y: number, color: string): Particle {
    return {
      x,
      y,
      vx: (Math.random() - 0.5) * options.spread,
      vy: -Math.random() * options.lift - options.baseLift,
      size: Math.random() * options.sizeRange + options.baseSize,
      color,
      rotation: Math.random() * 6,
      age: 0,
    };
  }

  function move(particle: Particle) {
    particle.vy += options.gravity;
    particle.vx *= options.drag;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.rotation += 0.1;
    particle.age++;
  }

  function paint({ x, y, size, color, rotation }: Particle) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);
    context.fillStyle = color;
    context.fillRect(-size / 2, -size / 4, size, size / 2);
    context.restore();
  }

  function animate() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle) => {
      move(particle);
      paint(particle);
    });
    particles = particles.filter((p) => p.y < canvas.height + options.margin && p.age < options.maxAge);
    if (particles.length) requestAnimationFrame(animate);
    else context.clearRect(0, 0, canvas.width, canvas.height);
  }

  return (x: number, y: number) => {
    const styles = getComputedStyle(document.documentElement);
    const colors = options.colors.map((name) => styles.getPropertyValue(name).trim() || options.fallbackColor || '');
    const wasIdle = particles.length === 0;
    for (let i = 0; i < options.count; i++) particles.push(createParticle(x, y, colors[i % colors.length]));
    if (wasIdle) requestAnimationFrame(animate);
  };
}

export function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Full-screen bursts, from the middle of the screen. */
export function createStageConfetti(canvas: HTMLCanvasElement) {
  const resize = () => {
    canvas.width = innerWidth;
    canvas.height = innerHeight;
  };
  addEventListener('resize', resize);
  resize();
  const fire = createConfetti(canvas, {
    count: 220,
    colors: ['--acc', '--acc-hi', '--acc-pale', '--leg', '--ink'],
    fallbackColor: '#f2c35b',
    spread: 16,
    lift: 16,
    baseLift: 4,
    sizeRange: 7,
    baseSize: 4,
    gravity: 0.35,
    drag: 0.99,
    maxAge: 400,
    margin: 20,
  });
  return () => {
    if (!prefersReducedMotion()) fire(innerWidth / 2, innerHeight * 0.45);
  };
}
