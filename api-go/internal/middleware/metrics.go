package middleware

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// HTTP 요청 총 수
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "endpoint", "status"},
	)

	// HTTP 요청 처리 시간 (히스토그램)
	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		},
		[]string{"method", "endpoint"},
	)

	// 현재 처리 중인 HTTP 요청 수
	httpRequestsInFlight = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "Number of HTTP requests currently being processed",
		},
	)

	// 단어 검색 요청 수
	wordSearchTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "word_search_total",
			Help: "Total number of word search requests",
		},
		[]string{"cache_hit", "language"},
	)

	// LLM 프록시 호출 수
	llmProxyCallsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "llm_proxy_calls_total",
			Help: "Total number of LLM proxy calls",
		},
		[]string{"status"},
	)

	// LLM 프록시 응답 시간
	llmProxyDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "llm_proxy_duration_seconds",
			Help:    "LLM proxy call duration in seconds",
			Buckets: []float64{0.5, 1, 2, 5, 10, 20, 30, 60},
		},
	)
)

// MetricsMiddleware는 HTTP 요청에 대한 Prometheus 메트릭을 수집합니다.
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 요청 시작 시간
		start := time.Now()

		// 처리 중인 요청 수 증가
		httpRequestsInFlight.Inc()

		// 엔드포인트 패턴 추출 (동적 파라미터 정규화)
		endpoint := normalizeEndpoint(c.FullPath())
		if endpoint == "" {
			endpoint = "unknown"
		}

		// 요청 처리
		c.Next()

		// 처리 중인 요청 수 감소
		httpRequestsInFlight.Dec()

		// 메트릭 기록
		duration := time.Since(start).Seconds()
		status := strconv.Itoa(c.Writer.Status())

		httpRequestsTotal.WithLabelValues(c.Request.Method, endpoint, status).Inc()
		httpRequestDuration.WithLabelValues(c.Request.Method, endpoint).Observe(duration)
	}
}

// normalizeEndpoint는 동적 URL 파라미터를 정규화합니다.
// 예: /api/words/teacher/etymology -> /api/words/:word/etymology
func normalizeEndpoint(path string) string {
	if path == "" {
		return ""
	}
	return path
}

// RecordWordSearch는 단어 검색 메트릭을 기록합니다.
func RecordWordSearch(cacheHit bool, language string) {
	hit := "false"
	if cacheHit {
		hit = "true"
	}
	wordSearchTotal.WithLabelValues(hit, language).Inc()
}

// RecordLLMProxyCall은 LLM 프록시 호출 메트릭을 기록합니다.
func RecordLLMProxyCall(success bool, duration time.Duration) {
	status := "success"
	if !success {
		status = "error"
	}
	llmProxyCallsTotal.WithLabelValues(status).Inc()
	llmProxyDuration.Observe(duration.Seconds())
}
