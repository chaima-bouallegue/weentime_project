package com.weentime.communication.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "communication")
public class CommunicationProperties {

    private String internalApiKey = "communication-service-local";
    private final WebSocket websocket = new WebSocket();
    private final Redis redis = new Redis();
    private final Outbox outbox = new Outbox();
    private final Replay replay = new Replay();

    public String getInternalApiKey() {
        return internalApiKey;
    }

    public void setInternalApiKey(String internalApiKey) {
        this.internalApiKey = internalApiKey;
    }

    public WebSocket getWebsocket() {
        return websocket;
    }

    public Redis getRedis() {
        return redis;
    }

    public Outbox getOutbox() {
        return outbox;
    }

    public Replay getReplay() {
        return replay;
    }

    public static class WebSocket {
        private String broker = "simple";
        private long typingThrottleMs = 1000L;
        private final Relay relay = new Relay();

        public String getBroker() {
            return broker;
        }

        public void setBroker(String broker) {
            this.broker = broker;
        }

        public long getTypingThrottleMs() {
            return typingThrottleMs;
        }

        public void setTypingThrottleMs(long typingThrottleMs) {
            this.typingThrottleMs = typingThrottleMs;
        }

        public Relay getRelay() {
            return relay;
        }
    }

    public static class Relay {
        private String host = "localhost";
        private int port = 61613;
        private String clientLogin = "guest";
        private String clientPasscode = "guest";
        private String systemLogin = "guest";
        private String systemPasscode = "guest";

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public int getPort() {
            return port;
        }

        public void setPort(int port) {
            this.port = port;
        }

        public String getClientLogin() {
            return clientLogin;
        }

        public void setClientLogin(String clientLogin) {
            this.clientLogin = clientLogin;
        }

        public String getClientPasscode() {
            return clientPasscode;
        }

        public void setClientPasscode(String clientPasscode) {
            this.clientPasscode = clientPasscode;
        }

        public String getSystemLogin() {
            return systemLogin;
        }

        public void setSystemLogin(String systemLogin) {
            this.systemLogin = systemLogin;
        }

        public String getSystemPasscode() {
            return systemPasscode;
        }

        public void setSystemPasscode(String systemPasscode) {
            this.systemPasscode = systemPasscode;
        }
    }

    public static class Redis {
        private boolean enabled;
        private String topic = "communication.realtime";

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public String getTopic() {
            return topic;
        }

        public void setTopic(String topic) {
            this.topic = topic;
        }
    }

    public static class Outbox {
        private long dispatchDelayMs = 5000L;
        private int batchSize = 50;
        private int maxAttempts = 5;
        private long retryBackoffMs = 10000L;

        public long getDispatchDelayMs() {
            return dispatchDelayMs;
        }

        public void setDispatchDelayMs(long dispatchDelayMs) {
            this.dispatchDelayMs = dispatchDelayMs;
        }

        public int getBatchSize() {
            return batchSize;
        }

        public void setBatchSize(int batchSize) {
            this.batchSize = batchSize;
        }

        public int getMaxAttempts() {
            return maxAttempts;
        }

        public void setMaxAttempts(int maxAttempts) {
            this.maxAttempts = maxAttempts;
        }

        public long getRetryBackoffMs() {
            return retryBackoffMs;
        }

        public void setRetryBackoffMs(long retryBackoffMs) {
            this.retryBackoffMs = retryBackoffMs;
        }
    }

    public static class Replay {
        private int maxEvents = 200;
        private int retentionDays = 7;

        public int getMaxEvents() {
            return maxEvents;
        }

        public void setMaxEvents(int maxEvents) {
            this.maxEvents = maxEvents;
        }

        public int getRetentionDays() {
            return retentionDays;
        }

        public void setRetentionDays(int retentionDays) {
            this.retentionDays = retentionDays;
        }
    }
}
