const API_BASE =
  import.meta && import.meta.env && import.meta.env.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE
    : (window.ISU_DINING_API_BASE || "http://localhost:4000");

const FAVORITES_KEY = "isuDiningFavorites_v1";

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(favs) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    // ignore
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeRange(start, end) {
  if (!start && !end) return "";
  const fmt = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    const date = new Date();
    date.setHours(h, m || 0, 0, 0);
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (start && end) return `${fmt(start)}–${fmt(end)}`;
  return fmt(start || end);
}

async function fetchMenu(days) {
  const res = await fetch(`${API_BASE}/api/menu?days=${days}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();
  // Prefer grouped dishes (location → station → combined dish names); fallback to flat entries
  return {
    entries: data.entries || [],
    dishes: data.dishes || [],
    structured: data.structured || null,
  };
}

/**
 * Build list of display names for the food list.
 * When using dishes: unique displayName (grouped dishes like "Pita with Chicken and Rice").
 * When using entries: unique itemName (legacy flat list).
 */
function getDisplayNames(data) {
  if (data.dishes && data.dishes.length > 0) {
    return Array.from(
      new Set(data.dishes.map((d) => d.displayName).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }
  return Array.from(
    new Set((data.entries || []).map((e) => e.itemName).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * Check if a display name or its components match the search query.
 * For dishes we also match itemNames (e.g. "chicken" matches "Pita with Chicken and Rice").
 */
function displayNameMatchesQuery(displayName, itemNames, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (displayName.toLowerCase().includes(q)) return true;
  if (itemNames && itemNames.some((n) => n.toLowerCase().includes(q)))
    return true;
  return false;
}

function renderFoodsList(
  data,
  favorites,
  { foodsListEl, loadingEl, errorEl, searchEl, onFavoritesChanged }
) {
  const entries = data.entries || [];
  const dishes = data.dishes || [];
  const useDishes = dishes.length > 0;

  const allNames = getDisplayNames(data);
  // For search we need displayName + itemNames when using dishes
  const nameToItemNames = new Map();
  if (useDishes) {
    dishes.forEach((d) => {
      if (!nameToItemNames.has(d.displayName))
        nameToItemNames.set(d.displayName, d.itemNames || []);
    });
  }

  const renderGrid = () => {
    const query = (searchEl.value || "").trim().toLowerCase();
    const names = query
      ? allNames.filter((name) =>
          useDishes
            ? displayNameMatchesQuery(name, nameToItemNames.get(name), query)
            : name.toLowerCase().includes(query)
        )
      : allNames;

    foodsListEl.innerHTML = "";

    if (!names.length) {
      foodsListEl.innerHTML =
        '<div class="status">No dishes match this search.</div>';
      return;
    }

    const grid = document.createElement("div");
    grid.className = "foods-grid";

    names.forEach((name) => {
      const id = `food-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const label = document.createElement("label");
      label.className = "food-pill";
      if (favorites.has(name)) label.classList.add("selected");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.checked = favorites.has(name);
      checkbox.dataset.foodName = name;

      const span = document.createElement("span");
      span.textContent = name;

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          favorites.add(name);
          label.classList.add("selected");
        } else {
          favorites.delete(name);
          label.classList.remove("selected");
        }
        saveFavorites(favorites);
        if (onFavoritesChanged) {
          onFavoritesChanged();
        }
      });

      label.appendChild(checkbox);
      label.appendChild(span);
      grid.appendChild(label);
    });

    foodsListEl.appendChild(grid);
  };

  if (!allNames.length) {
    foodsListEl.innerHTML =
      '<div class="status">No dishes found for this range.</div>';
  } else {
    renderGrid();
  }

  if (searchEl) {
    searchEl.oninput = renderGrid;
  }

  loadingEl.classList.add("hidden");
  errorEl.classList.add("hidden");
}

/**
 * One "occurrence" row for display. Same shape whether from dish or entry.
 */
function toOccurrence(dishOrEntry) {
  if (dishOrEntry.displayName !== undefined) {
    return {
      date: dishOrEntry.date,
      locationTitle: dishOrEntry.locationTitle,
      facility: dishOrEntry.facility,
      mealName: dishOrEntry.mealName,
      stationName: dishOrEntry.stationName,
      categoryName: dishOrEntry.categoryName,
      startTime: dishOrEntry.startTime,
      endTime: dishOrEntry.endTime,
      active: dishOrEntry.active,
      displayName: dishOrEntry.displayName,
    };
  }
  return {
    date: dishOrEntry.date,
    locationTitle: dishOrEntry.locationTitle,
    facility: dishOrEntry.facility,
    mealName: dishOrEntry.mealName,
    stationName: dishOrEntry.stationName,
    categoryName: dishOrEntry.categoryName,
    startTime: dishOrEntry.startTime,
    endTime: dishOrEntry.endTime,
    active: dishOrEntry.active,
    displayName: dishOrEntry.itemName,
  };
}

function renderResults(data, favorites, { onRemoveFavorite } = {}) {
  const resultsEl = document.getElementById("results");
  const emptyEl = document.getElementById("results-empty");

  if (!favorites.size) {
    resultsEl.classList.add("hidden");
    emptyEl.classList.remove("hidden");
    resultsEl.innerHTML = "";
    return;
  }

  const dishes = data.dishes || [];
  const entries = data.entries || [];
  const useDishes = dishes.length > 0;

  const selected = useDishes
    ? dishes.filter((d) => favorites.has(d.displayName))
    : entries.filter((e) => favorites.has(e.itemName));

  if (!selected.length) {
    resultsEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    resultsEl.innerHTML =
      '<div class="status">None of your selected foods appear in this date range.</div>';
    return;
  }

  const byFood = new Map();
  selected.forEach((e) => {
    const name = useDishes ? e.displayName : e.itemName;
    if (!byFood.has(name)) byFood.set(name, []);
    byFood.get(name).push(toOccurrence(e));
  });

  byFood.forEach((list) =>
    list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime && b.startTime && a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      return a.locationTitle.localeCompare(b.locationTitle);
    })
  );

  const foodNames = Array.from(byFood.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  resultsEl.innerHTML = "";

  foodNames.forEach((name) => {
    const group = document.createElement("div");
    group.className = "result-group";

    const header = document.createElement("div");
    header.className = "result-group-title";
    const title = document.createElement("span");
    title.textContent = name;
    const count = document.createElement("span");
    count.className = "result-count";
    const list = byFood.get(name);
    count.textContent = `${list.length} upcoming ${
      list.length === 1 ? "time" : "times"
    }`;

    const actions = document.createElement("div");
    actions.className = "result-actions";
    actions.appendChild(count);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "result-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      favorites.delete(name);
      saveFavorites(favorites);
      if (onRemoveFavorite) {
        onRemoveFavorite(name);
      }
    });
    actions.appendChild(removeBtn);

    header.appendChild(title);
    header.appendChild(actions);
    group.appendChild(header);

    list.forEach((e) => {
      const row = document.createElement("div");
      row.className = "occurrence";

      const main = document.createElement("div");
      main.className = "occurrence-main";
      const dateEl = document.createElement("div");
      dateEl.className = "occurrence-date";
      dateEl.textContent = formatDate(e.date);
      const locEl = document.createElement("div");
      locEl.className = "occurrence-location";
      locEl.textContent = `${e.locationTitle} · ${e.facility}`;
      main.appendChild(dateEl);
      main.appendChild(locEl);

      const meta = document.createElement("div");
      meta.className = "occurrence-meta";
      const meal = document.createElement("div");
      meal.textContent = e.mealName || "";
      const time = document.createElement("div");
      time.textContent = formatTimeRange(e.startTime, e.endTime);

      const line2 = document.createElement("div");
      if (e.stationName || e.categoryName) {
        const parts = [];
        if (e.stationName) parts.push(e.stationName);
        if (e.categoryName) parts.push(e.categoryName);
        line2.textContent = parts.join(" · ");
        line2.style.fontSize = "0.8rem";
      }

      if (e.active === false) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Inactive";
        meal.appendChild(badge);
      }

      meta.appendChild(meal);
      if (time.textContent) meta.appendChild(time);
      if (line2.textContent) meta.appendChild(line2);

      row.appendChild(main);
      row.appendChild(meta);
      group.appendChild(row);
    });

    resultsEl.appendChild(group);
  });

  resultsEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");
}

async function init() {
  const foodsLoadingEl = document.getElementById("foods-loading");
  const foodsErrorEl = document.getElementById("foods-error");
  const foodsListEl = document.getElementById("foods-list");
  const daysSelect = document.getElementById("days-select");
  const reloadBtn = document.getElementById("reload-btn");
  const searchEl = document.getElementById("food-search");

  const favorites = loadFavorites();
  let currentData = { entries: [], dishes: [], structured: null };

  function refreshViews() {
    renderFoodsList(currentData, favorites, {
      foodsListEl,
      loadingEl: foodsLoadingEl,
      errorEl: foodsErrorEl,
      searchEl,
      onFavoritesChanged: () => {
        renderResults(currentData, favorites, {
          onRemoveFavorite: handleRemoveFavorite,
        });
      },
    });
    renderResults(currentData, favorites, {
      onRemoveFavorite: handleRemoveFavorite,
    });
  }

  function handleRemoveFavorite(name) {
    // Update checkboxes in the left list to stay in sync
    const selector = `input[type="checkbox"][data-food-name="${CSS.escape(
      name
    )}"]`;
    document.querySelectorAll(selector).forEach((checkbox) => {
      checkbox.checked = false;
      const label = checkbox.closest(".food-pill");
      if (label) {
        label.classList.remove("selected");
      }
    });
    refreshViews();
  }

  async function load() {
    foodsLoadingEl.classList.remove("hidden");
    foodsErrorEl.classList.add("hidden");
    foodsErrorEl.textContent = "";
    foodsListEl.innerHTML = "";

    const days = parseInt(daysSelect.value, 10) || 7;
    try {
      const data = await fetchMenu(days);
      currentData = data;
      refreshViews();
    } catch (err) {
      console.error(err);
      foodsLoadingEl.classList.add("hidden");
      foodsErrorEl.classList.remove("hidden");
      foodsErrorEl.textContent =
        "Failed to load menus. Make sure the backend server is running and reachable.";
    }
  }

  reloadBtn.addEventListener("click", load);
  daysSelect.addEventListener("change", load);

  load();
}

document.addEventListener("DOMContentLoaded", init);

