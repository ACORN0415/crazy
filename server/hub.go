package main

import (
	"encoding/json"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"
)

const (
	maxNickname = 12
	maxTitle    = 20
	maxPassword = 16
	maxChat     = 100
)

// Hub owns the connected users and the room list. Lock order: Hub.mu before Room.mu.
type Hub struct {
	mu      sync.Mutex
	clients map[string]*Client
	rooms   map[int]*Room
}

func NewHub() *Hub {
	return &Hub{clients: map[string]*Client{}, rooms: map[int]*Room{}}
}

type Meta struct {
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	Modes      []*ModeDef      `json:"modes"`
	Maps       []*MapDef       `json:"maps"`
	Items      []ItemDef       `json:"items"`
	Characters []*CharacterDef `json:"characters"`
}

type UserView struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	RoomID   int    `json:"roomId,omitempty"`
}

type LobbyView struct {
	Rooms []RoomSummary `json:"rooms"`
	Users []UserView    `json:"users"`
}

func cleanText(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		s = string([]rune(s)[:max])
	}
	return s
}

func (h *Hub) handle(c *Client, env Envelope) {
	h.mu.Lock()
	registered := c.nickname != ""
	h.mu.Unlock()
	if !registered && env.Type != "hello" {
		c.sendError("먼저 닉네임을 입력해주세요.")
		return
	}
	switch env.Type {
	case "hello":
		h.onHello(c, env.Data)
	case "create_room":
		h.onCreateRoom(c, env.Data)
	case "join_room":
		h.onJoinRoom(c, env.Data)
	case "leave_room":
		h.mu.Lock()
		h.leaveRoomLocked(c)
		h.mu.Unlock()
		h.broadcastLobby()
	case "chat":
		h.onChat(c, env.Data)
	default:
		h.mu.Lock()
		r := c.room
		h.mu.Unlock()
		if r != nil && r.handle(c, env) {
			h.broadcastLobby()
		}
	}
}

func (h *Hub) onHello(c *Client, raw json.RawMessage) {
	var req struct {
		Nickname string `json:"nickname"`
	}
	_ = json.Unmarshal(raw, &req)
	nick := strings.TrimSpace(req.Nickname)
	if nick == "" || utf8.RuneCountInString(nick) > maxNickname {
		c.sendError("닉네임은 1~12자로 입력해주세요.")
		return
	}
	h.mu.Lock()
	if c.nickname != "" {
		h.mu.Unlock()
		return
	}
	for _, o := range h.clients {
		if strings.EqualFold(o.nickname, nick) {
			h.mu.Unlock()
			c.sendError("이미 사용 중인 닉네임입니다.")
			return
		}
	}
	c.nickname = nick
	h.clients[c.id] = c
	h.mu.Unlock()

	c.sendMsg("welcome", map[string]any{
		"id":       c.id,
		"nickname": nick,
		"meta":     Meta{Width: MapW, Height: MapH, Modes: Modes, Maps: Maps, Items: ItemDefs, Characters: Characters},
	})
	h.broadcastLobby()
}

func (h *Hub) onCreateRoom(c *Client, raw json.RawMessage) {
	var req struct {
		Title    string `json:"title"`
		Password string `json:"password"`
	}
	_ = json.Unmarshal(raw, &req)
	title := cleanText(req.Title, maxTitle)
	if title == "" {
		title = c.nickname + "님의 방"
	}
	if utf8.RuneCountInString(req.Password) > maxPassword {
		c.sendError("비밀번호는 16자 이하로 입력해주세요.")
		return
	}

	h.mu.Lock()
	if c.room != nil {
		h.mu.Unlock()
		c.sendError("이미 방에 들어가 있습니다.")
		return
	}
	id := 1
	for h.rooms[id] != nil {
		id++
	}
	r := newRoom(h, id, title, req.Password)
	h.rooms[id] = r
	r.mu.Lock()
	r.addPlayerLocked(c)
	r.mu.Unlock()
	c.room = r
	h.mu.Unlock()
	h.broadcastLobby()
}

func (h *Hub) onJoinRoom(c *Client, raw json.RawMessage) {
	var req struct {
		RoomID   int    `json:"roomId"`
		Password string `json:"password"`
	}
	_ = json.Unmarshal(raw, &req)

	h.mu.Lock()
	if c.room != nil {
		h.mu.Unlock()
		c.sendError("이미 방에 들어가 있습니다.")
		return
	}
	r := h.rooms[req.RoomID]
	if r == nil {
		h.mu.Unlock()
		c.sendError("존재하지 않는 방입니다.")
		return
	}
	r.mu.Lock()
	var errMsg string
	switch {
	case r.state == RoomPlaying:
		errMsg = "게임이 진행 중인 방입니다."
	case len(r.players) >= MaxPlayers:
		errMsg = "방이 가득 찼습니다."
	case r.password != "" && r.password != req.Password:
		errMsg = "비밀번호가 틀렸습니다."
	default:
		r.addPlayerLocked(c)
		c.room = r
	}
	r.mu.Unlock()
	h.mu.Unlock()
	if errMsg != "" {
		c.sendError(errMsg)
		return
	}
	h.broadcastLobby()
}

// leaveRoomLocked removes c from its room. The room is destroyed when the last player leaves.
func (h *Hub) leaveRoomLocked(c *Client) {
	r := c.room
	if r == nil {
		return
	}
	c.room = nil
	r.mu.Lock()
	r.removePlayerLocked(c)
	empty := len(r.players) == 0
	r.mu.Unlock()
	if empty {
		delete(h.rooms, r.id)
	}
	c.sendMsg("left_room", nil)
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	if c.nickname == "" {
		h.mu.Unlock()
		return
	}
	h.leaveRoomLocked(c)
	delete(h.clients, c.id)
	h.mu.Unlock()
	h.broadcastLobby()
}

func (h *Hub) onChat(c *Client, raw json.RawMessage) {
	var req struct {
		Text string `json:"text"`
	}
	_ = json.Unmarshal(raw, &req)
	text := cleanText(req.Text, maxChat)
	if text == "" {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if r := c.room; r != nil {
		r.mu.Lock()
		r.chatLocked(c.nickname, text, false)
		r.mu.Unlock()
		return
	}
	msg := encode("chat", ChatMsg{Scope: "lobby", From: c.nickname, Text: text})
	for _, o := range h.clients {
		if o.room == nil {
			o.sendRaw(msg)
		}
	}
}

func (h *Hub) broadcastLobby() {
	h.mu.Lock()
	defer h.mu.Unlock()
	view := LobbyView{Rooms: []RoomSummary{}, Users: []UserView{}}
	for _, r := range h.rooms {
		r.mu.Lock()
		view.Rooms = append(view.Rooms, r.summaryLocked())
		r.mu.Unlock()
	}
	sort.Slice(view.Rooms, func(i, j int) bool { return view.Rooms[i].ID < view.Rooms[j].ID })
	for _, c := range h.clients {
		u := UserView{ID: c.id, Nickname: c.nickname}
		if c.room != nil {
			u.RoomID = c.room.id
		}
		view.Users = append(view.Users, u)
	}
	sort.Slice(view.Users, func(i, j int) bool { return view.Users[i].Nickname < view.Users[j].Nickname })
	msg := encode("lobby", view)
	for _, c := range h.clients {
		c.sendRaw(msg)
	}
}
