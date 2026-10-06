package sim;

import java.util.UUID;

/** Simulation stand-in for the record-style profile newer Minecraft passes to canPlayerLogin. */
public final class NameAndId {
    private final UUID id;
    private final String name;

    public NameAndId(UUID id, String name) {
        this.id = id;
        this.name = name;
    }

    public UUID id() {
        return id;
    }

    public String name() {
        return name;
    }
}
