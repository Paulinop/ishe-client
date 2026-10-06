import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.SocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Loads the REAL PlayerListMixin, Mirror, SteamMinecraftIdentity (and, when present,
 * E4steamGuestGuard) classes out of a release jar, under the JVM bytecode verifier,
 * and drives allowOwnerLogin(...) the way Minecraft would for a set of logins.
 * Minecraft, Steam and Mixin themselves are replaced by small stand-ins.
 *
 * usage: SimHarness <jar> <stubsDir> <patched|original>
 */
public final class SimHarness {
    static final String MIXIN = "link.e4steam.mixin.PlayerListMixin";
    static final String CONCRETE = "sim.gen.ConcretePlayerList";
    static final long FRIEND_A = 76561198000000001L;
    static final long FRIEND_B = 76561198000000002L;

    static final class SimLoader extends ClassLoader {
        final ZipFile jar;
        final Path stubs;
        final Map<String, byte[]> generated = new HashMap<>();
        final TreeSet<String> fromJar = new TreeSet<>();
        final TreeSet<String> fromStubs = new TreeSet<>();
        final TreeSet<String> autoStubbed = new TreeSet<>();

        SimLoader(ZipFile jar, Path stubs) {
            super(SimHarness.class.getClassLoader());
            this.jar = jar;
            this.stubs = stubs;
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            synchronized (getClassLoadingLock(name)) {
                Class<?> loaded = findLoadedClass(name);
                if (loaded == null) {
                    if (name.startsWith("java.") || name.startsWith("javax.") || name.startsWith("jdk.")
                            || name.startsWith("sun.")) {
                        loaded = super.loadClass(name, false);
                    } else {
                        loaded = findClass(name);
                    }
                }
                if (resolve) resolveClass(loaded);
                return loaded;
            }
        }

        @Override
        protected Class<?> findClass(String name) throws ClassNotFoundException {
            String path = name.replace('.', '/') + ".class";
            try {
                byte[] bytes = generated.get(name);
                if (bytes == null) {
                    Path stub = stubs.resolve(path);
                    if (Files.isRegularFile(stub)) {
                        bytes = Files.readAllBytes(stub);
                        fromStubs.add(name);
                    }
                }
                if (bytes == null) {
                    ZipEntry entry = jar.getEntry(path);
                    if (entry != null) {
                        try (InputStream input = jar.getInputStream(entry)) {
                            bytes = input.readAllBytes();
                        }
                        fromJar.add(name);
                    }
                }
                if (bytes == null && (name.startsWith("net.minecraft.") || name.startsWith("org.slf4j.")
                        || name.startsWith("org.apache.logging.") || name.startsWith("com.mojang.")
                        || name.startsWith("org.spongepowered.") || name.startsWith("folk.")
                        || name.startsWith("dev.architectury.") || name.startsWith("net.fabricmc.")
                        || name.startsWith("net.neoforged.") || name.startsWith("net.minecraftforge."))) {
                    // Types that are only mentioned, never used, in the code under test.
                    ClassWriter writer = new ClassWriter(0);
                    writer.visit(Opcodes.V1_8, Opcodes.ACC_PUBLIC, name.replace('.', '/'), null,
                            "java/lang/Object", null);
                    writer.visitEnd();
                    bytes = writer.toByteArray();
                    autoStubbed.add(name);
                }
                if (bytes == null) throw new ClassNotFoundException(name);
                return defineClass(name, bytes, 0, bytes.length);
            } catch (ClassNotFoundException e) {
                throw e;
            } catch (Exception e) {
                throw new ClassNotFoundException(name, e);
            }
        }
    }

    /** Concrete subclass of the abstract mixin class, standing in for Minecraft's PlayerList. */
    static byte[] concretePlayerList(byte[] mixinBytes, String canLoginName) {
        ClassNode mixin = new ClassNode();
        new ClassReader(mixinBytes).accept(mixin, ClassReader.SKIP_CODE);
        String self = CONCRETE.replace('.', '/');
        ClassWriter writer = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        writer.visit(Opcodes.V1_8, Opcodes.ACC_PUBLIC, self, null, mixin.name, null);
        writer.visitField(Opcodes.ACC_PUBLIC, "server", "Lnet/minecraft/server/MinecraftServer;", null, null)
                .visitEnd();
        MethodVisitor init = writer.visitMethod(Opcodes.ACC_PUBLIC, "<init>", "()V", null, null);
        init.visitCode();
        init.visitVarInsn(Opcodes.ALOAD, 0);
        init.visitMethodInsn(Opcodes.INVOKESPECIAL, mixin.name, "<init>", "()V", false);
        init.visitInsn(Opcodes.RETURN);
        init.visitMaxs(0, 0);
        init.visitEnd();
        for (MethodNode method : mixin.methods) {
            if ((method.access & Opcodes.ACC_ABSTRACT) == 0) continue;
            Type returns = Type.getReturnType(method.desc);
            MethodVisitor body = writer.visitMethod(Opcodes.ACC_PUBLIC, method.name, method.desc, null, null);
            body.visitCode();
            if (returns.getDescriptor().equals("Lnet/minecraft/server/MinecraftServer;")) {
                body.visitVarInsn(Opcodes.ALOAD, 0);
                body.visitFieldInsn(Opcodes.GETFIELD, self, "server", returns.getDescriptor());
                body.visitInsn(Opcodes.ARETURN);
            } else if (returns.getSort() == Type.OBJECT || returns.getSort() == Type.ARRAY) {
                body.visitInsn(Opcodes.ACONST_NULL);
                body.visitInsn(Opcodes.ARETURN);
            } else {
                throw new IllegalStateException("unexpected abstract method " + method.name + method.desc);
            }
            body.visitMaxs(0, 0);
            body.visitEnd();
        }
        // The method Minecraft itself declares on PlayerList; its return type is the Component type.
        MethodVisitor canLogin = writer.visitMethod(Opcodes.ACC_PUBLIC, canLoginName,
                "(Ljava/net/SocketAddress;Ljava/lang/Object;)Lsim/FakeComponent;", null, null);
        canLogin.visitCode();
        canLogin.visitInsn(Opcodes.ACONST_NULL);
        canLogin.visitInsn(Opcodes.ARETURN);
        canLogin.visitMaxs(0, 0);
        canLogin.visitEnd();
        writer.visitEnd();
        return writer.toByteArray();
    }

    static int failures;
    static int checks;

    static void expect(boolean condition, String what) {
        checks++;
        System.out.println((condition ? "  ok   " : "  FAIL ") + what);
        if (!condition) failures++;
    }

    static UUID offlineUuid(String name) {
        return UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(StandardCharsets.UTF_8));
    }

    public static void main(String[] args) throws Exception {
        Path jarPath = Paths.get(args[0]);
        boolean patched = args[2].equals("patched");
        System.out.println("== " + jarPath.getFileName() + " (" + args[2] + ")");
        try (ZipFile jar = new ZipFile(jarPath.toFile())) {
            SimLoader loader = new SimLoader(jar, Paths.get(args[1]));
            byte[] mixinBytes;
            try (InputStream input = jar.getInputStream(jar.getEntry(MIXIN.replace('.', '/') + ".class"))) {
                mixinBytes = input.readAllBytes();
            }
            ClassNode mixinNode = new ClassNode();
            new ClassReader(mixinBytes).accept(mixinNode, ClassReader.SKIP_CODE);
            String flavour = "official";
            String canLogin = "canPlayerLogin";
            for (MethodNode method : mixinNode.methods) {
                if ((method.access & Opcodes.ACC_ABSTRACT) == 0) continue;
                if (method.name.startsWith("method_")) { flavour = "intermediary"; canLogin = "method_14586"; }
                if (method.name.startsWith("m_")) { flavour = "srg"; canLogin = "m_6418_"; }
            }
            System.out.println("  names in this jar: " + flavour + ", PlayerList login method: " + canLogin);
            loader.generated.put(CONCRETE, concretePlayerList(mixinBytes, canLogin));

            Class<?> listClass = Class.forName(CONCRETE, true, loader);
            Class<?> serverClass = Class.forName("net.minecraft.server.MinecraftServer", true, loader);
            Class<?> runtimeClass = Class.forName("link.e4steam.steam.SteamRuntime", true, loader);
            Class<?> identityClass = Class.forName("link.e4steam.steam.SteamMinecraftIdentity", true, loader);
            Class<?> callbackClass = Class.forName(
                    "org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable", true, loader);
            Class<?> profileClass = Class.forName("com.mojang.authlib.GameProfile", true, loader);
            Class<?> nameAndIdClass = Class.forName("sim.NameAndId", true, loader);
            Class<?> componentClass = Class.forName("sim.FakeComponent", true, loader);

            Object server = serverClass.getConstructor().newInstance();
            serverClass.getField("ownerName").set(server, "Guillermo");
            Object list = listClass.getConstructor().newInstance();
            listClass.getField("server").set(list, server);
            Method handler = listClass.getMethod("allowOwnerLogin", SocketAddress.class, Object.class, callbackClass);
            Field nextPeer = runtimeClass.getField("nextPeer");
            Method steamUuid = identityClass.getMethod("uuid", long.class);
            SocketAddress address = new InetSocketAddress("127.0.0.1", 25565);

            if (patched) {
                Class<?> guard = Class.forName("link.e4steam.steam.E4steamGuestGuard", true, loader);
                Field override = guard.getDeclaredField("storeOverride");
                override.setAccessible(true);
                override.set(null, Files.createTempDirectory("sim-store").resolve("e4steam")
                        .resolve("guest-nicknames.properties"));
            }

            // Each scenario: steamId of the socket (0 = host / LAN), profile, expected outcome.
            List<Object[]> scenarios = new ArrayList<>();
            // profile kinds: legacy GameProfile (all jars) and record-style NameAndId (official names only)
            List<String> kinds = new ArrayList<>();
            kinds.add("GameProfile");
            if (flavour.equals("official")) kinds.add("NameAndId");
            for (String kind : kinds) {
                Class<?> type = kind.equals("GameProfile") ? profileClass : nameAndIdClass;
                java.lang.reflect.Constructor<?> make = type.getConstructor(UUID.class, String.class);
                UUID boundA = (UUID) steamUuid.invoke(null, FRIEND_A);
                UUID boundB = (UUID) steamUuid.invoke(null, FRIEND_B);
                String tag = kind + ": ";
                scenarios.add(new Object[]{tag + "host joins own world", 0L,
                        make.newInstance(UUID.randomUUID(), "Guillermo"), "bypass"});
                scenarios.add(new Object[]{tag + "LAN player with another nickname", 0L,
                        make.newInstance(offlineUuid("Vecino"), "Vecino"), "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend A as 'Franchesca' (Steam-bound UUID)", FRIEND_A,
                        make.newInstance(boundA, "Franchesca"), "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend B as 'Franchesca' too (Steam-bound UUID)", FRIEND_B,
                        make.newInstance(boundB, "Franchesca"), "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend A using the host's nickname 'guillermo'", FRIEND_A,
                        make.newInstance(boundA, "guillermo"), patched ? "reject-owner" : "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend A as '" + kind + "Mia' (unbound, old Minecraft)", FRIEND_A,
                        make.newInstance(offlineUuid(kind + "Mia"), kind + "Mia"), "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend A rejoins as '" + kind + "Mia'", FRIEND_A,
                        make.newInstance(offlineUuid(kind + "Mia"), kind + "Mia"), "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend B types '" + kind + "Mia' (unbound, old Minecraft)", FRIEND_B,
                        make.newInstance(offlineUuid(kind + "Mia"), kind + "Mia"), patched ? "reject-pinned" : "untouched"});
                scenarios.add(new Object[]{tag + "Steam friend B using the host's nickname (unbound)", FRIEND_B,
                        make.newInstance(UUID.randomUUID(), "GUILLERMO"), patched ? "reject-owner" : "untouched"});
            }

            for (Object[] scenario : scenarios) {
                nextPeer.set(null, scenario[1]);
                Object callback = callbackClass.getConstructor().newInstance();
                handler.invoke(list, address, scenario[2], callback);
                int sets = callbackClass.getField("sets").getInt(callback);
                Object value = callbackClass.getMethod("getReturnValue").invoke(callback);
                String outcome;
                if (sets == 0) outcome = "untouched";
                else if (value == null) outcome = "bypass";
                else if (componentClass.isInstance(value)) {
                    String text = (String) componentClass.getMethod("text").invoke(value);
                    outcome = text.contains("anfitrion") ? "reject-owner"
                            : text.contains("otra cuenta de Steam") ? "reject-pinned" : "reject-other";
                } else outcome = "non-component:" + value;
                expect(outcome.equals(scenario[3]), scenario[0] + " -> " + outcome
                        + (outcome.equals(scenario[3]) ? "" : " (expected " + scenario[3] + ")"));
            }
            System.out.println("  real classes executed from the jar: " + loader.fromJar);
            System.out.println("  stand-ins: " + loader.fromStubs + " auto-stubbed: " + loader.autoStubbed);
        }
        System.out.println("  " + (checks - failures) + "/" + checks + " as expected");
        if (failures > 0) System.exit(1);
    }
}
