package link.e4steam.steam;

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.SocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.UUID;

/**
 * UNOFFICIAL PATCH - not part of upstream e4steam 0.3.2.
 *
 * Extra admission check for guests that arrive through the Steam bridge of an
 * integrated (singleplayer, "Open to LAN") world. It is called at the end of
 * PlayerListMixin.allowOwnerLogin and can only ever REJECT a login; it never
 * grants access that upstream would not grant.
 *
 * Rule 1: a Steam guest may not use the nickname of the world owner. Minecraft
 *         recognises the integrated-server owner by name, so such a guest would
 *         otherwise inherit owner privileges.
 * Rule 2: where the guest's Minecraft UUID is not derived from the SteamID
 *         (upstream only binds it on Minecraft 1.20.2+), a nickname is pinned
 *         to the first Steam account that used it, so another Steam account
 *         cannot take over that player's data by typing the same nickname.
 *
 * The class deliberately uses reflection only, so the same bytes work with
 * intermediary, SRG and official Minecraft names.
 */
public final class E4steamGuestGuard {
    static final String OWNER_NAME_MESSAGE =
            "e4steam: ese apodo es el del anfitrion. Cambia tu apodo de Minecraft y vuelve a entrar."
                    + " / That nickname belongs to the host. Change your Minecraft nickname and rejoin.";
    static final String PINNED_NAME_MESSAGE =
            "e4steam: ese apodo ya lo usa otra cuenta de Steam en este mundo. Usa otro apodo."
                    + " / That nickname is already used by another Steam account here. Use another nickname.";

    static final int ALLOW = 0;
    static final int REJECT_OWNER_NAME = 1;
    static final int REJECT_PINNED_NAME = 2;

    private static final String[] CAN_LOGIN_METHOD_NAMES = {
            "canPlayerLogin", "method_14586", "checkCanJoin", "m_6418_"
    };
    private static final String STORE_DIRECTORY = "e4steam";
    private static final String STORE_FILE = "guest-nicknames.properties";

    /** Test hook; production resolves the loader's config directory lazily. */
    static volatile Path storeOverride;
    private static final Object STORE_LOCK = new Object();
    private static Properties pins;
    private static boolean warned;

    private E4steamGuestGuard() {
    }

    /**
     * Entry point inserted into PlayerListMixin.allowOwnerLogin.
     *
     * @param playerList the PlayerList instance (the mixin's {@code this})
     * @param profile    GameProfile or NameAndId, depending on Minecraft version
     * @param callback   Mixin's CallbackInfoReturnable for canPlayerLogin
     */
    public static void check(
            Object playerList,
            SocketAddress socketAddress,
            Object profile,
            Object callback,
            long authenticatedSteamId,
            boolean vanillaOwnerMatch
    ) {
        if (authenticatedSteamId == 0L || callback == null) {
            return; // not a Steam bridge guest: upstream behaviour is untouched
        }
        int decision;
        try {
            decision = decide(
                    authenticatedSteamId,
                    vanillaOwnerMatch,
                    readString(profile, "name", "getName"),
                    readUuid(profile, "id", "getId"));
        } catch (Throwable failure) {
            warnOnce("could not evaluate guest nickname, keeping upstream behaviour", failure);
            return;
        }
        if (decision == ALLOW) {
            return;
        }
        try {
            Method getter = callback.getClass().getMethod("getReturnValue");
            if (getter.invoke(callback) != null) {
                return; // somebody already rejected this login with its own message
            }
        } catch (Throwable ignored) {
            // Fall through and reject with our own message.
        }
        String message = decision == REJECT_OWNER_NAME ? OWNER_NAME_MESSAGE : PINNED_NAME_MESSAGE;
        System.out.println("[e4steam-guard] rejected Steam guest "
                + SteamMinecraftIdentity.safeName(authenticatedSteamId)
                + (decision == REJECT_OWNER_NAME
                        ? ": nickname equals the world owner's"
                        : ": nickname is pinned to another Steam account"));
        Object component = null;
        try {
            component = buildComponent(playerList, message);
            if (component != null) {
                callback.getClass().getMethod("setReturnValue", Object.class).invoke(callback, component);
                return;
            }
        } catch (Throwable failure) {
            warnOnce("could not build the disconnect message", failure);
        }
        // Last resort: abort this login. Minecraft turns the exception into a
        // disconnect for remote (non-memory) connections.
        throw new IllegalStateException(message);
    }

    /** Pure decision; see the class comment for the two rules. */
    static int decide(long steamId, boolean vanillaOwnerMatch, String profileName, UUID profileId) {
        if (steamId == 0L) {
            return ALLOW;
        }
        if (vanillaOwnerMatch) {
            return REJECT_OWNER_NAME;
        }
        if (profileName == null || profileName.isEmpty()) {
            return ALLOW;
        }
        if (SteamMinecraftIdentity.uuid(steamId).equals(profileId)) {
            return ALLOW; // identity is bound to Steam, the nickname is cosmetic
        }
        return claim(profileName, steamId) ? ALLOW : REJECT_PINNED_NAME;
    }

    /** Pins a nickname to the first SteamID that uses it. Fails open on I/O errors. */
    static boolean claim(String profileName, long steamId) {
        String key = profileName.toLowerCase(Locale.ROOT);
        String value = Long.toUnsignedString(steamId);
        synchronized (STORE_LOCK) {
            Properties current = loadPins();
            String owner = current.getProperty(key);
            if (owner == null || owner.trim().isEmpty()) {
                current.setProperty(key, value);
                savePins(current);
                return true;
            }
            return owner.trim().equals(value);
        }
    }

    private static Properties loadPins() {
        if (pins != null) {
            return pins;
        }
        Properties loaded = new Properties();
        try {
            Path file = storeFile();
            if (file != null && Files.isRegularFile(file)) {
                try (InputStream input = Files.newInputStream(file)) {
                    loaded.load(input);
                }
            }
        } catch (Throwable failure) {
            warnOnce("could not read " + STORE_FILE + ", nicknames are pinned for this session only", failure);
        }
        pins = loaded;
        return loaded;
    }

    private static void savePins(Properties current) {
        try {
            Path file = storeFile();
            if (file == null) {
                return;
            }
            Files.createDirectories(file.getParent());
            try (OutputStream output = Files.newOutputStream(file)) {
                current.store(output,
                        "e4steam unofficial guard: nickname=SteamID64 that first used it. "
                                + "Delete a line to free that nickname.");
            }
        } catch (Throwable failure) {
            warnOnce("could not write " + STORE_FILE + ", nicknames are pinned for this session only", failure);
        }
    }

    private static Path storeFile() {
        Path override = storeOverride;
        if (override != null) {
            return override;
        }
        try {
            Class<?> agnos = Class.forName("link.e4steam.Agnos");
            Object directory = agnos.getMethod("configDir").invoke(null);
            if (directory instanceof Path) {
                return ((Path) directory).resolve(STORE_DIRECTORY).resolve(STORE_FILE);
            }
        } catch (Throwable ignored) {
            // No config directory available: keep pins in memory only.
        }
        return null;
    }

    /** Test hook: forget the cached pins so the next call re-reads the file. */
    static void resetForTests() {
        synchronized (STORE_LOCK) {
            pins = null;
            warned = false;
        }
    }

    /** Builds a plain text Component without naming any Minecraft class or method. */
    static Object buildComponent(Object playerList, String text) throws Exception {
        Class<?> componentType = componentType(playerList);
        if (componentType == null) {
            return null;
        }
        List<Method> exact = new ArrayList<Method>();
        List<Method> subtype = new ArrayList<Method>();
        for (Method method : componentType.getMethods()) {
            if (!Modifier.isStatic(method.getModifiers())
                    || method.getParameterCount() != 1
                    || method.getParameterTypes()[0] != String.class) {
                continue;
            }
            if (method.getReturnType() == componentType) {
                exact.add(method); // Component.nullToEmpty(String) on every supported version
            } else if (componentType.isAssignableFrom(method.getReturnType())) {
                subtype.add(method);
            }
        }
        Comparator<Method> byName = new Comparator<Method>() {
            @Override
            public int compare(Method left, Method right) {
                return left.getName().compareTo(right.getName());
            }
        };
        Collections.sort(exact, byName);
        Collections.sort(subtype, byName);
        List<Method> candidates = new ArrayList<Method>(exact);
        candidates.addAll(subtype);
        for (Method candidate : candidates) {
            try {
                Object value = candidate.invoke(null, text);
                if (componentType.isInstance(value)) {
                    return value;
                }
            } catch (Throwable ignored) {
                // Try the next factory.
            }
        }
        return null;
    }

    private static Class<?> componentType(Object playerList) {
        if (playerList == null) {
            return null;
        }
        for (Method method : playerList.getClass().getMethods()) {
            if (method.getParameterCount() != 2
                    || !SocketAddress.class.isAssignableFrom(method.getParameterTypes()[0])
                    || method.getReturnType().isPrimitive()) {
                continue;
            }
            for (String name : CAN_LOGIN_METHOD_NAMES) {
                if (name.equals(method.getName())) {
                    return method.getReturnType();
                }
            }
        }
        return null;
    }

    private static String readString(Object target, String... accessors) {
        Object value = read(target, accessors);
        return value instanceof String ? (String) value : null;
    }

    private static UUID readUuid(Object target, String... accessors) {
        Object value = read(target, accessors);
        return value instanceof UUID ? (UUID) value : null;
    }

    private static Object read(Object target, String... accessors) {
        if (target == null) {
            return null;
        }
        for (String accessor : accessors) {
            try {
                Method method = target.getClass().getMethod(accessor);
                return method.invoke(target);
            } catch (Throwable ignored) {
                // Try the accessor of the other Authlib / NameAndId layout.
            }
        }
        return null;
    }

    private static void warnOnce(String message, Throwable failure) {
        synchronized (STORE_LOCK) {
            if (warned) {
                return;
            }
            warned = true;
        }
        System.out.println("[e4steam-guard] " + message + ": " + failure);
    }
}
