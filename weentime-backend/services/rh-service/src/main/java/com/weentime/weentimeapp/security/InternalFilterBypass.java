package com.weentime.weentimeapp.security;

public final class InternalFilterBypass {

    private static final ThreadLocal<Boolean> BYPASS = ThreadLocal.withInitial(() -> false);

    private InternalFilterBypass() {}

    public static void enable() {
        BYPASS.set(true);
    }

    public static void disable() {
        BYPASS.remove();
    }

    public static boolean isActive() {
        return BYPASS.get();
    }
}
