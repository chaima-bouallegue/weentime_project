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
                withSonarQubeEnv(SONAR_SERVER) {
                    dir("${SERVICES_DIR}\\config-server") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-config-server -Dsonar.projectName="Config Server"'
                    }
                    dir("${SERVICES_DIR}\\discovery") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-discovery -Dsonar.projectName="Discovery"'
                    }
                    dir("${SERVICES_DIR}\\auth-service") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-auth-service -Dsonar.projectName="Auth Service"'
                    }
                    dir("${SERVICES_DIR}\\organisation-service") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-organisation-service -Dsonar.projectName="Organisation Service"'
                    }
                    dir("${SERVICES_DIR}\\rh-service") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-rh-service -Dsonar.projectName="RH Service"'
                    }
                    dir("${SERVICES_DIR}\\presence-service") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-presence-service -Dsonar.projectName="Presence Service"'
                    }
                    dir("${SERVICES_DIR}\\communication-service") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-communication-service -Dsonar.projectName="Communication Service"'
                    }
                    dir("${SERVICES_DIR}\\gateway") {
                        bat 'mvnw.cmd sonar:sonar -Dsonar.projectKey=weentime-gateway -Dsonar.projectName="Gateway"'
                    }
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
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
