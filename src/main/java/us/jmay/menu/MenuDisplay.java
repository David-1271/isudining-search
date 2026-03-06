package us.jmay.menu;

import java.util.ArrayList;
import java.util.List;

public class MenuDisplay {

    private String name;
    private MenuCategory[] categories;

    public String getName() { return name; }
    public MenuCategory[] getCategories() { return categories; }

    @Override
    public String toString() {
        StringBuilder out = new StringBuilder();
        out.append("    ").append(name).append('\n');
        for (MenuCategory category : categories) {
            out.append(category);
        }
        return out.toString();
    }

    /**
     * Returns matching item lines (indented) for any item whose name contains
     * {@code query} (case-insensitive).
     */
    public List<String> searchFood(String query) {
        List<String> results = new ArrayList<>();
        for (MenuCategory category : categories) {
            List<String> hits = category.searchFood(query);
            if (!hits.isEmpty()) {
                results.add("    [" + category.getCategory() + "]");
                results.addAll(hits);
            }
        }
        return results;
    }
}
