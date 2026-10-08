package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 50 * time.Second
	maxMsgSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 16384,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Envelope struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

func encode(typ string, data any) []byte {
	b, err := json.Marshal(struct {
		Type string `json:"type"`
		Data any    `json:"data,omitempty"`
	}{typ, data})
	if err != nil {
		log.Printf("encode %s: %v", typ, err)
	}
	return b
}

type Client struct {
	id       string
	nickname string // set once on hello; guarded by Hub.mu
	room     *Room  // guarded by Hub.mu

	conn      *websocket.Conn
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
}

func newID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// sendRaw queues a message without blocking; if the client is too slow the message is dropped.
func (c *Client) sendRaw(b []byte) {
	select {
	case <-c.done:
		return
	default:
	}
	select {
	case c.send <- b:
	default:
	}
}

func (c *Client) sendMsg(typ string, data any) { c.sendRaw(encode(typ, data)) }

func (c *Client) sendError(msg string) { c.sendMsg("error", map[string]string{"message": msg}) }

func (c *Client) close() { c.closeOnce.Do(func() { close(c.done) }) }

func (h *Hub) serveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}
	c := &Client{id: newID(), conn: conn, send: make(chan []byte, 256), done: make(chan struct{})}
	go c.writePump()
	c.readPump(h)
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregister(c)
		c.close()
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMsgSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		var env Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			continue
		}
		h.handle(c, env)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case <-c.done:
			return
		case msg := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
