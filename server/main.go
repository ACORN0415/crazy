package main

import (
	"log"
	"net/http"
	"os"
)

func httpHandler(hub *Hub) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", hub.serveWS)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	return mux
}

func main() {
	if err := validateMaps(); err != nil {
		log.Fatal(err)
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}
	log.Printf("crazy-arcade server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, httpHandler(NewHub())))
}
