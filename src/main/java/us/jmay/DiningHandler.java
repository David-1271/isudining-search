package us.jmay;

import com.google.gson.Gson;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class DiningHandler {

    /** Canonical display order for meal periods. */
    private static final List<String> MEAL_ORDER = Arrays.asList(
            "Breakfast", "Brunch", "Lunch", "Dinner", "Late Night"
    );

    private final Map<Integer, String> locations;
    private final String urlFormat;
    private final Gson gson;

    public DiningHandler(Gson gson, Map<Integer, String> locations, String url) {
        this.gson = gson;
        this.locations = locations;
        this.urlFormat = url;
    }

    public void setupDining() {
        List<DiningCenter> diningCenters = loadDiningCenters();
        if (diningCenters == null) return;

        try (Scanner scanner = new Scanner(System.in)) {
            boolean running = true;
            while (running) {
                System.out.println("\n--- ISU Dining ---");
                System.out.println("1. Browse by meal period");
                System.out.println("2. Search for a food item");
                System.out.println("0. Exit");
                System.out.print("Choice: ");
                System.out.flush();

                String input = scanner.nextLine().trim();
                switch (input) {
                    case "1" -> browseMeals(scanner, diningCenters);
                    case "2" -> searchFood(scanner, diningCenters);
                    case "0" -> running = false;
                    default  -> System.out.println("Invalid choice, please try again.");
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // Browse mode
    // -------------------------------------------------------------------------

    private void browseMeals(Scanner scanner, List<DiningCenter> diningCenters) {
        String[] meals = getActiveMeals(diningCenters);
        if (meals.length == 0) {
            System.out.println("No active meal periods found.");
            return;
        }

        System.out.println("\nActive meal periods:");
        for (int i = 0; i < meals.length; i++) {
            System.out.printf("  %d. %s%n", i + 1, meals[i]);
        }
        System.out.print("Select meal period (number): ");
        System.out.flush();

        int selection = readIntInRange(scanner, 1, meals.length);
        if (selection == -1) return;

        String chosenMeal = meals[selection - 1];
        System.out.println();
        for (DiningCenter center : diningCenters) {
            System.out.println(center.formatMenu(chosenMeal));
        }
    }

    // -------------------------------------------------------------------------
    // Search mode
    // -------------------------------------------------------------------------

    private void searchFood(Scanner scanner, List<DiningCenter> diningCenters) {
        String[] meals = getActiveMeals(diningCenters);
        if (meals.length == 0) {
            System.out.println("No active meal periods found.");
            return;
        }

        System.out.println("\nSearch within which meal period?");
        for (int i = 0; i < meals.length; i++) {
            System.out.printf("  %d. %s%n", i + 1, meals[i]);
        }
        System.out.print("Select meal period (number): ");
        System.out.flush();

        int mealSelection = readIntInRange(scanner, 1, meals.length);
        if (mealSelection == -1) return;
        String chosenMeal = meals[mealSelection - 1];

        System.out.print("Search: ");
        System.out.flush();
        String query = scanner.nextLine().trim();
        if (query.isEmpty()) {
            System.out.println("No search term entered.");
            return;
        }

        boolean anyFound = false;
        System.out.printf("%nResults for \"%s\" during %s:%n", query, chosenMeal);

        for (DiningCenter center : diningCenters) {
            List<String> hits = center.searchFood(query, chosenMeal);
            if (!hits.isEmpty()) {
                anyFound = true;
                System.out.println(center.getTitle());
                hits.forEach(System.out::println);
            }
        }

        if (!anyFound) {
            System.out.println("  No matching items found.");
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private List<DiningCenter> loadDiningCenters() {
        List<DiningCenter> centers = new ArrayList<>();
        try {
            for (String locationName : locations.values()) {
                String url = String.format(urlFormat, locationName);
                String menuJson = fetchUrl(url);
                DiningCenter[] parsed = gson.fromJson(menuJson, DiningCenter[].class);
                if (parsed != null && parsed.length > 0) {
                    centers.add(parsed[0]);
                }
            }
        } catch (IOException e) {
            System.err.println("Failed to fetch dining data: " + e.getMessage());
            return null;
        }
        return centers;
    }

    /**
     * Returns the set of currently active meal period names across all dining
     * centers, sorted by canonical meal order (Breakfast → Brunch → Lunch →
     * Dinner → Late Night), with any unknown periods appended at the end.
     */
    static String[] getActiveMeals(List<DiningCenter> centers) {
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        LinkedHashSet<String> raw = new LinkedHashSet<>();

        for (DiningCenter center : centers) {
            for (MealHour hour : center.getTodaysHours()) {
                if (hour.isActive()) {
                    raw.add(hour.getName());
                }
            }
        }

        // Add in canonical order first, then any unknown periods.
        for (String canonical : MEAL_ORDER) {
            if (raw.contains(canonical)) ordered.add(canonical);
        }
        for (String name : raw) {
            if (!MEAL_ORDER.contains(name)) ordered.add(name);
        }

        return ordered.toArray(new String[0]);
    }

    private static String fetchUrl(String url) throws IOException {
        InputStream rawStream = URI.create(url).toURL().openStream();
        try (BufferedInputStream stream = new BufferedInputStream(rawStream)) {
            return new String(stream.readAllBytes());
        }
    }

    /**
     * Reads a line from {@code scanner} and parses it as an integer in
     * [{@code min}, {@code max}]. Returns -1 if the input is invalid.
     */
    private static int readIntInRange(Scanner scanner, int min, int max) {
        String line = scanner.nextLine().trim();
        try {
            int value = Integer.parseInt(line);
            if (value >= min && value <= max) return value;
        } catch (NumberFormatException ignored) { }
        System.out.printf("Please enter a number between %d and %d.%n", min, max);
        return -1;
    }
}
