#!/usr/bin/env bash
# EtymoGraph 모니터링 스택 배포 스크립트
# Prometheus + Grafana + Alertmanager (Telegram 알림)
#
# 사용법:
#   1. cp .env.example .env
#   2. .env 파일에 실제 값 입력
#   3. ./deploy-monitoring.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== EtymoGraph Monitoring Stack 배포 ==="

# ===== .env 파일 로드 =====
if [ ! -f .env ]; then
  echo "Error: .env 파일이 없습니다."
  echo "다음 명령어로 생성하세요: cp .env.example .env"
  exit 1
fi

# .env 파일 로드
set -a
source .env
set +a

# 필수 변수 확인
REQUIRED_VARS="TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID"
for var in $REQUIRED_VARS; do
  if [ -z "${!var}" ]; then
    echo "Error: $var 가 .env 파일에 설정되지 않았습니다."
    exit 1
  fi
done

echo "✓ .env 파일 로드 완료"

# ===== Helm repo 추가 =====
if ! helm repo list | grep -q prometheus-community; then
  echo "Adding prometheus-community Helm repo..."
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
fi
helm repo update

# ===== monitoring 네임스페이스 생성 =====
echo "Creating monitoring namespace..."
kubectl apply -f namespace.yaml

# ===== Alertmanager Config Secret 생성 =====
echo "Creating Alertmanager config secret..."

# Alertmanager config YAML 생성 (Telegram 알림)
ALERTMANAGER_CONFIG=$(cat <<EOF
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'namespace']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'telegram'
  routes:
    - match:
        severity: critical
      receiver: 'telegram'
      group_wait: 10s
      repeat_interval: 1h

receivers:
  - name: 'telegram'
    telegram_configs:
      - bot_token: '${TELEGRAM_BOT_TOKEN}'
        chat_id: ${TELEGRAM_CHAT_ID}
        parse_mode: 'HTML'
        send_resolved: true
        message: |
          {{ if eq .Status "firing" }}🔥{{ else }}✅{{ end }} <b>{{ .Status | toUpper }}</b>

          {{ range .Alerts }}
          <b>{{ .Labels.alertname }}</b>
          Severity: {{ .Labels.severity }}
          {{ if .Annotations.summary }}Summary: {{ .Annotations.summary }}{{ end }}
          {{ if .Annotations.description }}Description: {{ .Annotations.description }}{{ end }}
          {{ end }}

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'namespace']
EOF
)

# Secret 생성 (기존 것 삭제 후 재생성)
kubectl delete secret alertmanager-config -n monitoring --ignore-not-found
kubectl create secret generic alertmanager-config \
  --from-literal=alertmanager.yaml="$ALERTMANAGER_CONFIG" \
  -n monitoring

echo "✓ Alertmanager config secret 생성 완료"

# ===== Helm 옵션 구성 =====
HELM_SET_ARGS=""

# Grafana 비밀번호 설정 (비어있지 않으면)
if [ -n "$GRAFANA_ADMIN_PASSWORD" ]; then
  HELM_SET_ARGS="$HELM_SET_ARGS --set grafana.adminPassword=$GRAFANA_ADMIN_PASSWORD"
fi

# Prometheus retention 설정
if [ -n "$PROMETHEUS_RETENTION" ]; then
  HELM_SET_ARGS="$HELM_SET_ARGS --set prometheus.prometheusSpec.retention=$PROMETHEUS_RETENTION"
fi

# Prometheus storage 설정
if [ -n "$PROMETHEUS_STORAGE_SIZE" ]; then
  HELM_SET_ARGS="$HELM_SET_ARGS --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=$PROMETHEUS_STORAGE_SIZE"
fi

# ===== kube-prometheus-stack 설치/업그레이드 =====
echo "Installing/Upgrading kube-prometheus-stack..."
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values values.yaml \
  $HELM_SET_ARGS \
  --wait \
  --timeout 10m

# ===== ServiceMonitor 적용 =====
echo "Applying ServiceMonitors..."
kubectl apply -f api-servicemonitor.yaml
kubectl apply -f llm-proxy-servicemonitor.yaml

# ===== 커스텀 알림 규칙 적용 =====
echo "Applying custom alert rules..."
kubectl apply -f etymograph-alerts.yaml

# ===== 배포 상태 확인 =====
echo ""
echo "=========================================="
echo "         배포 완료"
echo "=========================================="
echo ""
echo "Pod 상태:"
kubectl get pods -n monitoring
echo ""

# Grafana 비밀번호 출력
echo "=========================================="
echo "         접속 정보"
echo "=========================================="
echo ""
echo "[Grafana]"
echo "  Port-forward: kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring"
echo "  URL: http://localhost:3000"
echo "  Username: admin"
if [ -n "$GRAFANA_ADMIN_PASSWORD" ]; then
  echo "  Password: (설정한 비밀번호)"
else
  echo "  Password: $(kubectl get secret prometheus-grafana -n monitoring -o jsonpath='{.data.admin-password}' | base64 -d)"
fi
echo ""
echo "[Prometheus]"
echo "  Port-forward: kubectl port-forward svc/prometheus-kube-prometheus-prometheus 9090:9090 -n monitoring"
echo "  URL: http://localhost:9090"
echo ""
echo "[Alertmanager]"
echo "  Port-forward: kubectl port-forward svc/prometheus-kube-prometheus-alertmanager 9093:9093 -n monitoring"
echo "  URL: http://localhost:9093"
echo ""
echo "[Telegram 알림]"
echo "  Chat ID: ${TELEGRAM_CHAT_ID}"
echo "  알림 테스트: Alertmanager UI에서 'Send Test Alert' 사용"
echo ""
