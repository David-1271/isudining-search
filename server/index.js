import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

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
  return { raw: json[0], date };
}

function scoreMenuItem(categoryName, stationName, itemName) {
  const c = (categoryName || "").toLowerCase();
  const s = (stationName || "").toLowerCase();
  const i = (itemName || "").toLowerCase();

  const badCategoryKeywords = [
    "condiment","condiments","topping","toppings","sauce","salsas",
    "dressings","dressing","beverage","beverages","drink","drinks",
    "cereal","milk","yogurt","fruit","fruit bar","salad bar",
    "salad toppings","salads & sides","side","sides","dessert",
    "desserts","ice cream","bakery","bread","breads","rolls",
    "soup station","soup & salad","soup",
  ];
  const badItemKeywords = [
    "ketchup","mustard","relish","mayo","mayonnaise","bbq sauce",
    "barbecue sauce","hot sauce","salsa","salsa bar","salt","pepper",
    "brown sugar","white sugar","sugar","syrup","butter","margarine",
    "jam","jelly","honey","sliced tomato","sliced tomatoes",
    "sliced carrot","sliced carrots","sliced cucumber","sliced cucumbers",
    "shredded carrot","shredded carrots","shredded lettuce",
    "diced tomato","diced tomatoes",
  ];
  const simpleVegWords = [
    "lettuce","romaine","spinach","tomato","tomatoes","carrot","carrots",
    "cucumber","cucumbers","onion","onions","peppers","green peppers",
    "jalapeno","jalapenos","mushroom","mushrooms","olives","pickles",
  ];
  const proteinWords = [
    "chicken","beef","pork","turkey","tofu","fish","salmon","tuna",
    "ham","bacon","sausage","meatball","meatballs","egg","eggs",
  ];
  const dishWords = [
    "pizza","pasta","stir fry","stir-fry","casserole","sandwich",
    "sandwiches","taco","tacos","bowl","wrap","burger","burgers",
    "noodles","alfredo","lasagna","enchilada","enchiladas",
    "quesadilla","quesadillas",
  ];
  const methodWords = [
    "grilled","roasted","baked","fried","blackened","seared",
    "smoked","glazed","marinated","breaded",
  ];

  const words = i.split(/\s+/).filter(Boolean);
  let score = 0;

  if (badCategoryKeywords.some((k) => c.includes(k) || s.includes(k))) score -= 4;

  const goodCategoryKeywords = [
    "entrée","entree","entrees","main dish","main course",
    "chef's table","grill","pizza","pasta","homestyle","global","international",
  ];
  if (goodCategoryKeywords.some((k) => c.includes(k) || s.includes(k))) score += 4;
  if (badItemKeywords.some((k) => i === k || i.includes(k))) score -= 4;

  const allVegWords = words.length > 0 && words.every((w) =>
    simpleVegWords.some((v) => v === w || v.includes(w) || w.includes(v))
  );
  if (allVegWords && words.length <= 3) score -= 3;
  if (words.length === 1 && words[0].length <= 5) score -= 1;
  if (proteinWords.some((p) => i.includes(p))) score += 3;
  if (dishWords.some((d) => i.includes(d))) score += 3;
  if (methodWords.some((m) => i.includes(m))) score += 2;
  if (words.length >= 2) score += 1;

  return score;
}

function isLikelyMainEntree(categoryName, stationName, itemName) {
  return scoreMenuItem(categoryName, stationName, itemName) >= 3;
}

function flattenLocationDay(locWithDate) {
  const { raw, date } = locWithDate;
  const locationSlug = raw.slug;
  const locationTitle = raw.title;
  const facility = raw.facility;
  const meals = raw.todaysHours || [];
  const menus = raw.menus || [];

  const norm = (name) =>
    (name || "")
      .toString()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();

  // The ISU Dining API uses inconsistent names between todaysHours and menus.
  // This maps the normalized hours name to the normalized menu section name
  // so active/inactive status is correctly applied.
  //
  // Known mismatches:
  //   "Untitled"       in hours → "Dinner" in menus  (Union Drive)
  //   "Brunch / Lunch" in hours → "Lunch"  in menus  (Seasons on weekends)
  //   "Brunch"         in hours → "Lunch"  in menus
  const HOUR_ALIASES = {
    "untitled":      "dinner",
    "brunch lunch":  "lunch",
    "brunch":        "lunch",
  };

  const mealByName = new Map();
  meals.forEach((m) => {
    if (!m || !m.name) return;
    const key = norm(m.name);
    mealByName.set(key, m);
    // Also register under the canonical menu-section name so lookups succeed
    const alias = HOUR_ALIASES[key];
    if (alias && !mealByName.has(alias)) {
      mealByName.set(alias, m);
    }
  });

  const rows = [];

  menus.forEach((menu) => {
    if (!menu || !menu.section) return;
    const mealName = menu.section;
    const mealHour = mealByName.get(norm(mealName));
    const startTime = mealHour?.start_time || null;
    const endTime = mealHour?.end_time || null;

    // No matching hour = no open/closed signal — skip to be safe.
    const active = mealHour
      ? mealHour.active === "1" || mealHour.active === 1
      : false;

    if (!active) return;

    (menu.menuDisplays || []).forEach((display) => {
      const stationName = display.name || null;
      (display.categories || []).forEach((cat) => {
        const categoryName = cat.name || null;
        (cat.items || cat.menuItems || []).forEach((item) => {
          if (!item || !item.name) return;
          rows.push({
            date: date.toISOString().slice(0, 10),
            locationSlug,
            locationTitle,
            facility,
            mealName,
            stationName,
            categoryName,
            itemName: item.name,
            startTime,
            endTime,
            active,
            isEntree: isLikelyMainEntree(categoryName, stationName, item.name),
          });
        });
      });
    });
  });

  return rows;
}

app.get("/api/menu", async (req, res) => {
  const days = Math.max(1, Math.min(14, parseInt(req.query.days, 10) || 7));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const allEntries = [];

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
      perDayResults
        .filter(Boolean)
        .forEach((loc) => allEntries.push(...flattenLocationDay(loc)));
    }

    res.json({ entries: allEntries });
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