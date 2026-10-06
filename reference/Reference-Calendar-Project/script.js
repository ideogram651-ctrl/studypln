/* ==========================================================================
   Study-Planner — Soft Calendar (August 2026)
   Extracted 1:1 from the single-file HTML reference.
   Vanilla JavaScript only — no frameworks, no dependencies.

   Behaviour preserved from the reference:
   - Weekly date-wheel strip with click-to-select and auto-centering
   - Mouse-wheel / trackpad day-by-day navigation
   - Pointer drag / swipe navigation
   - ArrowLeft / ArrowRight keyboard navigation
   - Weekly <-> Monthly segmented switching
   - Monthly grid generation with leading empty cells
   - Distance-based edge/near opacity fade on the weekly strip
   - Selected-day state shared across both views
   ========================================================================== */
(() => {
  const YEAR = 2026;
  const MONTH = 7; // August, zero-based
  const INITIAL_DAY = 23;

  const card = document.getElementById('calendarCard');
  const weeklyBtn = document.getElementById('weeklyBtn');
  const monthlyBtn = document.getElementById('monthlyBtn');
  const heroDay = document.getElementById('heroDay');
  const track = document.getElementById('weekTrack');
  const viewport = document.getElementById('weekViewport');
  const grid = document.getElementById('monthGrid');

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let selectedDay = INITIAL_DAY;
  let dragStartX = null;
  let dragging = false;

  function daysInMonth(year, month){
    return new Date(year, month + 1, 0).getDate();
  }

  function setSelected(day, animate = true){
    const max = daysInMonth(YEAR, MONTH);
    selectedDay = Math.max(1, Math.min(max, day));
    heroDay.textContent = selectedDay;
    document.querySelectorAll('.week-day').forEach(el => {
      el.classList.toggle('active', Number(el.dataset.day) === selectedDay);
    });
    document.querySelectorAll('.grid-cell').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.day) === selectedDay);
    });
    centerSelected(animate);
  }

  function createWeekTrack(){
    track.innerHTML = '';
    const max = daysInMonth(YEAR, MONTH);

    // All August dates are stored in the track. The viewport acts like a
    // horizontal date wheel; clicking or scrolling changes the centered day.
    for(let day=1; day<=max; day++){
      const date = new Date(YEAR, MONTH, day);
      const item = document.createElement('div');
      item.className = 'week-day';
      item.dataset.day = day;
      item.innerHTML = `
        <div class="weekday">${weekdays[date.getDay()]}</div>
        <div class="date-circle">${day}</div>
      `;
      item.addEventListener('click', () => setSelected(day));
      track.appendChild(item);
    }
    updateWeekOpacity();
  }

  function centerSelected(animate = true){
    const item = track.querySelector(`[data-day="${selectedDay}"]`);
    if(!item) return;

    const viewportCenter = viewport.clientWidth / 2;
    const itemCenter = item.offsetLeft + item.offsetWidth / 2;
    const min = -(track.scrollWidth - viewport.clientWidth);
    let target = viewportCenter - itemCenter;
    target = Math.min(0, Math.max(min, target));

    track.style.transition = animate
      ? 'transform .46s cubic-bezier(.22,.75,.2,1)'
      : 'none';
    track.style.transform = `translate3d(${target}px,0,0)`;
    updateWeekOpacity();
  }

  function updateWeekOpacity(){
    const center = viewport.clientWidth / 2;
    document.querySelectorAll('.week-day').forEach(item => {
      const rect = item.getBoundingClientRect();
      const parent = viewport.getBoundingClientRect();
      const itemCenter = rect.left - parent.left + rect.width/2;
      const distance = Math.abs(itemCenter - center);
      item.classList.toggle('edge', distance > 220);
      item.classList.toggle('near', distance > 110 && distance <= 220);
    });
  }

  function moveBy(delta){
    setSelected(selectedDay + delta);
  }

  // Wheel = date-wheel interaction. A normal vertical mouse wheel over the
  // weekly strip advances one day at a time; horizontal trackpads work too.
  let wheelLock = false;
  viewport.addEventListener('wheel', e => {
    if(card.classList.contains('monthly')) return;
    e.preventDefault();
    if(wheelLock) return;
    const direction = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      ? Math.sign(e.deltaX)
      : Math.sign(e.deltaY);
    if(direction) {
      wheelLock = true;
      moveBy(direction);
      setTimeout(() => wheelLock = false, 240);
    }
  }, {passive:false});

  // Drag / swipe.
  viewport.addEventListener('pointerdown', e => {
    dragging = true;
    dragStartX = e.clientX;
    viewport.classList.add('dragging');
    track.style.transition = 'none';
    viewport.setPointerCapture?.(e.pointerId);
  });

  viewport.addEventListener('pointermove', e => {
    if(!dragging || dragStartX === null) return;
    const dx = e.clientX - dragStartX;
    if(Math.abs(dx) > 35){
      const direction = dx < 0 ? 1 : -1;
      dragging = false;
      viewport.classList.remove('dragging');
      moveBy(direction);
      dragStartX = null;
    }
  });

  function endDrag(){
    dragging = false;
    dragStartX = null;
    viewport.classList.remove('dragging');
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('pointerleave', () => {
    if(dragging) endDrag();
  });

  // Keyboard support.
  window.addEventListener('keydown', e => {
    if(card.classList.contains('monthly')) return;
    if(e.key === 'ArrowRight') { e.preventDefault(); moveBy(1); }
    if(e.key === 'ArrowLeft') { e.preventDefault(); moveBy(-1); }
  });

  function createMonthly(){
    grid.innerHTML = '';
    weekdays.forEach(day => {
      const head = document.createElement('div');
      head.className = 'grid-head';
      head.textContent = day;
      grid.appendChild(head);
    });

    const firstDay = new Date(YEAR, MONTH, 1).getDay();
    const total = daysInMonth(YEAR, MONTH);

    for(let i=0; i<firstDay; i++){
      const empty = document.createElement('div');
      empty.className = 'grid-cell empty';
      grid.appendChild(empty);
    }

    for(let day=1; day<=total; day++){
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.day = day;
      cell.textContent = day;
      cell.addEventListener('click', () => setSelected(day));
      grid.appendChild(cell);
    }
  }

  function showWeekly(){
    card.classList.remove('monthly');
    weeklyBtn.classList.add('active');
    monthlyBtn.classList.remove('active');
    requestAnimationFrame(() => centerSelected(true));
  }

  function showMonthly(){
    card.classList.add('monthly');
    monthlyBtn.classList.add('active');
    weeklyBtn.classList.remove('active');
    document.querySelectorAll('.grid-cell').forEach(el => {
      el.classList.toggle('selected', Number(el.dataset.day) === selectedDay);
    });
  }

  weeklyBtn.addEventListener('click', showWeekly);
  monthlyBtn.addEventListener('click', showMonthly);

  createWeekTrack();
  createMonthly();
  window.addEventListener('resize', () => centerSelected(false));
  requestAnimationFrame(() => setSelected(INITIAL_DAY, false));
})();
