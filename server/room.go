package main

import (
	"encoding/json"
	"sync"
	"time"
)

const (
	MaxPlayers  = 2
	RoomWaiting = "waiting"
	RoomPlaying = "playing"
)

type RoomPlayer struct {
	client    *Client
	slot      int
	ready     bool
	character string
}

var defaultCharacters = []string{"dao", "bazzi"}

type Room struct {
	hub      *Hub
	id       int
	title    string
	password string

	// guarded by mu
	mu      sync.Mutex
	hostID  string
	players []*RoomPlayer
	mode    string
	mapID   string
	state   string
	game    *Game
}

type RoomSummary struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	Locked  bool   `json:"locked"`
	Players int    `json:"players"`
	Max     int    `json:"max"`
	State   string `json:"state"`
	Mode    string `json:"mode"`
	MapID   string `json:"mapId"`
	Host    string `json:"host"`
}

type RoomPlayerView struct {
	ID        string `json:"id"`
	Nickname  string `json:"nickname"`
	Slot      int    `json:"slot"`
	Ready     bool   `json:"ready"`
	Host      bool   `json:"host"`
	Character string `json:"character"`
}

type RoomView struct {
	ID      int              `json:"id"`
	Title   string           `json:"title"`
	Locked  bool             `json:"locked"`
	HostID  string           `json:"hostId"`
	Mode    string           `json:"mode"`
	MapID   string           `json:"mapId"`
	State   string           `json:"state"`
	Max     int              `json:"max"`
	Players []RoomPlayerView `json:"players"`
}

type ChatMsg struct {
	Scope  string `json:"scope"`
	From   string `json:"from,omitempty"`
	Text   string `json:"text"`
	System bool   `json:"system,omitempty"`
}

type GameOverMsg struct {
	WinnerID   string `json:"winnerId,omitempty"`
	WinnerNick string `json:"winnerNick,omitempty"`
	Reason     string `json:"reason"`
}

func newRoom(h *Hub, id int, title, password string) *Room {
	return &Room{
		hub: h, id: id, title: title, password: password,
		mode:  Modes[0].ID,
		mapID: Maps[0].ID,
		state: RoomWaiting,
	}
}

func (r *Room) summaryLocked() RoomSummary {
	host := ""
	if rp := r.playerLocked(r.hostID); rp != nil {
		host = rp.client.nickname
	}
	return RoomSummary{
		ID: r.id, Title: r.title, Locked: r.password != "", Players: len(r.players), Max: MaxPlayers,
		State: r.state, Mode: r.mode, MapID: r.mapID, Host: host,
	}
}

func (r *Room) viewLocked() RoomView {
	v := RoomView{
		ID: r.id, Title: r.title, Locked: r.password != "", HostID: r.hostID,
		Mode: r.mode, MapID: r.mapID, State: r.state, Max: MaxPlayers, Players: []RoomPlayerView{},
	}
	for _, rp := range r.players {
		v.Players = append(v.Players, RoomPlayerView{
			ID: rp.client.id, Nickname: rp.client.nickname, Slot: rp.slot, Ready: rp.ready, Host: rp.client.id == r.hostID,
			Character: rp.character,
		})
	}
	return v
}

func (r *Room) playerLocked(id string) *RoomPlayer {
	for _, rp := range r.players {
		if rp.client.id == id {
			return rp
		}
	}
	return nil
}

func (r *Room) broadcastLocked(msg []byte) {
	for _, rp := range r.players {
		rp.client.sendRaw(msg)
	}
}

func (r *Room) broadcastStateLocked() { r.broadcastLocked(encode("room", r.viewLocked())) }

func (r *Room) chatLocked(from, text string, system bool) {
	r.broadcastLocked(encode("chat", ChatMsg{Scope: "room", From: from, Text: text, System: system}))
}

func (r *Room) addPlayerLocked(c *Client) {
	used := map[int]bool{}
	for _, rp := range r.players {
		used[rp.slot] = true
	}
	slot := 0
	for used[slot] {
		slot++
	}
	r.players = append(r.players, &RoomPlayer{client: c, slot: slot, character: defaultCharacters[slot%len(defaultCharacters)]})
	if r.hostID == "" {
		r.hostID = c.id
	}
	r.broadcastStateLocked()
	r.chatLocked("", c.nickname+"님이 입장했습니다.", true)
}

func (r *Room) removePlayerLocked(c *Client) {
	for i, rp := range r.players {
		if rp.client == c {
			r.players = append(r.players[:i], r.players[i+1:]...)
			break
		}
	}
	if r.game != nil {
		r.game.Forfeit(c.id)
	}
	if len(r.players) == 0 {
		return
	}
	if r.hostID == c.id {
		r.hostID = r.players[0].client.id
		r.players[0].ready = false
	}
	r.broadcastStateLocked()
	r.chatLocked("", c.nickname+"님이 나갔습니다.", true)
}

// handle processes a room-scoped message. It reports whether the lobby view changed.
func (r *Room) handle(c *Client, env Envelope) (lobbyChanged bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	rp := r.playerLocked(c.id)
	if rp == nil {
		return false
	}
	isHost := r.hostID == c.id

	switch env.Type {
	case "select_mode", "select_map":
		var req struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(env.Data, &req)
		if !isHost || r.state != RoomWaiting {
			return false
		}
		if env.Type == "select_mode" && findMode(req.ID) != nil {
			r.mode = req.ID
		} else if env.Type == "select_map" && findMap(req.ID) != nil {
			r.mapID = req.ID
		} else {
			return false
		}
		r.broadcastStateLocked()
		return true

	case "select_character":
		var req struct {
			ID string `json:"id"`
		}
		_ = json.Unmarshal(env.Data, &req)
		// 준비 완료 상태에서는 캐릭터를 바꿀 수 없다 (방장은 준비 개념이 없음)
		if r.state != RoomWaiting || rp.ready || !validCharacterChoice(req.ID) {
			return false
		}
		rp.character = req.ID
		r.broadcastStateLocked()

	case "ready":
		var req struct {
			Ready bool `json:"ready"`
		}
		_ = json.Unmarshal(env.Data, &req)
		if isHost || r.state != RoomWaiting {
			return false
		}
		rp.ready = req.Ready
		r.broadcastStateLocked()

	case "start":
		if !isHost || r.state != RoomWaiting {
			return false
		}
		if len(r.players) < MaxPlayers {
			c.sendError("상대가 입장해야 시작할 수 있습니다.")
			return false
		}
		for _, o := range r.players {
			if o.client.id != r.hostID && !o.ready {
				c.sendError("상대가 아직 준비하지 않았습니다.")
				return false
			}
		}
		r.startGameLocked()
		return true

	case "input":
		var req struct {
			Dir string `json:"dir"`
		}
		_ = json.Unmarshal(env.Data, &req)
		if r.game != nil {
			r.game.SetInput(c.id, req.Dir)
		}

	case "bubble":
		if r.game != nil {
			r.game.RequestBubble(c.id)
		}

	case "use":
		var req struct {
			Item ItemType `json:"item"`
		}
		_ = json.Unmarshal(env.Data, &req)
		if r.game != nil {
			r.game.RequestUse(c.id, req.Item)
		}
	}
	return false
}

func (r *Room) startGameLocked() {
	var parts []Participant
	type startPlayer struct {
		ID        string `json:"id"`
		Nickname  string `json:"nickname"`
		Slot      int    `json:"slot"`
		Character string `json:"character"`
	}
	for _, rp := range r.players {
		parts = append(parts, Participant{ID: rp.client.id, Nick: rp.client.nickname, Slot: rp.slot, Character: rp.character})
	}
	g := NewGame(findMode(r.mode), findMap(r.mapID), parts, time.Now().UnixNano())
	// "랜덤"은 게임을 만들 때 정해지므로 실제 캐릭터를 알려준다
	var sps []startPlayer
	for _, p := range g.players {
		sps = append(sps, startPlayer{p.ID, p.Nick, p.Slot, p.Character.ID})
	}
	r.game = g
	r.state = RoomPlaying
	r.broadcastLocked(encode("game_start", map[string]any{"mode": r.mode, "mapId": r.mapID, "players": sps}))
	r.broadcastStateLocked()
	go r.runGame(g)
}

func (r *Room) runGame(g *Game) {
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()
	for range ticker.C {
		r.mu.Lock()
		if r.game != g {
			r.mu.Unlock()
			return
		}
		g.Tick(TickDT)
		r.broadcastLocked(encode("state", g.Snapshot()))
		if !g.Over {
			r.mu.Unlock()
			continue
		}
		r.finishGameLocked(g)
		r.mu.Unlock()
		r.hub.broadcastLobby()
		return
	}
}

func (r *Room) finishGameLocked(g *Game) {
	msg := GameOverMsg{Reason: g.Reason, WinnerID: g.WinnerID}
	if p := g.player(g.WinnerID); p != nil {
		msg.WinnerNick = p.Nick
	}
	r.game = nil
	r.state = RoomWaiting
	for _, rp := range r.players {
		rp.ready = false
	}
	r.broadcastLocked(encode("game_over", msg))
	r.broadcastStateLocked()
}
