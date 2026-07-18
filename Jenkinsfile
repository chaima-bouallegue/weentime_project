pipeline {
    agent any

    triggers {
        githubPush()
    }

    tools {
        maven 'Maven 3.x'
        jdk 'JDK 17'
    }

    environment {
        SONAR_SERVER = 'sonar-server'
        SERVICES_DIR = 'weentime-backend\\services'
        DOCKERHUB_USER = 'chaimablg'
        MAVEN_OPTS = '-Xmx256m -XX:MaxMetaspaceSize=256m'
        JAVA_TOOL_OPTIONS = '-Xmx256m -XX:MaxMetaspaceSize=256m'
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
                    def totalItems = 0
                    if (currentBuild.changeSets != null) {
                        for (cs in currentBuild.changeSets) {
                            if (cs != null && cs.items != null) {
                                totalItems += cs.items.length
                            }
                        }
                    }
                    if (totalItems == 0) {
                        forceAll = true
                    }
                    def hasChanges = { pattern ->
                        if (currentBuild.changeSets == null) return false
                        for (changeSet in currentBuild.changeSets) {
                            if (changeSet == null || changeSet.items == null) continue
                            for (entry in changeSet.items) {
                                if (entry == null || entry.affectedPaths == null) continue
                                for (path in entry.affectedPaths) {
                                    if (path) {
                                        def normPath = path.replace('\\', '/')
                                        if (normPath.contains(pattern)) {
                                            return true
                                        }
                                    }
                                }
                            }
                        }
                        return false
                    }

                    if (hasChanges("weentime-backend/services/config-server/") || 
                        hasChanges("weentime-backend/services/discovery/")) {
                        forceAll = true
                    }

                    env.FORCE_ALL_BUILD = forceAll ? "true" : "false"

                    env.CHANGED_SERVICES = ''
                    if (!forceAll) {
                        def changedSvcs = []
                        for (cs in currentBuild.changeSets) {
                            if (cs == null || cs.items == null) continue
                            for (entry in cs.items) {
                                if (entry == null || entry.affectedPaths == null) continue
                                for (path in entry.affectedPaths) {
                                    if (path) {
                                        def norm = path.replace('\\', '/')
                                        if (norm.startsWith('weentime-backend/services/')) {
                                            def svcName = norm.substring('weentime-backend/services/'.length()).split('/')[0]
                                            changedSvcs.add(svcName)
                                        }
                                    }
                                }
                            }
                        }
                        env.CHANGED_SERVICES = changedSvcs.unique().join(',')
                    }

                    env.BUILD_CONFIG_SERVER = (forceAll || hasChanges("weentime-backend/services/config-server/")).toString()
                    env.BUILD_DISCOVERY = (forceAll || hasChanges("weentime-backend/services/discovery/")).toString()
                    env.BUILD_AUTH_SERVICE = (forceAll || hasChanges("weentime-backend/services/auth-service/")).toString()
                    env.BUILD_ORGANISATION_SERVICE = (forceAll || hasChanges("weentime-backend/services/organisation-service/")).toString()
                    env.BUILD_RH_SERVICE = (forceAll || hasChanges("weentime-backend/services/rh-service/")).toString()
                    env.BUILD_PRESENCE_SERVICE = (forceAll || hasChanges("weentime-backend/services/presence-service/")).toString()
                    env.BUILD_COMMUNICATION_SERVICE = (forceAll || hasChanges("weentime-backend/services/communication-service/")).toString()
                    env.BUILD_GATEWAY = (forceAll || hasChanges("weentime-backend/services/gateway/")).toString()
                    // TODO: Réintégrer ai-service et ml-service une fois le pipeline Java stabilisé.
                    // Retirés le 2026-07-10 car scikit-learn==1.4.2 incompatible avec Python 3.13
                    // sur l'agent Jenkins (voir historique Git pour le code original).
                    // env.BUILD_AI_SERVICE = (forceAll || hasChanges("ai-service/")).toString()
                    // env.BUILD_ML_SERVICE = (forceAll || hasChanges("ml-service/")).toString()

                    echo "FORCE_ALL_BUILD = ${env.FORCE_ALL_BUILD}"
                    echo "BUILD_CONFIG_SERVER = ${env.BUILD_CONFIG_SERVER}"
                    echo "BUILD_DISCOVERY = ${env.BUILD_DISCOVERY}"
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

        stage('Build & Test - Group 1 (Infrastructure)') {
            parallel {
                stage('Build & Test - config-server') {
                    when {
                        expression { env.BUILD_CONFIG_SERVER == 'true' }
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
                        expression { env.BUILD_DISCOVERY == 'true' }
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
                stage('Build & Test - gateway') {
                    when {
                        expression { env.BUILD_GATEWAY == 'true' }
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
            }
        }

        stage('Build & Test - Group 2 (Core Business)') {
            parallel {
                stage('Build & Test - auth-service') {
                    when {
                        expression { env.BUILD_AUTH_SERVICE == 'true' }
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
                        expression { env.BUILD_ORGANISATION_SERVICE == 'true' }
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
                        expression { env.BUILD_RH_SERVICE == 'true' }
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
            }
        }

        stage('Build & Test - Group 3 (Secondary)') {
            parallel {
                stage('Build & Test - presence-service') {
                    when {
                        expression { env.BUILD_PRESENCE_SERVICE == 'true' }
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
                        expression { env.BUILD_COMMUNICATION_SERVICE == 'true' }
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
                // TODO: Réintégrer ai-service et ml-service une fois le pipeline Java stabilisé.
                // Retirés le 2026-07-10 car scikit-learn==1.4.2 incompatible avec Python 3.13
                // sur l'agent Jenkins (voir historique Git pour le code original des stages).
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    bat 'del /s /q report-task.txt 2>nul || exit 0'
                    def sonarServices = [
                        [dir: "weentime-backend\\services\\config-server",            key: 'weentime-config-server',           name: 'Config Server', isMaven: true, flag: 'BUILD_CONFIG_SERVER'],
                        [dir: "weentime-backend\\services\\discovery",                key: 'weentime-discovery',               name: 'Discovery', isMaven: true, flag: 'BUILD_DISCOVERY'],
                        [dir: "weentime-backend\\services\\auth-service",             key: 'weentime-auth-service',            name: 'Auth Service', isMaven: true, flag: 'BUILD_AUTH_SERVICE'],
                        [dir: "weentime-backend\\services\\organisation-service",     key: 'weentime-organisation-service',    name: 'Organisation Service', isMaven: true, flag: 'BUILD_ORGANISATION_SERVICE'],
                        [dir: "weentime-backend\\services\\rh-service",               key: 'weentime-rh-service',              name: 'RH Service', isMaven: true, flag: 'BUILD_RH_SERVICE'],
                        [dir: "weentime-backend\\services\\presence-service",         key: 'weentime-presence-service',        name: 'Presence Service', isMaven: true, flag: 'BUILD_PRESENCE_SERVICE'],
                        [dir: "weentime-backend\\services\\communication-service",    key: 'weentime-communication-service',   name: 'Communication Service', isMaven: true, flag: 'BUILD_COMMUNICATION_SERVICE'],
                        [dir: "weentime-backend\\services\\gateway",                  key: 'weentime-gateway',                 name: 'Gateway', isMaven: true, flag: 'BUILD_GATEWAY']
                        // TODO: Réintégrer ai-service et ml-service une fois le pipeline Java stabilisé
                        // et sonar-scanner installé sur l'agent Jenkins.
                    ]
                    for (svc in sonarServices) {
                        if (env.FORCE_ALL_BUILD == 'true' || (env.CHANGED_SERVICES ?: '').split(',').contains(svc.dir.tokenize('\\/').last())) {
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
                                bat 'del /s /q report-task.txt 2>nul || exit 0'
                            }
                        } else {
                            echo "Skipping SonarQube Analysis for ${svc.name} — no changes detected"
                        }
                    }
                }
            }
        }

        stage('Build & Push Docker Images') {
            steps {
                script {
                    def dockerServices = [
                        'config-server',
                        'discovery',
                        'auth-service',
                        'organisation-service',
                        'rh-service',
                        'presence-service',
                        'communication-service',
                        'gateway'
                    ]
                    def servicesToBuild = []
                    if (env.FORCE_ALL_BUILD == 'true') {
                        servicesToBuild = dockerServices
                    } else {
                        def changed = (env.CHANGED_SERVICES ?: '').split(',').findAll { it }
                        for (svc in dockerServices) {
                            if (changed.contains(svc)) {
                                servicesToBuild.add(svc)
                            }
                        }
                    }

                    if (servicesToBuild.isEmpty()) {
                        echo 'No Java service changes — skipping Docker build'
                        return
                    }

                    def sha = bat(script: '@echo off\ngit rev-parse --short HEAD', returnStdout: true).trim()

                    withCredentials([usernamePassword(
                        credentialsId: 'dockerHub',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        try {
                            bat 'echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin'

                            for (svc in servicesToBuild) {
                                dir("${SERVICES_DIR}\\${svc}") {
                                    bat "docker build -t ${DOCKER_USER}/weentime-${svc}:${sha} -t ${DOCKER_USER}/weentime-${svc}:latest ."
                                    bat "docker push ${DOCKER_USER}/weentime-${svc}:${sha}"
                                    bat "docker push ${DOCKER_USER}/weentime-${svc}:latest"
                                }
                            }
                        } finally {
                            bat 'docker logout'
                        }
                    }
                }
            }
        }

        stage('Deploy to Nexus') {
            steps {
                script {
                    // TODO: ai-service et ml-service exclus — services Python/FastAPI (non déployables via Maven)
                    // et temporairement retirés du pipeline (scikit-learn==1.4.2 incompatible Python 3.13).
                    def services = [
                        [dir: 'config-server', flag: 'BUILD_CONFIG_SERVER'],
                        [dir: 'discovery', flag: 'BUILD_DISCOVERY'],
                        [dir: 'auth-service', flag: 'BUILD_AUTH_SERVICE'],
                        [dir: 'organisation-service', flag: 'BUILD_ORGANISATION_SERVICE'],
                        [dir: 'rh-service', flag: 'BUILD_RH_SERVICE'],
                        [dir: 'presence-service', flag: 'BUILD_PRESENCE_SERVICE'],
                        [dir: 'communication-service', flag: 'BUILD_COMMUNICATION_SERVICE'],
                        [dir: 'gateway', flag: 'BUILD_GATEWAY']
                    ]
                    for (svc in services) {
                        if (env.getProperty(svc.flag) == 'true') {
                            dir("${SERVICES_DIR}\\${svc.dir}") {
                                bat 'mvnw.cmd deploy -DskipTests'
                            }
                        } else {
                            echo "Skipping Nexus deployment for ${svc.dir} because it was not built."
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
            emailext (
                subject: "❌ Pipeline BACKEND échoué : ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """
                    Le build BACKEND a échoué.
                    
                    Job : ${env.JOB_NAME}
                    Build : #${env.BUILD_NUMBER}
                    Branche : ${env.GIT_BRANCH}
                    
                    Voir les logs complets : ${env.BUILD_URL}console
                """,
                to: "chaimabouallegue17@gmail.com"
            )
        }
        always {
            cleanWs()
        }
    }
}
