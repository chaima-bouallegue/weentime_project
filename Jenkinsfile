pipeline {
    agent any

    tools {
        maven 'Maven 3.x'
        jdk 'JDK 17'
    }

    environment {
        SONAR_SERVER = 'sonar-server'
        SERVICES_DIR = 'weentime-backend\\services'
        MAVEN_OPTS = '-Xms128m -Xmx512m'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Determine Changes') {
            steps {
                script {
                    def forceAll = false
                    try {
                        for (changeSet in currentBuild.changeSets) {
                            for (entry in changeSet.entries) {
                                for (path in entry.affectedPaths) {
                                    def normPath = path.replace('\\', '/')
                                    if (normPath.contains("weentime-backend/services/config-server/") || 
                                        normPath.contains("weentime-backend/services/discovery/")) {
                                        forceAll = true
                                    }
                                }
                            }
                        }
                    } catch (Exception e) {
                        echo "Erreur lors de la détection des changements : ${e.message}. Forçage du build complet."
                        forceAll = true
                    }
                    env.FORCE_ALL_BUILD = forceAll ? "true" : "false"
                    echo "FORCE_ALL_BUILD = ${env.FORCE_ALL_BUILD}"
                }
            }
        }

        stage('Setup Settings') {
            steps {
                bat '''
                if not exist "C:\\Windows\\System32\\config\\systemprofile\\.m2" mkdir "C:\\Windows\\System32\\config\\systemprofile\\.m2"
                if exist "C:\\Users\\HP\\.m2\\settings.xml" (
                    copy /Y "C:\\Users\\HP\\.m2\\settings.xml" "C:\\Windows\\System32\\config\\systemprofile\\.m2\\settings.xml"
                ) else (
                    echo "Local settings.xml not found!"
                )
                '''
            }
        }

        stage('Build & Test - Parallel') {
            parallel {
                stage('Build & Test - config-server') {
                    when {
                        changeset "weentime-backend/services/config-server/**"
                    }
                    steps {
                        dir("${SERVICES_DIR}\\config-server") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/config-server/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - discovery') {
                    when {
                        changeset "weentime-backend/services/discovery/**"
                    }
                    steps {
                        dir("${SERVICES_DIR}\\discovery") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/discovery/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - auth-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/auth-service/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\auth-service") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/auth-service/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - organisation-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/organisation-service/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\organisation-service") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/organisation-service/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - rh-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/rh-service/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\rh-service") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/rh-service/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - presence-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/presence-service/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\presence-service") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/presence-service/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - communication-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/communication-service/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\communication-service") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/communication-service/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - gateway') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "weentime-backend/services/gateway/**"
                        }
                    }
                    steps {
                        dir("${SERVICES_DIR}\\gateway") {
                            bat 'mvnw.cmd clean test jacoco:report'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "${SERVICES_DIR}/gateway/target/surefire-reports/*.xml"
                        }
                    }
                }
                stage('Build & Test - ai-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "ai-service/**"
                        }
                    }
                    steps {
                        dir("ai-service") {
                            bat '''
                            if exist venv\\Scripts\\activate.bat (
                                call venv\\Scripts\\activate.bat
                                pytest --cov --cov-report=xml --junitxml=test-results.xml
                            ) else (
                                pytest --cov --cov-report=xml --junitxml=test-results.xml
                            )
                            '''
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "ai-service/test-results.xml"
                        }
                    }
                }
                stage('Build & Test - ml-service') {
                    when {
                        anyOf {
                            expression { env.FORCE_ALL_BUILD == 'true' }
                            changeset "ml-service/**"
                        }
                    }
                    steps {
                        dir("ml-service") {
                            bat '''
                            if exist .venv\\Scripts\\activate.bat (
                                call .venv\\Scripts\\activate.bat
                                pytest --cov --cov-report=xml --junitxml=test-results.xml
                            ) else (
                                pytest --cov --cov-report=xml --junitxml=test-results.xml
                            )
                            '''
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: "ml-service/test-results.xml"
                        }
                    }
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    def sonarServices = [
                        [dir: "weentime-backend\\services\\config-server",            key: 'weentime-config-server',           name: 'Config Server', isMaven: true],
                        [dir: "weentime-backend\\services\\discovery",                key: 'weentime-discovery',               name: 'Discovery', isMaven: true],
                        [dir: "weentime-backend\\services\\auth-service",             key: 'weentime-auth-service',            name: 'Auth Service', isMaven: true],
                        [dir: "weentime-backend\\services\\organisation-service",     key: 'weentime-organisation-service',    name: 'Organisation Service', isMaven: true],
                        [dir: "weentime-backend\\services\\rh-service",               key: 'weentime-rh-service',              name: 'RH Service', isMaven: true],
                        [dir: "weentime-backend\\services\\presence-service",         key: 'weentime-presence-service',        name: 'Presence Service', isMaven: true],
                        [dir: "weentime-backend\\services\\communication-service",    key: 'weentime-communication-service',   name: 'Communication Service', isMaven: true],
                        [dir: "weentime-backend\\services\\gateway",                  key: 'weentime-gateway',                 name: 'Gateway', isMaven: true]
                        // TODO: sonar-scanner is not globally available on PATH on this Jenkins agent.
                        // Reactivate ai-service and ml-service once sonar-scanner is installed.
                        // [dir: 'ai-service',                                            key: 'weentime-ai-service',              name: 'AI Service', isMaven: false],
                        // [dir: 'ml-service',                                            key: 'weentime-ml-service',              name: 'ML Service', isMaven: false]
                    ]
                    for (svc in sonarServices) {
                        withSonarQubeEnv(SONAR_SERVER) {
                            dir(svc.dir) {
                                if (svc.isMaven) {
                                    bat "mvnw.cmd sonar:sonar -Dsonar.projectKey=${svc.key} -Dsonar.projectName=\"${svc.name}\""
                                } else {
                                    bat "sonar-scanner -Dsonar.projectKey=${svc.key} -Dsonar.projectName=\"${svc.name}\" -Dsonar.sources=. -Dsonar.python.coverage.reportPaths=coverage.xml"
                                }
                            }
                        }
                        dir(svc.dir) {
                            timeout(time: 5, unit: 'MINUTES') {
                                def qg = waitForQualityGate abortPipeline: false
                                if (qg.status != 'OK') {
                                    error "QUALITY GATE FAILED for ${svc.name}: status=${qg.status}"
                                } else {
                                    echo "Quality Gate OK for ${svc.name}"
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to Nexus') {
            steps {
                script {
                    // TODO: ai-service and ml-service are excluded from Nexus deployment because they are Python/FastAPI services.
                    // Python packages are typically published to PyPI or a private devpi/Nexus PyPI repository, not Maven.
                    def services = [
                        'config-server',
                        'discovery',
                        'auth-service',
                        'organisation-service',
                        'rh-service',
                        'presence-service',
                        'communication-service',
                        'gateway'
                    ]
                    for (svc in services) {
                        dir("${SERVICES_DIR}\\${svc}") {
                            bat 'mvnw.cmd deploy -DskipTests'
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'Pipeline DevOps execute avec succes !'
        }
        failure {
            echo 'Echec du pipeline DevOps. Verifiez les logs.'
        }
        always {
            cleanWs()
        }
    }
}
