package com.weentime.communication.config;

import com.weentime.communication.service.RedisRealtimeSubscriber;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "communication.redis", name = "enabled", havingValue = "true")
public class RedisRealtimeConfig {

    private final CommunicationProperties communicationProperties;

    @Bean
    public RedisMessageListenerContainer communicationRedisMessageListenerContainer(
            RedisConnectionFactory redisConnectionFactory,
            RedisRealtimeSubscriber redisRealtimeSubscriber
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisConnectionFactory);
        container.addMessageListener(redisRealtimeSubscriber, new ChannelTopic(communicationProperties.getRedis().getTopic()));
        return container;
    }
}
