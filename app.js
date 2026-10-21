const satellite = document.querySelector('#satellite-image');
const turbidity = document.querySelector('#turbidity-image');
const message = document.querySelector('#map-message');
const markers = document.querySelector('#sample-markers');
const plane = document.querySelector('.image-plane');
const reading = document.querySelector('#sample-reading');
const layerButtons = [...document.querySelectorAll('button[data-layer]')];
const filmstrip = document.querySelector('#filmstrip');
const scrollbar = document.querySelector('.filmstrip-scrollbar');

function updateScrollbar() {
  if (!filmstrip.scrollWidth) return;
  scrollbar.style.setProperty('--scroll-width', `${filmstrip.clientWidth / filmstrip.scrollWidth * 100}%`);
  scrollbar.style.setProperty('--scroll-left', `${filmstrip.scrollLeft / filmstrip.scrollWidth * 100}%`);
}

filmstrip.addEventListener('scroll', updateScrollbar, { passive: true });
new ResizeObserver(updateScrollbar).observe(filmstrip);
const shortDateFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
});
const dateFormat = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

let scenes = [];
let selected = 0;
let mode = 'satellite';

function selectScene(index) {
  if (index === selected) return;
  selected = index;
  renderScene();
}

function selectPoint(point) {
  markers.querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.point) === point.id));
  });
  reading.textContent = `Punto ${point.id} · Turbidez medida: ${point.measuredTurbidity.toLocaleString('es-AR')} NTU`;
}

function renderScene() {
  const scene = scenes[selected];
  const date = dateFormat.format(new Date(scene.date));
  message.hidden = true;
  satellite.src = scene.satellite;
  satellite.alt = `Río Paraná, imagen Sentinel-2, ${date}`;
  if (mode === 'turbidity') turbidity.src = scene.turbidity;
  turbidity.hidden = mode !== 'turbidity';
  turbidity.alt = mode === 'turbidity' ? `Turbidez estimada sobre el agua, ${date}` : '';
  document.querySelector('#legend').hidden = mode !== 'turbidity';
  document.querySelector('#selected-date').textContent = date;
  filmstrip.querySelectorAll('button').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(index === selected));
    button.tabIndex = index === selected ? 0 : -1;
  });
  const thumbnail = filmstrip.children[selected];
  if (thumbnail.offsetLeft < filmstrip.scrollLeft ||
      thumbnail.offsetLeft + thumbnail.offsetWidth > filmstrip.scrollLeft + filmstrip.clientWidth) {
    filmstrip.scrollTo({
      left: thumbnail.offsetLeft < filmstrip.scrollLeft
        ? thumbnail.offsetLeft
        : thumbnail.offsetLeft + thumbnail.offsetWidth - filmstrip.clientWidth + 3,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }
  layerButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.layer === mode)));
  reading.textContent = `${scene.sampleCount} puntos de muestreo${mode === 'turbidity'
    ? ` · Mediana estimada ${scene.median.toLocaleString('es-AR')}`
    : ' · 10 m / píxel'}`;
  markers.replaceChildren(...scene.points.map((point) => {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'sample-marker';
    marker.style.left = `${point.x * 100}%`;
    marker.style.top = `${point.y * 100}%`;
    marker.dataset.point = point.id;
    marker.setAttribute('aria-label', `Punto de muestreo ${point.id}: turbidez medida ${point.measuredTurbidity.toLocaleString('es-AR')} NTU`);
    marker.setAttribute('aria-pressed', 'false');
    marker.append(document.createElement('span'));
    marker.addEventListener('click', () => selectPoint(point));
    return marker;
  }));
}

for (const image of [satellite, turbidity]) {
  image.addEventListener('error', () => {
    message.hidden = false;
    message.textContent = 'No se pudo cargar la imagen. Recargá la página para reintentar.';
  });
}
layerButtons.forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.layer;
  renderScene();
}));
filmstrip.addEventListener('keydown', (event) => {
  let index;
  if (event.key === 'ArrowRight') index = Math.min(selected + 1, scenes.length - 1);
  if (event.key === 'ArrowLeft') index = Math.max(selected - 1, 0);
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = scenes.length - 1;
  if (index === undefined) return;
  event.preventDefault();
  selectScene(index);
  filmstrip.children[index].focus({ preventScroll: true });
});

// Nearest-point selection gives dense samples a 44px tap target without overlapping buttons.
plane.addEventListener('click', (event) => {
  if (!scenes.length || event.detail === 0) return;
  const rect = plane.getBoundingClientRect();
  let nearest;
  let distance = 22;
  for (const point of scenes[selected].points) {
    const current = Math.hypot(
      event.clientX - rect.left - point.x * rect.width,
      event.clientY - rect.top - point.y * rect.height,
    );
    if (current <= distance) {
      nearest = point;
      distance = current;
    }
  }
  if (nearest) selectPoint(nearest);
});

fetch('processed/scenes.json').then((response) => {
  if (!response.ok) throw new Error('No se pudieron cargar las observaciones. Recargá la página para reintentar.');
  return response.json();
}).then((data) => {
  scenes = data.scenes;
  filmstrip.replaceChildren(...scenes.map((scene, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-thumbnail';
    if (index === 0) button.id = 'first-scene';
    button.setAttribute('aria-label', dateFormat.format(new Date(scene.date)));
    const image = document.createElement('img');
    image.src = scene.satellite;
    image.alt = '';
    image.width = 64;
    image.height = 64;
    const label = document.createElement('span');
    label.textContent = shortDateFormat.format(new Date(scene.date));
    button.append(image, label);
    button.addEventListener('click', () => selectScene(index));
    return button;
  }));
  layerButtons.forEach((button) => { button.disabled = false; });
  updateScrollbar();
  renderScene();
}).catch((error) => {
  message.hidden = false;
  message.textContent = error.message;
  document.querySelector('#selected-date').textContent = 'Observaciones no disponibles';
});
