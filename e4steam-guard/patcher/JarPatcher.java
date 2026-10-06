import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.InsnList;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.VarInsnNode;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Adds one call to link.e4steam.steam.E4steamGuestGuard.check(...) before every
 * RETURN of PlayerListMixin.allowOwnerLogin and packs the guard classes into the
 * jar. Every other entry is copied unchanged.
 *
 * usage: JarPatcher <in.jar> <out.jar> <guardClassesDir> <noticeFile>
 */
public final class JarPatcher {
    static final String MIXIN = "link/e4steam/mixin/PlayerListMixin.class";
    static final String METHOD = "allowOwnerLogin";
    static final String METHOD_DESC = "(Ljava/net/SocketAddress;Ljava/lang/Object;"
            + "Lorg/spongepowered/asm/mixin/injection/callback/CallbackInfoReturnable;)V";
    static final String IDENTITY = "link/e4steam/steam/SteamMinecraftIdentity";
    static final String GUARD = "link/e4steam/steam/E4steamGuestGuard";
    static final String GUARD_DESC = "(Ljava/lang/Object;Ljava/net/SocketAddress;Ljava/lang/Object;"
            + "Ljava/lang/Object;JZ)V";
    static final String NOTICE_ENTRY = "META-INF/E4STEAM-UNOFFICIAL-PATCH.txt";

    public static void main(String[] args) throws Exception {
        Path in = Paths.get(args[0]);
        Path out = Paths.get(args[1]);
        Path guardDir = Paths.get(args[2]);
        byte[] notice = Files.readAllBytes(Paths.get(args[3]));

        Map<String, byte[]> additions = new LinkedHashMap<>();
        try (var stream = Files.list(guardDir.resolve("link/e4steam/steam"))) {
            for (Path file : (Iterable<Path>) stream.sorted()::iterator) {
                String name = file.getFileName().toString();
                if (name.startsWith("E4steamGuestGuard") && name.endsWith(".class")) {
                    additions.put("link/e4steam/steam/" + name, Files.readAllBytes(file));
                }
            }
        }
        if (!additions.containsKey(GUARD + ".class")) {
            throw new IllegalStateException("guard class not found in " + guardDir);
        }
        additions.put(NOTICE_ENTRY, notice);

        int copied = 0;
        boolean patched = false;
        try (ZipFile zip = new ZipFile(in.toFile());
             OutputStream raw = Files.newOutputStream(out);
             ZipOutputStream zos = new ZipOutputStream(raw)) {
            for (String added : additions.keySet()) {
                if (zip.getEntry(added) != null) {
                    throw new IllegalStateException("jar already contains " + added + " (already patched?)");
                }
            }
            if (zip.getComment() != null) {
                zos.setComment(zip.getComment());
            }
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                byte[] data;
                try (InputStream input = zip.getInputStream(entry)) {
                    data = input.readAllBytes();
                }
                if (entry.getName().equals(MIXIN)) {
                    data = patchMixin(data);
                    patched = true;
                } else {
                    copied++;
                }
                write(zos, entry, entry.getName(), data);
            }
            if (!patched) {
                throw new IllegalStateException(MIXIN + " not found in " + in);
            }
            for (Map.Entry<String, byte[]> added : additions.entrySet()) {
                write(zos, null, added.getKey(), added.getValue());
            }
        }
        System.out.println("patched " + in.getFileName() + " -> " + out.getFileName()
                + " (" + copied + " entries copied unchanged, 1 class modified, "
                + additions.size() + " entries added)");
    }

    private static void write(ZipOutputStream zos, ZipEntry template, String name, byte[] data) throws Exception {
        ZipEntry entry = new ZipEntry(name);
        int method = template != null && template.getMethod() == ZipEntry.STORED
                ? ZipEntry.STORED : ZipEntry.DEFLATED;
        entry.setMethod(method);
        if (template != null) {
            if (template.getTime() != -1) entry.setTime(template.getTime());
            if (template.getComment() != null) entry.setComment(template.getComment());
        }
        if (method == ZipEntry.STORED) {
            CRC32 crc = new CRC32();
            crc.update(data);
            entry.setCrc(crc.getValue());
            entry.setSize(data.length);
            entry.setCompressedSize(data.length);
        }
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }

    static byte[] patchMixin(byte[] original) throws Exception {
        ClassNode node = new ClassNode();
        new ClassReader(original).accept(node, 0);

        MethodNode target = null;
        for (MethodNode method : node.methods) {
            if (method.name.equals(METHOD) && method.desc.equals(METHOD_DESC)) {
                if (target != null) throw new IllegalStateException("two " + METHOD + " methods");
                target = method;
            }
        }
        if (target == null) {
            throw new IllegalStateException(METHOD + METHOD_DESC + " not found");
        }
        if ((target.access & Opcodes.ACC_STATIC) != 0) {
            throw new IllegalStateException(METHOD + " is static, expected an instance handler");
        }

        // Locate "lload <steamId>; iload <ownerMatch>; invokestatic allowSingleplayerOwnerBypass(JZ)Z".
        int steamIdVar = -1;
        int ownerMatchVar = -1;
        int bypassCalls = 0;
        List<AbstractInsnNode> returns = new ArrayList<>();
        for (AbstractInsnNode insn = target.instructions.getFirst(); insn != null; insn = insn.getNext()) {
            if (insn instanceof MethodInsnNode) {
                MethodInsnNode call = (MethodInsnNode) insn;
                if (call.owner.equals(GUARD)) {
                    throw new IllegalStateException("method already calls the guard");
                }
                if (call.getOpcode() == Opcodes.INVOKESTATIC && call.owner.equals(IDENTITY)
                        && call.name.equals("allowSingleplayerOwnerBypass") && call.desc.equals("(JZ)Z")) {
                    AbstractInsnNode second = previousReal(call);
                    AbstractInsnNode first = previousReal(second);
                    if (!(second instanceof VarInsnNode) || second.getOpcode() != Opcodes.ILOAD
                            || !(first instanceof VarInsnNode) || first.getOpcode() != Opcodes.LLOAD) {
                        throw new IllegalStateException("unexpected arguments for allowSingleplayerOwnerBypass");
                    }
                    steamIdVar = ((VarInsnNode) first).var;
                    ownerMatchVar = ((VarInsnNode) second).var;
                    bypassCalls++;
                }
            }
            if (insn.getOpcode() == Opcodes.RETURN) {
                returns.add(insn);
            } else if (insn.getOpcode() == Opcodes.ATHROW) {
                throw new IllegalStateException("unexpected athrow in " + METHOD);
            }
        }
        if (bypassCalls != 1 || returns.isEmpty()) {
            throw new IllegalStateException("unexpected shape: bypassCalls=" + bypassCalls
                    + " returns=" + returns.size());
        }
        // Both locals must be assigned exactly once, before the bypass call, so they are
        // definitely assigned on every path that reaches a RETURN.
        if (stores(target, Opcodes.LSTORE, steamIdVar) != 1 || stores(target, Opcodes.ISTORE, ownerMatchVar) != 1) {
            throw new IllegalStateException("steamId / ownerMatch locals are not single-assignment");
        }

        for (AbstractInsnNode ret : returns) {
            InsnList call = new InsnList();
            call.add(new VarInsnNode(Opcodes.ALOAD, 0));            // PlayerList (this)
            call.add(new VarInsnNode(Opcodes.ALOAD, 1));            // SocketAddress
            call.add(new VarInsnNode(Opcodes.ALOAD, 2));            // GameProfile / NameAndId
            call.add(new VarInsnNode(Opcodes.ALOAD, 3));            // CallbackInfoReturnable
            call.add(new VarInsnNode(Opcodes.LLOAD, steamIdVar));   // authenticated SteamID
            call.add(new VarInsnNode(Opcodes.ILOAD, ownerMatchVar)); // vanilla owner match
            call.add(new MethodInsnNode(Opcodes.INVOKESTATIC, GUARD, "check", GUARD_DESC, false));
            target.instructions.insertBefore(ret, call);
        }
        target.maxStack = Math.max(target.maxStack, 7);

        ClassWriter writer = new ClassWriter(0); // keep the existing stack map frames
        node.accept(writer);
        byte[] result = writer.toByteArray();

        // Re-read the result as a sanity check; the simulation harness then loads and
        // runs the patched method under the real JVM bytecode verifier.
        ClassNode check = new ClassNode();
        new ClassReader(result).accept(check, 0);
        if (check.methods.size() != node.methods.size()) {
            throw new IllegalStateException("method count changed");
        }
        return result;
    }

    private static AbstractInsnNode previousReal(AbstractInsnNode insn) {
        AbstractInsnNode current = insn.getPrevious();
        while (current != null && current.getOpcode() < 0) {
            current = current.getPrevious();
        }
        return current;
    }

    private static int stores(MethodNode method, int opcode, int var) {
        int count = 0;
        for (AbstractInsnNode insn = method.instructions.getFirst(); insn != null; insn = insn.getNext()) {
            if (insn instanceof VarInsnNode && ((VarInsnNode) insn).var == var) {
                int op = insn.getOpcode();
                boolean isStore = op == Opcodes.ISTORE || op == Opcodes.LSTORE || op == Opcodes.FSTORE
                        || op == Opcodes.DSTORE || op == Opcodes.ASTORE;
                if (isStore) {
                    if (op != opcode) return -1;
                    count++;
                }
            }
        }
        return count;
    }
}
