package org.spongepowered.asm.mixin.injection.callback;

/** Simulation stand-in recording what the handler decided. */
public class CallbackInfoReturnable<R> {
    private R value;
    public int sets;

    public void setReturnValue(R value) {
        this.value = value;
        this.sets++;
    }

    public R getReturnValue() {
        return value;
    }
}
