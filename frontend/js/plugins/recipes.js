/**
 * Butler — Recipes Plugin
 *
 * Displays recipes with ingredient bar at top and step tiles below.
 * Click a tile to expand it in a popup.
 * Type: 'full' — takes over #main-content.
 */

let $root = null;
let butlerRef = null;
let recipes = [];
let activeRecipe = null;

// ─── API ────────────────────────────────────────────────────

async function fetchRecipes() {
  try {
    const tree = await butlerRef.api.get('/api/files/tree?path=recipes');
    return (tree.children || []).filter(c => c.name.endsWith('.md'));
  } catch (e) {
    butlerRef.toast(`Recipes: ${e.message}`, 'error');
    return [];
  }
}

async function loadRecipe(filename) {
  try {
    const { content } = await butlerRef.api.get(`/api/files/read?path=recipes/${encodeURIComponent(filename)}`);
    return parseRecipe(filename, content);
  } catch (e) {
    butlerRef.toast(`Failed to load recipe: ${e.message}`, 'error');
    return null;
  }
}

function parseRecipe(filename, content) {
  const recipe = { filename, title: filename.replace('.md', ''), ingredients: '', persons: '', steps: [], raw: content };

  // Extract YAML frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  let body = content;
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2];
    const ingMatch = fm.match(/^ingredients:\s*(.+)$/m);
    if (ingMatch) recipe.ingredients = ingMatch[1].trim();
    const persMatch = fm.match(/^persons:\s*(\d+)$/m);
    if (persMatch) recipe.persons = persMatch[1];
  }

  // Extract title from first heading
  const titleMatch = body.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    recipe.title = titleMatch[1].trim();
    body = body.replace(titleMatch[0], '').trim();
  }

  // Split steps by ---
  recipe.steps = body.split(/^---$/m).map(s => s.trim()).filter(s => s.length > 0);

  return recipe;
}

// ─── Render ─────────────────────────────────────────────────

function render() {
  if (!$root) return;
  $root.innerHTML = '';
  $root.classList.add('recipes-root');

  const layout = el('div', 'recipes-layout');

  // Left: recipe list
  const sidebar = el('div', 'recipes-sidebar');
  const sideHeader = el('div', 'recipes-side-header');
  sideHeader.innerHTML = '<h3>Recipes</h3>';
  const newBtn = el('button', 'recipes-new-btn');
  newBtn.textContent = '+ New';
  newBtn.addEventListener('click', createRecipe);
  sideHeader.appendChild(newBtn);
  sidebar.appendChild(sideHeader);

  const list = el('div', 'recipes-list');
  for (const r of recipes) {
    const item = el('div', `recipes-item ${activeRecipe?.filename === r.name ? 'active' : ''}`);
    item.textContent = r.name.replace('.md', '');
    item.addEventListener('click', () => openRecipe(r.name));
    list.appendChild(item);
  }
  sidebar.appendChild(list);
  layout.appendChild(sidebar);

  // Right: recipe detail
  const detail = el('div', 'recipes-detail');
  if (activeRecipe) {
    renderRecipeDetail(detail, activeRecipe);
  } else {
    detail.innerHTML = '<div class="recipes-empty">Select a recipe from the list</div>';
  }
  layout.appendChild(detail);

  $root.appendChild(layout);
}

function renderRecipeDetail(container, recipe) {
  // Title
  const title = el('h2', 'recipes-title');
  title.textContent = recipe.title;
  container.appendChild(title);

  // Ingredient bar
  if (recipe.ingredients) {
    const bar = el('div', 'recipes-ingredients');
    const label = el('span', 'recipes-ing-label');
    label.textContent = 'Ingredients';
    if (recipe.persons) label.textContent += ` (${recipe.persons} persons)`;
    bar.appendChild(label);

    const items = recipe.ingredients.split(',').map(s => s.trim());
    const ingList = el('div', 'recipes-ing-list');
    for (const ing of items) {
      const chip = el('span', 'recipes-ing-chip');
      chip.textContent = ing;
      ingList.appendChild(chip);
    }
    bar.appendChild(ingList);
    container.appendChild(bar);
  }

  // Step tiles
  const stepsWrap = el('div', 'recipes-steps');
  recipe.steps.forEach((step, i) => {
    const tile = el('div', 'recipes-step-tile');
    const num = el('span', 'recipes-step-num');
    num.textContent = `${i + 1}`;
    const text = el('span', 'recipes-step-text');
    text.textContent = step;
    tile.append(num, text);
    tile.addEventListener('click', () => showStepPopup(step, i, recipe.title));
    stepsWrap.appendChild(tile);
  });
  container.appendChild(stepsWrap);

  // Edit button
  const actions = el('div', 'recipes-actions');
  const editBtn = el('button', 'recipes-edit-btn');
  editBtn.textContent = 'Edit in Editor';
  editBtn.addEventListener('click', () => {
    butlerRef.openFile(`recipes/${recipe.filename}`);
  });
  actions.appendChild(editBtn);
  container.appendChild(actions);
}

function showStepPopup(step, index, recipeTitle) {
  const overlay = el('div', 'cal-overlay');
  const popup = el('div', 'cal-popup recipes-step-popup');

  // ESC + X close
  const cleanup = () => { overlay.remove(); document.removeEventListener('keydown', escH); };
  const escH = (e) => { if (e.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', escH);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

  const xBtn = el('button', 'cal-popup-close');
  xBtn.innerHTML = '✕';
  xBtn.addEventListener('click', cleanup);
  popup.appendChild(xBtn);

  popup.insertAdjacentHTML('beforeend', `
    <h3>${esc(recipeTitle)} — Step ${index + 1}</h3>
    <div class="recipes-step-expanded">${esc(step)}</div>
  `);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

async function openRecipe(filename) {
  const recipe = await loadRecipe(filename);
  if (recipe) {
    activeRecipe = recipe;
    render();
  }
}

async function createRecipe() {
  const overlay = el('div', 'cal-overlay');
  const popup = el('div', 'cal-popup recipes-create-popup');

  const cleanup = () => { overlay.remove(); document.removeEventListener('keydown', escH); };
  const escH = (e) => { if (e.key === 'Escape') cleanup(); };
  document.addEventListener('keydown', escH);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

  const xBtn = el('button', 'cal-popup-close');
  xBtn.innerHTML = '✕';
  xBtn.addEventListener('click', cleanup);
  popup.appendChild(xBtn);

  popup.insertAdjacentHTML('beforeend', `
    <h3>New Recipe</h3>
    <div class="cal-form">
      <label>Recipe Name<input type="text" id="rc-name" placeholder="e.g. Spaghetti Carbonara" /></label>
      <label>Servings<input type="number" id="rc-persons" value="4" min="1" /></label>
      <div class="rc-section-label">Ingredients</div>
      <div id="rc-ingredients"></div>
      <button class="rc-add-btn" id="rc-add-ing">+ Add Ingredient</button>
      <div class="rc-section-label">Steps</div>
      <div id="rc-steps"></div>
      <button class="rc-add-btn" id="rc-add-step">+ Add Step</button>
    </div>
    <div class="cal-popup-actions">
      <button class="cal-btn-discard">Cancel</button>
      <button class="cal-btn-save">Create</button>
    </div>
  `);

  function addIngredientRow(name = '', amount = '') {
    const row = el('div', 'rc-ing-row');
    row.innerHTML = `<input type="text" placeholder="Ingredient" class="rc-ing-name" value="${esc(name)}" />
      <input type="text" placeholder="Amount" class="rc-ing-amount" value="${esc(amount)}" />
      <button class="rc-remove-btn">×</button>`;
    row.querySelector('.rc-remove-btn').addEventListener('click', () => row.remove());
    popup.querySelector('#rc-ingredients').appendChild(row);
  }

  function addStepRow(text = '') {
    const row = el('div', 'rc-step-row');
    const num = popup.querySelectorAll('.rc-step-row').length + 1;
    row.innerHTML = `<span class="rc-step-num">${num}</span>
      <textarea class="rc-step-text" rows="2" placeholder="Describe this step...">${esc(text)}</textarea>
      <button class="rc-remove-btn">×</button>`;
    row.querySelector('.rc-remove-btn').addEventListener('click', () => {
      row.remove();
      popup.querySelectorAll('.rc-step-num').forEach((n, i) => { n.textContent = i + 1; });
    });
    popup.querySelector('#rc-steps').appendChild(row);
  }

  addIngredientRow();
  addStepRow();

  popup.querySelector('#rc-add-ing').addEventListener('click', () => addIngredientRow());
  popup.querySelector('#rc-add-step').addEventListener('click', () => addStepRow());

  // Enter key adds new ingredient/step row
  popup.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (target.matches('.rc-ing-name, .rc-ing-amount')) {
      e.preventDefault();
      addIngredientRow();
      const last = popup.querySelector('#rc-ingredients .rc-ing-row:last-child .rc-ing-name');
      if (last) last.focus();
    } else if (target.matches('.rc-step-text') && !e.shiftKey) {
      e.preventDefault();
      addStepRow();
      const last = popup.querySelector('#rc-steps .rc-step-row:last-child .rc-step-text');
      if (last) last.focus();
    }
  });

  popup.querySelector('.cal-btn-discard').addEventListener('click', cleanup);
  popup.querySelector('.cal-btn-save').addEventListener('click', async () => {
    const name = popup.querySelector('#rc-name').value.trim();
    if (!name) { butlerRef.toast('Recipe name required', 'error'); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) { butlerRef.toast('Invalid recipe name', 'error'); return; }

    const persons = popup.querySelector('#rc-persons').value || '4';
    const ings = [...popup.querySelectorAll('.rc-ing-row')].map(r => {
      const n = r.querySelector('.rc-ing-name').value.trim();
      const a = r.querySelector('.rc-ing-amount').value.trim();
      return n ? (a ? `${n} (${a})` : n) : '';
    }).filter(Boolean);

    const steps = [...popup.querySelectorAll('.rc-step-text')].map(t => t.value.trim()).filter(Boolean);

    const fname = slug + '.md';
    const ingLine = ings.join(', ');
    const stepsBlock = steps.length ? steps.join('\n---\n') : 'Step 1';
    const content = `---\ningredients: ${ingLine}\npersons: ${persons}\n---\n\n# ${name}\n\n---\n${stepsBlock}\n---\n`;

    cleanup();
    try {
      await butlerRef.api.post('/api/files/create', { path: `recipes/${fname}`, content });
      await refreshList();
      await openRecipe(fname);
      butlerRef.toast('Recipe created', 'success');
    } catch (e) {
      if (e.message.includes('Already exists')) {
        butlerRef.toast(`Recipe "${slug}" already exists`, 'error');
      } else {
        butlerRef.toast(`Create failed: ${e.message}`, 'error');
      }
    }
  });

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  popup.querySelector('#rc-name')?.focus();
}

async function refreshList() {
  recipes = await fetchRecipes();
  render();
}

// ─── Helpers ────────────────────────────────────────────────

function el(tag, cls = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML.replace(/"/g, '&quot;');
}

// ─── Plugin Interface ───────────────────────────────────────

async function init(container, butler) {
  butlerRef = butler;
  $root = container;
  recipes = await fetchRecipes();
  render();
}

export default {
  name: 'recipes',
  type: 'full',
  label: 'Recipes',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10"/>
    <path d="M15 2.5c1 1.5 2 4 2 9.5M12 2v10M7 12a5 5 0 0 0 10 0"/>
  </svg>`,
  init,
  activate() {},
  deactivate() {},
};
