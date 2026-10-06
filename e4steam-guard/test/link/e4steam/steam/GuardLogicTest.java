package link.e4steam.steam;

import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/** Plain-Java checks for the guard (no Minecraft, no JUnit available offline). */
public final class GuardLogicTest {
    private static int checks;

    // --- fakes shaped like the Minecraft types the guard meets -------------
    public interface FakeComponent {
        String text();

        static FakeComponent nullToEmpty(String text) {
            return new FakeMutable("exact:" + text);
        }

        static FakeMutable literal(String text) {
            return new FakeMutable("literal:" + text);
        }
    }

    public static final class FakeMutable implements FakeComponent {
        private final String text;

        FakeMutable(String text) {
            this.text = text;
        }

        @Override
        public String text() {
            return text;
        }
    }

    /** A component type with no usable (String) factory at all. */
    public interface BareComponent {
    }

    public static class LegacyProfile {
        private final UUID id;
        private final String name;

        public LegacyProfile(UUID id, String name) {
            this.id = id;
            this.name = name;
        }

        public UUID getId() {
            return id;
        }

        public String getName() {
            return name;
        }
    }

    public static class RecordProfile {
        private final UUID id;
        private final String name;

        public RecordProfile(UUID id, String name) {
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

    public static class IntermediaryPlayerList {
        public FakeComponent method_14586(SocketAddress address, Object profile) {
            return null;
        }
    }

    public static class SrgPlayerList {
        public FakeComponent m_6418_(SocketAddress address, Object profile) {
            return null;
        }
    }

    public static class OfficialPlayerList {
        public FakeComponent canPlayerLogin(SocketAddress address, Object profile) {
            return null;
        }
    }

    public static class BarePlayerList {
        public BareComponent canPlayerLogin(SocketAddress address, Object profile) {
            return null;
        }
    }

    public static class UnknownPlayerList {
        public FakeComponent somethingElse(SocketAddress address, Object profile) {
            return null;
        }
    }

    public static class FakeCallback {
        private Object value;
        int sets;

        public Object getReturnValue() {
            return value;
        }

        public void setReturnValue(Object value) {
            this.value = value;
            this.sets++;
        }
    }

    // --- helpers -------------------------------------------------------------
    private static void check(boolean condition, String what) {
        checks++;
        if (!condition) {
            throw new AssertionError("FAILED: " + what);
        }
    }

    private static final long HOST_FRIEND = 76561198000000001L;
    private static final long OTHER_FRIEND = 76561198000000002L;
    private static final SocketAddress ADDRESS = new InetSocketAddress("127.0.0.1", 25565);

    private static UUID offlineUuid(String name) {
        return UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static void freshStore(Path file) throws Exception {
        Files.deleteIfExists(file);
        E4steamGuestGuard.storeOverride = file;
        E4steamGuestGuard.resetForTests();
    }

    public static void main(String[] args) throws Exception {
        Path directory = Files.createTempDirectory("guard-test");
        Path store = directory.resolve("e4steam").resolve("guest-nicknames.properties");

        // ---- decide(): rule 1, owner nickname ------------------------------
        freshStore(store);
        check(E4steamGuestGuard.decide(0L, true, "Host", null) == E4steamGuestGuard.ALLOW,
                "non-Steam logins are never touched, even on an owner match");
        check(E4steamGuestGuard.decide(HOST_FRIEND, true, "Host", SteamMinecraftIdentity.uuid(HOST_FRIEND))
                        == E4steamGuestGuard.REJECT_OWNER_NAME,
                "Steam guest with the owner's nickname is rejected even when the UUID is Steam-bound");
        check(E4steamGuestGuard.decide(HOST_FRIEND, true, "Host", offlineUuid("Host"))
                        == E4steamGuestGuard.REJECT_OWNER_NAME,
                "Steam guest with the owner's nickname is rejected on unbound versions");
        check(!Files.exists(store), "owner rejections never write the nickname store");

        // ---- decide(): bound identity (Minecraft 1.20.2+) -----------------
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "Alex", SteamMinecraftIdentity.uuid(HOST_FRIEND))
                        == E4steamGuestGuard.ALLOW,
                "Steam-bound guest is allowed");
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Alex", SteamMinecraftIdentity.uuid(OTHER_FRIEND))
                        == E4steamGuestGuard.ALLOW,
                "two Steam-bound guests may share a cosmetic nickname");
        check(!Files.exists(store), "bound guests never write the nickname store");

        // ---- decide(): rule 2, unbound identity (Minecraft <= 1.20.1) ------
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.ALLOW,
                "first Steam account to use a nickname is allowed");
        check(Files.isRegularFile(store), "the pin is persisted");
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.ALLOW,
                "the same Steam account can rejoin with its nickname");
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.REJECT_PINNED_NAME,
                "another Steam account cannot take a pinned nickname");
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "aLEX", offlineUuid("aLEX"))
                        == E4steamGuestGuard.REJECT_PINNED_NAME,
                "pinning ignores letter case");
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Steve", null)
                        == E4steamGuestGuard.ALLOW,
                "a different nickname is free, also when the UUID is unreadable");
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "", null) == E4steamGuestGuard.ALLOW
                        && E4steamGuestGuard.decide(HOST_FRIEND, false, null, null) == E4steamGuestGuard.ALLOW,
                "missing nickname keeps upstream behaviour");

        // pins survive a restart (cache dropped, file re-read)
        E4steamGuestGuard.resetForTests();
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.REJECT_PINNED_NAME,
                "pins are re-read from disk after a restart");
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.ALLOW,
                "owner of the pin still gets in after a restart");

        // deleting the line frees the nickname, as the file header promises
        Files.write(store, "steve=76561198000000002\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        E4steamGuestGuard.resetForTests();
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Alex", offlineUuid("Alex"))
                        == E4steamGuestGuard.ALLOW,
                "a nickname removed from the file can be claimed again");

        // unusable store location: fail open, but still consistent in memory
        Path blocker = directory.resolve("blocker");
        Files.write(blocker, new byte[]{1});
        E4steamGuestGuard.storeOverride = blocker.resolve("sub").resolve("pins.properties");
        E4steamGuestGuard.resetForTests();
        check(E4steamGuestGuard.decide(HOST_FRIEND, false, "Kai", offlineUuid("Kai"))
                        == E4steamGuestGuard.ALLOW,
                "an unwritable store does not lock players out");
        check(E4steamGuestGuard.decide(OTHER_FRIEND, false, "Kai", offlineUuid("Kai"))
                        == E4steamGuestGuard.REJECT_PINNED_NAME,
                "pins still hold in memory when the file cannot be written");

        // ---- check(): full entry point against fake Minecraft shapes -------
        freshStore(store);
        Object[] playerLists = {new IntermediaryPlayerList(), new SrgPlayerList(), new OfficialPlayerList()};
        for (Object playerList : playerLists) {
            String flavour = playerList.getClass().getSimpleName();

            FakeCallback untouched = new FakeCallback();
            E4steamGuestGuard.check(playerList, ADDRESS, new LegacyProfile(UUID.randomUUID(), "Host"),
                    untouched, 0L, true);
            check(untouched.sets == 0, flavour + ": host / LAN login is left alone");

            FakeCallback allowed = new FakeCallback();
            E4steamGuestGuard.check(playerList, ADDRESS,
                    new RecordProfile(SteamMinecraftIdentity.uuid(HOST_FRIEND), "Alex"), allowed, HOST_FRIEND, false);
            check(allowed.sets == 0, flavour + ": normal Steam guest is left alone");

            FakeCallback owner = new FakeCallback();
            E4steamGuestGuard.check(playerList, ADDRESS,
                    new RecordProfile(SteamMinecraftIdentity.uuid(HOST_FRIEND), "Host"), owner, HOST_FRIEND, true);
            check(owner.sets == 1 && owner.getReturnValue() instanceof FakeComponent,
                    flavour + ": owner-nickname guest gets a disconnect component");
            check(((FakeComponent) owner.getReturnValue()).text()
                            .equals("exact:" + E4steamGuestGuard.OWNER_NAME_MESSAGE),
                    flavour + ": the plain-text factory is preferred and carries the message");
        }

        // legacy-style profile (getName/getId) on an unbound version: pin then reject
        freshStore(store);
        FakeCallback first = new FakeCallback();
        E4steamGuestGuard.check(new SrgPlayerList(), ADDRESS, new LegacyProfile(offlineUuid("Mia"), "Mia"),
                first, HOST_FRIEND, false);
        check(first.sets == 0, "unbound: first user of a nickname joins");
        FakeCallback second = new FakeCallback();
        E4steamGuestGuard.check(new SrgPlayerList(), ADDRESS, new LegacyProfile(offlineUuid("Mia"), "Mia"),
                second, OTHER_FRIEND, false);
        check(second.sets == 1 && ((FakeComponent) second.getReturnValue()).text()
                        .equals("exact:" + E4steamGuestGuard.PINNED_NAME_MESSAGE),
                "unbound: second Steam account with that nickname is rejected with the pin message");

        // an earlier rejection by someone else is not overwritten
        FakeCallback preset = new FakeCallback();
        preset.setReturnValue("banned by vanilla");
        E4steamGuestGuard.check(new OfficialPlayerList(), ADDRESS,
                new RecordProfile(SteamMinecraftIdentity.uuid(HOST_FRIEND), "Host"), preset, HOST_FRIEND, true);
        check(preset.sets == 1 && "banned by vanilla".equals(preset.getReturnValue()),
                "an existing rejection message is kept");

        // no way to build a message: the login is still aborted, never allowed
        for (Object playerList : new Object[]{new BarePlayerList(), new UnknownPlayerList()}) {
            FakeCallback callback = new FakeCallback();
            boolean aborted = false;
            try {
                E4steamGuestGuard.check(playerList, ADDRESS,
                        new RecordProfile(SteamMinecraftIdentity.uuid(HOST_FRIEND), "Host"),
                        callback, HOST_FRIEND, true);
            } catch (IllegalStateException expected) {
                aborted = true;
            }
            check(aborted && callback.sets == 0,
                    playerList.getClass().getSimpleName() + ": login is aborted when no message can be built");
        }

        // a broken profile object must not break ordinary guests
        FakeCallback broken = new FakeCallback();
        E4steamGuestGuard.check(new OfficialPlayerList(), ADDRESS, new Object(), broken, HOST_FRIEND, false);
        check(broken.sets == 0, "unreadable profile keeps upstream behaviour");

        System.out.println("GuardLogicTest: " + checks + " checks passed");
    }
}
