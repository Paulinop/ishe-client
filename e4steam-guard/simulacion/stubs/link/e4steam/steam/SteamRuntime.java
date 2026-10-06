package link.e4steam.steam;

/** Simulation stand-in: reports whichever SteamID the scenario says the socket belongs to. */
public class SteamRuntime {
    public static volatile long nextPeer;
    private static final SteamRuntime INSTANCE = new SteamRuntime();

    public static SteamRuntime get() {
        return INSTANCE;
    }

    public long authenticatedMinecraftPeer(java.net.SocketAddress address) {
        return nextPeer;
    }
}
