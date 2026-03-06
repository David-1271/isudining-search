package us.jmay;

import us.jmay.menu.Menu;
import us.jmay.menu.MenuDisplay;

import java.util.ArrayList;
import java.util.List;

public class DiningCenter {

    private String title;
    private String facility;
    private Menu[] menus;
    private MealHour[] todaysHours;

    public String getTitle() { return title; }
    public String getFacility() { return facility; }
    public Menu[] getMenus() { return menus; }
    public MealHour[] getTodaysHours() { return todaysHours; }

    public Menu getMeal(String section) {
        if (menus == null) return null;
        for (Menu menu : menus) {
            if (menu.getSection().equals(section)) {
                return menu;
            }
        }
        return null;
    }

    public MealHour getOpenTime(String section) {
        if (todaysHours == null) return null;
        for (MealHour mealHour : todaysHours) {
            if (mealHour.getName().equals(section)) {
                return mealHour;
            }
        }
        return null;
    }

    /** Format the full menu for a given meal section. */
    public String formatMenu(String section) {
        Menu m = getMeal(section);
        MealHour hour = getOpenTime(section);

        if (m == null || (hour != null && !hour.isActive())) {
            return title + "\n    N/A\n";
        }

        StringBuilder out = new StringBuilder();
        out.append(title);
        if (hour != null) {
            out.append(" : ")
               .append(hour.getStartTime())
               .append(" - ")
               .append(hour.getEndTime());
        }
        out.append('\n');
        for (MenuDisplay menuDisplay : m.getMenuDisplays()) {
            out.append(menuDisplay);
        }
        return out.toString();
    }

    /**
     * Search for a food item by name (case-insensitive substring) within a
     * given meal section. Returns matching result lines, or an empty list if
     * none found or the section is inactive.
     */
    public List<String> searchFood(String query, String section) {
        List<String> results = new ArrayList<>();
        Menu m = getMeal(section);
        MealHour hour = getOpenTime(section);

        if (m == null || (hour != null && !hour.isActive())) {
            return results;
        }

        for (MenuDisplay display : m.getMenuDisplays()) {
            List<String> hits = display.searchFood(query);
            if (!hits.isEmpty()) {
                results.add("  [" + display.getName() + "]");
                results.addAll(hits);
            }
        }
        return results;
    }
}
