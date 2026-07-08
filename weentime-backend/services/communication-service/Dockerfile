# --- Stage 1 : Phase de compilation (Build) ---
FROM eclipse-temurin:17-jdk-jammy AS builder
WORKDIR /app

# Copie du wrapper Maven et du pom.xml pour télécharger les dépendances (mise en cache Docker)
COPY .mvn/ .mvn
COPY mvnw pom.xml ./
RUN ./mvnw dependency:go-offline -B

# Copie des sources et compilation du JAR
COPY src ./src
RUN ./mvnw clean package -DskipTests

# --- Stage 2 : Phase d'exécution (Run) ---
FROM eclipse-temurin:17-jre-jammy
WORKDIR /app

# Récupération du JAR compilé au Stage 1
COPY --from=builder /app/target/*.jar app.jar

# Sécurisation : Exécution sous un utilisateur non-root
RUN useradd -u 1001 -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8194

ENTRYPOINT ["java", "-jar", "app.jar"]
