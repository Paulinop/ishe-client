package sim;

/** Simulation stand-in for Minecraft's Component: a plain-text factory plus a "mutable" one. */
public interface FakeComponent {
    String text();

    static FakeComponent nullToEmpty(String text) {
        return new FakeMutable(text);
    }

    static FakeMutable literal(String text) {
        return new FakeMutable(text);
    }

    final class FakeMutable implements FakeComponent {
        private final String text;

        FakeMutable(String text) {
            this.text = text;
        }

        @Override
        public String text() {
            return text;
        }
    }
}
