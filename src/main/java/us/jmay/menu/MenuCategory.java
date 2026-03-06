package us.jmay.menu;

import java.util.ArrayList;
import java.util.List;

public class MenuCategory {

    private String category;
    private MenuItem[] menuItems;

    public String getCategory() { return category; }
    public MenuItem[] getMenuItems() { return menuItems; }

    @Override
    public String toString() {
        StringBuilder out = new StringBuilder();
        out.append("        ").append(category).append('\n');
        for (MenuItem menuItem : menuItems) {
            out.append("            ").append(menuItem).append('\n');
        }
        return out.toString();
    }

    /**
     * Returns a list of indented item lines whose names contain {@code query}
     * (case-insensitive substring match).
     */
    public List<String> searchFood(String query) {
        List<String> results = new ArrayList<>();
        String lowerQuery = query.toLowerCase();
        for (MenuItem item : menuItems) {
            if (item.getName().toLowerCase().contains(lowerQuery)) {
                results.add("      " + item.getName());
            }
        }
        return results;
    }
}
