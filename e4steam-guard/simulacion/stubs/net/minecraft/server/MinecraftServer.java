package net.minecraft.server;

import com.mojang.authlib.GameProfile;

/** Simulation stand-in: like vanilla, the integrated-server owner is recognised by NAME only. */
public class MinecraftServer {
    public String ownerName;

    private boolean matches(String name) {
        return ownerName != null && name != null && name.equalsIgnoreCase(ownerName);
    }

    public boolean isSingleplayerOwner(GameProfile profile) {
        return matches(profile.getName());
    }

    public boolean isSingleplayerOwner(sim.NameAndId profile) {
        return matches(profile.name());
    }

    public boolean method_19466(GameProfile profile) {
        return matches(profile.getName());
    }

    public boolean m_7779_(GameProfile profile) {
        return matches(profile.getName());
    }
}
