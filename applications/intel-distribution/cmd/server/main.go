// SentinelGrid — intel-distribution service.
//
// Publishes actionable threat intelligence to participating organizations over
// a TAXII 2.1-style HTTP API, serving STIX 2.1 indicator bundles. Exposes a
// Prometheus metrics endpoint and health checks. Standard library only so the
// distroless build stays self-contained.
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync/atomic"
	"time"
)

var feedRequests uint64

// STIX 2.1 indicator (minimal subset).
type indicator struct {
	Type        string `json:"type"`
	SpecVersion string `json:"spec_version"`
	ID          string `json:"id"`
	Created     string `json:"created"`
	Name        string `json:"name"`
	Pattern     string `json:"pattern"`
	PatternType string `json:"pattern_type"`
	ValidFrom   string `json:"valid_from"`
}

type bundle struct {
	Type    string      `json:"type"`
	ID      string      `json:"id"`
	Objects []indicator `json:"objects"`
}

func sampleBundle() bundle {
	now := time.Now().UTC().Format(time.RFC3339)
	return bundle{
		Type: "bundle",
		ID:   "bundle--sentinelgrid-feed",
		Objects: []indicator{
			{"indicator", "2.1", "indicator--ip-c2-1", now, "Known C2 node", "[ipv4-addr:value = '198.51.100.23']", "stix", now},
			{"indicator", "2.1", "indicator--ransomware-hash", now, "Ransomware loader hash", "[file:hashes.'SHA-256' = 'a1b2c3d4e5f6...']", "stix", now},
			{"indicator", "2.1", "indicator--phish-domain", now, "Phishing domain", "[domain-name:value = 'login-secure-gov.example']", "stix", now},
		},
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/taxii+json;version=2.1")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	mux := http.NewServeMux()

	// TAXII 2.1 discovery
	mux.HandleFunc("/taxii2/", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"title":       "SentinelGrid Threat Intel",
			"description": "National cyber defense actionable intelligence feed",
			"default":     "/taxii2/api/",
			"api_roots":   []string{"/taxii2/api/"},
		})
	})
	// Collection of indicators
	mux.HandleFunc("/taxii2/api/collections/indicators/objects/", func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddUint64(&feedRequests, 1)
		writeJSON(w, http.StatusOK, sampleBundle())
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.HandleFunc("/metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		fmt.Fprintf(w, "# HELP sg_intel_feed_requests_total Total TAXII feed pulls\n")
		fmt.Fprintf(w, "# TYPE sg_intel_feed_requests_total counter\n")
		fmt.Fprintf(w, "sg_intel_feed_requests_total %d\n", atomic.LoadUint64(&feedRequests))
	})

	addr := ":" + port
	log.Printf("intel-distribution listening on %s (TAXII 2.1 / STIX 2.1)", addr)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
