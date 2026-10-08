package main

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type testConn struct {
	t    *testing.T
	conn *websocket.Conn
}

func dial(t *testing.T, srv *httptest.Server, nick string) *testConn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	tc := &testConn{t, conn}
	tc.send("hello", map[string]string{"nickname": nick})
	tc.expect("welcome")
	return tc
}

func (tc *testConn) send(typ string, data any) {
	b, _ := json.Marshal(map[string]any{"type": typ, "data": data})
	if err := tc.conn.WriteMessage(websocket.TextMessage, b); err != nil {
		tc.t.Fatal(err)
	}
}

// expect reads messages until one of the given type arrives and returns its data.
func (tc *testConn) expect(typ string) json.RawMessage {
	tc.t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		_ = tc.conn.SetReadDeadline(deadline)
		_, b, err := tc.conn.ReadMessage()
		if err != nil {
			tc.t.Fatalf("waiting for %s: %v", typ, err)
		}
		var env Envelope
		_ = json.Unmarshal(b, &env)
		if env.Type == typ {
			return env.Data
		}
	}
}

func (tc *testConn) expectError(contains string) {
	tc.t.Helper()
	var e struct{ Message string }
	_ = json.Unmarshal(tc.expect("error"), &e)
	if !strings.Contains(e.Message, contains) {
		tc.t.Fatalf("want error containing %q, got %q", contains, e.Message)
	}
}

func TestRoomLifecycle(t *testing.T) {
	hub := NewHub()
	srv := httptest.NewServer(httpHandler(hub))
	defer srv.Close()

	a := dial(t, srv, "alice")
	b := dial(t, srv, "bob")
	c := dial(t, srv, "carol")

	dup, _, _ := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", nil)
	dc := &testConn{t, dup}
	dc.send("hello", map[string]string{"nickname": "ALICE"})
	dc.expectError("이미 사용 중")

	a.send("create_room", map[string]string{"title": "한판", "password": "1234"})
	var room RoomView
	_ = json.Unmarshal(a.expect("room"), &room)
	if room.ID != 1 || !room.Locked || room.HostID == "" {
		t.Fatalf("unexpected room: %+v", room)
	}

	b.send("join_room", map[string]any{"roomId": 1, "password": "0000"})
	b.expectError("비밀번호")
	b.send("join_room", map[string]any{"roomId": 1, "password": "1234"})
	b.expect("room")

	c.send("join_room", map[string]any{"roomId": 1, "password": "1234"})
	c.expectError("가득")

	// guest not ready → host can't start
	a.send("start", nil)
	a.expectError("준비")
	a.send("select_map", map[string]string{"id": "pirate"})
	b.send("select_character", map[string]string{"id": "kephi"})
	b.send("ready", map[string]bool{"ready": true})
	for {
		var rv RoomView
		_ = json.Unmarshal(a.expect("room"), &rv)
		if len(rv.Players) == 2 && rv.Players[1].Ready && rv.Players[1].Character == "kephi" && rv.MapID == "pirate" {
			break
		}
	}
	a.send("start", nil)
	var gs struct {
		MapID   string `json:"mapId"`
		Players []struct {
			Character string `json:"character"`
		} `json:"players"`
	}
	_ = json.Unmarshal(b.expect("game_start"), &gs)
	if gs.MapID != "pirate" || gs.Players[0].Character != "dao" || gs.Players[1].Character != "kephi" {
		t.Fatalf("selection not applied: %+v", gs)
	}
	b.expect("state")

	// b leaves mid-game → a wins by forfeit
	b.send("leave_room", nil)
	b.expect("left_room")
	var over GameOverMsg
	_ = json.Unmarshal(a.expect("game_over"), &over)
	if over.Reason != "leave" || over.WinnerNick != "alice" {
		t.Fatalf("unexpected game over: %+v", over)
	}

	// last player leaves → room destroyed
	a.send("leave_room", nil)
	a.expect("left_room")
	time.Sleep(50 * time.Millisecond)
	hub.mu.Lock()
	n := len(hub.rooms)
	hub.mu.Unlock()
	if n != 0 {
		t.Fatalf("room should be destroyed, %d left", n)
	}
}
