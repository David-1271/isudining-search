package us.jmay;

import java.time.LocalTime;

public class MealHour {

    private String name;
    private String start_time;
    private String end_time;
    private String active;

    public String getName() { return name; }

    public LocalTime getStartTime() {
        return LocalTime.parse(start_time);
    }

    public LocalTime getEndTime() {
        return LocalTime.parse(end_time);
    }

    public boolean isActive() {
        return "1".equals(active);
    }
}
