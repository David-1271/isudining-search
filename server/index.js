import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// Slugs for dining halls we care about
// - Seasons Marketplace
// - Union Drive Marketplace
// - Friley Windows
const LOCATION_SLUGS = [
  "seasons-marketplace-2-2",
  "union-drive-marketplace-2-2",
  "friley-windows-2-2",
];

const BASE_URL =
  "https://dining.iastate.edu/wp-json/dining/menu-hours/get-single-location/";

function getUnixSecondsForDate(date) {
  return Math.floor(date.getTime() / 1000);
}

async function fetchLocationForDate(slug, date) {
  const time = getUnixSecondsForDate(date);
  const url = `${BASE_URL}?slug=${encodeURIComponent(slug)}&time=${time}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) {
    return null;
  }
  const loc = json[0];
  return { raw: loc, date };
}

function scoreMenuItem(categoryName, stationName, itemName) {
  const c = (categoryName || "").toLowerCase();
  const s = (stationName || "").toLowerCase();
  const i = (itemName || "").toLowerCase();

  // Keywords that suggest "not a main dish"
  const badCategoryKeywords = [
    "condiment",
    "condiments",
    "topping",
    "toppings",
    "sauce",
    "salsas",
    "dressings",
    "dressing",
    "beverage",
    "beverages",
    "drink",
    "drinks",
    "cereal",
    "milk",
    "yogurt",
    "fruit",
    "fruit bar",
    "salad bar",
    "salad toppings",
    "salads & sides",
    "side",
    "sides",
    "dessert",
    "desserts",
    "ice cream",
    "bakery",
    "bread",
    "breads",
    "rolls",
    "soup station",
    "soup & salad",
    "soup",
  ];

  const badItemKeywords = [
    "ketchup",
    "mustard",
    "relish",
    "mayo",
    "mayonnaise",
    "bbq sauce",
    "barbecue sauce",
    "hot sauce",
    "salsa",
    "salsa bar",
    "salt",
    "pepper",
    "brown sugar",
    "white sugar",
    "sugar",
    "syrup",
    "butter",
    "margarine",
    "jam",
    "jelly",
    "honey",
    "sliced tomato",
    "sliced tomatoes",
    "sliced carrot",
    "sliced carrots",
    "sliced cucumber",
    "sliced cucumbers",
    "shredded carrot",
    "shredded carrots",
    "shredded lettuce",
    "diced tomato",
    "diced tomatoes",
  ];

  const simpleVegWords = [
    "lettuce",
    "romaine",
    "spinach",
    "tomato",
    "tomatoes",
    "carrot",
    "carrots",
    "cucumber",
    "cucumbers",
    "onion",
    "onions",
    "peppers",
    "green peppers",
    "jalapeno",
    "jalapenos",
    "mushroom",
    "mushrooms",
    "olives",
    "pickles",
  ];

  const proteinWords = [
    "chicken",
    "beef",
    "pork",
    "turkey",
    "tofu",
    "fish",
    "salmon",
    "tuna",
    "ham",
    "bacon",
    "sausage",
    "meatball",
    "meatballs",
    "egg",
    "eggs",
  ];

  const dishWords = [
    "pizza",
    "pasta",
    "stir fry",
    "stir-fry",
    "casserole",
    "sandwich",
    "sandwiches",
    "taco",
    "tacos",
    "bowl",
    "wrap",
    "burger",
    "burgers",
    "noodles",
    "alfredo",
    "lasagna",
    "enchilada",
    "enchiladas",
    "quesadilla",
    "quesadillas",
  ];

  const methodWords = [
    "grilled",
    "roasted",
    "baked",
    "fried",
    "blackened",
    "seared",
    "smoked",
    "glazed",
    "marinated",
    "breaded",
  ];

  const words = i.split(/\s+/).filter(Boolean);
  let score = 0;

  // Category-based signals
  if (badCategoryKeywords.some((k) => c.includes(k) || s.includes(k))) {
    score -= 4;
  }

  const goodCategoryKeywords = [
    "entrée",
    "entree",
    "entrees",
    "main dish",
    "main course",
    "chef's table",
    "grill",
    "pizza",
    "pasta",
    "homestyle",
    "global",
    "international",
  ];
  if (goodCategoryKeywords.some((k) => c.includes(k) || s.includes(k))) {
    score += 4;
  }

  // Item-name penalties
  if (badItemKeywords.some((k) => i === k || i.includes(k))) {
    score -= 4;
  }

  const allVegWords = words.length > 0 && words.every((w) =>
    simpleVegWords.some((v) => v === w || v.includes(w) || w.includes(v))
  );
  if (allVegWords && words.length <= 3) {
    score -= 3;
  }

  if (words.length === 1 && words[0].length <= 5) {
    score -= 1;
  }

  // Item-name positive signals
  if (proteinWords.some((p) => i.includes(p))) {
    score += 3;
  }
  if (dishWords.some((d) => i.includes(d))) {
    score += 3;
  }
  if (methodWords.some((m) => i.includes(m))) {
    score += 2;
  }

  if (words.length >= 2) {
    score += 1;
  }

  return score;
}

function isLikelyMainEntree(categoryName, stationName, itemName) {
  const score = scoreMenuItem(categoryName, stationName, itemName);
  // Only keep items with reasonably strong "main dish" signal
  return score >= 3;
}

/** Normalize name for matching (e.g. meal name lookup). */
function normName(str) {
  return (str || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Build a display name for a group of items served together at one station.
 * Single item → that name. Multiple → "A with B and C".
 */
function toDisplayName(itemNames) {
  const list = itemNames.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} with ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * From raw location + date, build flat "dish" rows. Items in the same
 * (meal, station, category) are grouped into one dish with a combined
 * displayName (e.g. "Pita with Chicken and Rice") so the UI can show
 * coherent meals instead of separate ingredients.
 */
function isLocationOpenToday(raw, date) {
  // Check if location is actually open on the specified day
  // weekHours contains the schedule for the week, with open: "0" for closed days
  const weekHours = raw.weekHours || [];
  if (!weekHours || weekHours.length === 0) return false;
  
  const dateStr = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, etc.
  
  // First try to find exact date match in weekHours
  for (const day of weekHours) {
    if (day.date === dateStr) {
      // If open is "0" or null/undefined, or start_time is null, location is closed
      if (day.open === "0" || !day.open || day.start_time === null) {
        return false;
      }
      return true;
    }
  }
  
  // If exact date not found, try matching by day of week index
  // weekHours index: 0=Sunday, 1=Monday, etc.
  for (const day of weekHours) {
    if (day.index === dayOfWeek) {
      if (day.open === "0" || !day.open || day.start_time === null) {
        return false;
      }
      return true;
    }
  }
  
  // Fallback: if no match found, check todaysHours for active meals
  const meals = raw.todaysHours || [];
  if (!meals || meals.length === 0) return false;
  return meals.some((m) => m && (m.active === "1" || m.active === 1));
}

function buildDishesForLocationDay(locWithDate) {
  const { raw, date } = locWithDate;
  const locationSlug = raw.slug;
  const locationTitle = raw.title;
  const facility = raw.facility;
  const meals = raw.todaysHours || [];
  const menus = raw.menus || [];

  // Skip processing if location has no active hours on this day
  if (!isLocationOpenToday(raw, date)) {
    return [];
  }

  const mealByName = new Map();
  meals.forEach((m) => {
    if (!m || !m.name) return;
    mealByName.set(normName(m.name), m);
  });

  const dishRows = [];

  menus.forEach((menu) => {
    if (!menu || !menu.section) return;
    const mealName = menu.section;
    const mealHour = mealByName.get(normName(mealName));
    const startTime = mealHour?.start_time || null;
    const endTime = mealHour?.end_time || null;
    const active = mealHour ? mealHour.active === "1" || mealHour.active === 1 : null;

    (menu.menuDisplays || []).forEach((display) => {
      const stationName = display.name || null;
      (display.categories || []).forEach((cat) => {
        const categoryName = cat.name || null;
        const items = (cat.items || cat.menuItems || []).filter(
          (item) => item && item.name
        );
        const itemNames = items.map((item) => item.name);
        if (itemNames.length === 0) return;

        const displayName = toDisplayName(itemNames);
        dishRows.push({
          date: date.toISOString().slice(0, 10),
          locationSlug,
          locationTitle,
          facility,
          mealName,
          stationName,
          categoryName,
          displayName,
          itemNames,
          startTime,
          endTime,
          active,
        });
      });
    });
  });

  return dishRows;
}

/**
 * Full hierarchy: by date → locations → meals → stations → categories → dishes.
 * Each dish has { displayName, itemNames }.
 */
function buildStructuredMenus(locResults) {
  const byDate = {};
  locResults.forEach((loc) => {
    if (!loc) return;
    const dishes = buildDishesForLocationDay(loc);
    const dateStr = loc.date.toISOString().slice(0, 10);
    if (!byDate[dateStr]) byDate[dateStr] = { locations: [] };

    const byLocation = new Map();
    dishes.forEach((d) => {
      const key = d.locationSlug;
      if (!byLocation.has(key)) {
        byLocation.set(key, {
          locationSlug: d.locationSlug,
          locationTitle: d.locationTitle,
          facility: d.facility,
          meals: [],
        });
      }
      const locEntry = byLocation.get(key);
      let mealEntry = locEntry.meals.find((m) => m.mealName === d.mealName);
      if (!mealEntry) {
        mealEntry = {
          mealName: d.mealName,
          startTime: d.startTime,
          endTime: d.endTime,
          active: d.active,
          stations: [],
        };
        locEntry.meals.push(mealEntry);
      }
      let stationEntry = mealEntry.stations.find(
        (s) => s.stationName === d.stationName
      );
      if (!stationEntry) {
        stationEntry = { stationName: d.stationName, categories: [] };
        mealEntry.stations.push(stationEntry);
      }
      let catEntry = stationEntry.categories.find(
        (c) => c.categoryName === d.categoryName
      );
      if (!catEntry) {
        catEntry = {
          categoryName: d.categoryName,
          dishes: [],
        };
        stationEntry.categories.push(catEntry);
      }
      catEntry.dishes.push({
        displayName: d.displayName,
        itemNames: d.itemNames,
      });
    });
    byDate[dateStr].locations = Array.from(byLocation.values());
  });
  return { byDate };
}

function flattenLocationDay(locWithDate) {
  const { raw, date } = locWithDate;
  const locationSlug = raw.slug;
  const locationTitle = raw.title;
  const facility = raw.facility;
  const meals = raw.todaysHours || [];
  const menus = raw.menus || [];

  // Skip processing if location has no active hours on this day
  if (!isLocationOpenToday(raw, date)) {
    return [];
  }

  const mealByName = new Map();
  meals.forEach((m) => {
    if (!m || !m.name) return;
    mealByName.set(normName(m.name), m);
  });

  const rows = [];

  menus.forEach((menu) => {
    if (!menu || !menu.section) return;
    const mealName = menu.section;
    const mealHour = mealByName.get(normName(mealName));
    const startTime = mealHour?.start_time || null;
    const endTime = mealHour?.end_time || null;
    const active = mealHour ? mealHour.active === "1" || mealHour.active === 1 : null;

    (menu.menuDisplays || []).forEach((display) => {
      const stationName = display.name || null;
      (display.categories || []).forEach((cat) => {
        const categoryName = cat.name || null;
        (cat.items || cat.menuItems || []).forEach((item) => {
          if (!item || !item.name) return;
          const itemName = item.name;
          rows.push({
            date: date.toISOString().slice(0, 10),
            locationSlug,
            locationTitle,
            facility,
            mealName,
            stationName,
            categoryName,
            itemName,
            startTime,
            endTime,
            active,
            isEntree: isLikelyMainEntree(categoryName, stationName, itemName),
          });
        });
      });
    });
  });

  return rows;
}

app.get("/api/menu", async (req, res) => {
  const days = Math.max(
    1,
    Math.min(14, parseInt(req.query.days, 10) || 7)
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const allEntries = [];
    const allDishes = [];
    const allLocationResults = [];

    for (let offset = 0; offset < days; offset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);

      const perDayPromises = LOCATION_SLUGS.map((slug) =>
        fetchLocationForDate(slug, date).catch((err) => {
          console.error(`Error fetching ${slug} for ${date.toISOString()}`, err);
          return null;
        })
      );

      const perDayResults = await Promise.all(perDayPromises);
      perDayResults.filter((loc) => loc && isLocationOpenToday(loc.raw, date)).forEach((loc) => {
        allEntries.push(...flattenLocationDay(loc));
        allDishes.push(...buildDishesForLocationDay(loc));
        allLocationResults.push(loc);
      });
    }

    const structured = buildStructuredMenus(allLocationResults);

    res.json({
      entries: allEntries,
      dishes: allDishes,
      structured,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load menus" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`ISU Dining API server listening on port ${PORT}`);
});

