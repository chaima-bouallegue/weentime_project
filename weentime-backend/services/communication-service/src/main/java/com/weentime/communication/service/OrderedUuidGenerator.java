package com.weentime.communication.service;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.UUID;

@Component
public class OrderedUuidGenerator {

    private final SecureRandom random = new SecureRandom();
    private long lastTimestamp = -1L;
    private int sequence;

    public synchronized UUID next() {
        long timestamp = System.currentTimeMillis();
        if (timestamp == lastTimestamp) {
            sequence = (sequence + 1) & 0x0FFF;
        } else {
            lastTimestamp = timestamp;
            sequence = random.nextInt(0x1000);
        }

        long msb = ((timestamp & 0xFFFFFFFFFFFFL) << 16)
                | 0x7000L
                | (sequence & 0x0FFFL);

        long lsb = random.nextLong();
        lsb &= 0x3FFFFFFFFFFFFFFFL;
        lsb |= 0x8000000000000000L;
        return new UUID(msb, lsb);
    }
}
