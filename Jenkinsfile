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

        stage('Build & Test - config-server') {
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

        stage('SonarQube Analysis') {
            steps {
                script {
                    def sonarServices = [
                        [dir: 'config-server',            key: 'weentime-config-server',           name: 'Config Server'],
                        [dir: 'discovery',                key: 'weentime-discovery',               name: 'Discovery'],
                        [dir: 'auth-service',             key: 'weentime-auth-service',            name: 'Auth Service'],
                        [dir: 'organisation-service',     key: 'weentime-organisation-service',    name: 'Organisation Service'],
                        [dir: 'rh-service',               key: 'weentime-rh-service',              name: 'RH Service'],
                        [dir: 'presence-service',         key: 'weentime-presence-service',        name: 'Presence Service'],
                        [dir: 'communication-service',    key: 'weentime-communication-service',   name: 'Communication Service'],
                        [dir: 'gateway',                  key: 'weentime-gateway',                 name: 'Gateway']
                    ]
                    for (svc in sonarServices) {
                        withSonarQubeEnv(SONAR_SERVER) {
                            dir("${SERVICES_DIR}\\${svc.dir}") {
                                bat "mvnw.cmd sonar:sonar -Dsonar.projectKey=${svc.key} -Dsonar.projectName=\"${svc.name}\""
                            }
                        }
                        dir("${SERVICES_DIR}\\${svc.dir}") {
                            timeout(time: 10, unit: 'MINUTES') {
                                def qg = waitForQualityGate abortPipeline: false
                                if (qg.status != 'OK') {
                                    error "QUALITY GATE FAILED for ${svc.name}: status=${qg.status}"
                                }
                                echo "Quality Gate OK for ${svc.name}"
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to Nexus') {
            steps {
                script {
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
