package main

import (
	"math"
	"math/rand"
)

const (
	MapW     = 15
	MapH     = 13
	TickRate = 30
	TickDT   = 1.0 / TickRate

	CountdownTime       = 3.0
	TimeLimit           = 180.0
	BubbleFuse          = 2.8
	FlameTime           = 0.5
	TrapTime            = 5.0
	InvulnAfterDismount = 1.2
	InvulnAfterNeedle   = 1.0
	ShieldTime          = 3.0
	CurseTime           = 10.0
	PushDelay           = 0.3
	KickSpeed           = 9.0
	JumpTime            = 0.35
	AutoBubbleInterval  = 0.7

	// 물풍선을 설치한 순간 이 거리 안에 있던 플레이어는 그 물풍선을 통과해서 빠져나갈 수 있다.
	overlapDist = 0.8
	// 갇힌 플레이어에게 상대가 이 거리 안으로 닿으면 물방울이 터진다.
	touchDist = 0.7
)

type Tile byte

const (
	TileEmpty Tile = '.'
	TileWall  Tile = '#'
	TileBlock Tile = 'x'
	TilePush  Tile = 'o'
	TileBush  Tile = '~'
	TileThorn Tile = 'T' // 가시 바닥: 지나갈 수 있고, 물풍선이 그 위에 놓이거나 굴러오면 바로 터진다
)

const (
	StateAlive   = "alive"
	StateTrapped = "trapped"
	StateDead    = "dead"
)

const (
	CurseReverse    = "reverse"
	CurseSlow       = "slow"
	CurseAutoBubble = "autobubble"
	CurseNoBubble   = "nobubble"
)

var curses = []string{CurseReverse, CurseSlow, CurseAutoBubble, CurseNoBubble}

type dirVec struct{ dx, dy int }

var dirs = map[string]dirVec{
	"up":    {0, -1},
	"down":  {0, 1},
	"left":  {-1, 0},
	"right": {1, 0},
}

var reverseDir = map[string]string{"up": "down", "down": "up", "left": "right", "right": "left"}

type Player struct {
	ID        string
	Nick      string
	Slot      int
	Character *CharacterDef

	X, Y   float64 // 중심 좌표 (타일 단위)
	Face   string
	Moving bool

	inputDir   string
	wantBubble bool
	wantUse    ItemType

	Bubbles int
	Range   int
	Speed   int
	Kick    bool
	Mount   ItemType
	Inv     map[ItemType]int

	State  string
	trapT  float64
	invulT float64
	shield float64
	Curse  string
	curseT float64
	autoT  float64
	jumpT  float64
	pushT  float64
}

func (p *Player) cell() (int, int) {
	return int(math.Floor(p.X)), int(math.Floor(p.Y))
}

func (p *Player) speed() float64 {
	if p.State == StateTrapped {
		return 0.6
	}
	if p.Curse == CurseSlow {
		return 1.3
	}
	switch p.Mount {
	case ItemTurtle:
		return 2.0
	case ItemOwl:
		return 4.2
	case ItemPirateTurtle:
		return 5.8
	case ItemUFO:
		return 6.6
	}
	// 속도 4 ≈ 2.6칸/초, 속도 10 ≈ 5.1칸/초
	return 0.9 + 0.42*float64(p.Speed)
}

type Bubble struct {
	ID       int
	Owner    *Player
	CX, CY   int
	Off      float64 // 차여서 이동 중일 때 다음 칸까지의 진행도 (0~1)
	Fuse     float64
	Range    int
	moving   bool
	mdx, mdy int
	passable map[string]bool
	exploded bool
}

type Flame struct {
	TTL  float64
	Age  float64
	Kind byte // 'c' 중심, 'u'/'d'/'l'/'r' 줄기 방향, 대문자는 줄기 끝
}

var flameDir = map[dirVec]byte{{0, -1}: 'u', {0, 1}: 'd', {-1, 0}: 'l', {1, 0}: 'r'}

type Event struct {
	Type   string   `json:"type"`
	X      int      `json:"x"`
	Y      int      `json:"y"`
	Player string   `json:"player,omitempty"`
	Item   ItemType `json:"item,omitempty"`
}

type Participant struct {
	ID        string
	Nick      string
	Slot      int
	Character string // 캐릭터 ID 또는 "random"
}

type Game struct {
	Mode *ModeDef
	Map  *MapDef

	tiles  [MapH][MapW]Tile
	hidden [MapH][MapW]ItemType
	items  [MapH][MapW]ItemType
	flames [MapH][MapW]Flame

	players      []*Player
	bubbles      []*Bubble
	nextBubbleID int

	countdown float64
	elapsed   float64
	events    []Event
	rng       *rand.Rand

	Over     bool
	WinnerID string
	Reason   string // knockout, draw, timeout, leave
}

func NewGame(mode *ModeDef, m *MapDef, parts []Participant, seed int64) *Game {
	g := &Game{Mode: mode, Map: m, countdown: CountdownTime, rng: rand.New(rand.NewSource(seed))}
	spawns := map[int][2]int{}
	for y, row := range m.Rows {
		for x := 0; x < MapW; x++ {
			ch := row[x]
			switch ch {
			case '1', '2':
				spawns[int(ch-'1')] = [2]int{x, y}
				g.tiles[y][x] = TileEmpty
			case '%':
				g.tiles[y][x] = TileWall
			default:
				g.tiles[y][x] = Tile(ch)
			}
			if (g.tiles[y][x] == TileBlock || g.tiles[y][x] == TilePush) && g.rng.Float64() < mode.DropChance {
				g.hidden[y][x] = g.randomItem()
			}
		}
	}
	for y, row := range m.Items {
		for x := 0; x < MapW; x++ {
			if it, ok := mapItemChars[row[x]]; ok {
				g.items[y][x] = it
			}
		}
	}
	for _, pt := range parts {
		sp := spawns[pt.Slot]
		ch := resolveCharacter(pt.Character, g.rng)
		p := &Player{
			ID: pt.ID, Nick: pt.Nick, Slot: pt.Slot, Character: ch,
			X: float64(sp[0]) + 0.5, Y: float64(sp[1]) + 0.5,
			Face: "down", State: StateAlive,
			Bubbles: ch.Bubbles.Start, Range: ch.Range.Start, Speed: ch.Speed.Start,
			Inv: map[ItemType]int{},
		}
		if mode.StartMax {
			p.Bubbles, p.Range, p.Speed = ch.Bubbles.Max, ch.Range.Max, ch.Speed.Max
		}
		for it, n := range mode.StartItems {
			p.Inv[it] = n
		}
		g.players = append(g.players, p)
	}
	return g
}

func (g *Game) randomItem() ItemType {
	total := 0
	// 맵 순회 순서와 무관하게 같은 시드면 같은 결과가 나오도록 ItemDefs 순서로 누적한다.
	for _, d := range ItemDefs {
		total += g.Mode.Weights[d.Type]
	}
	if total == 0 {
		return ItemNone
	}
	r := g.rng.Intn(total)
	for _, d := range ItemDefs {
		w := g.Mode.Weights[d.Type]
		if r < w {
			return d.Type
		}
		r -= w
	}
	return ItemNone
}

func (g *Game) player(id string) *Player {
	for _, p := range g.players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

// SetInput records the direction a player is holding.
func (g *Game) SetInput(id, dir string) {
	if p := g.player(id); p != nil {
		if _, ok := dirs[dir]; ok || dir == "" {
			p.inputDir = dir
		}
	}
}

func (g *Game) RequestBubble(id string) {
	if p := g.player(id); p != nil {
		p.wantBubble = true
	}
}

func (g *Game) RequestUse(id string, it ItemType) {
	if p := g.player(id); p != nil {
		p.wantUse = it
	}
}

// Forfeit ends the game with the given player losing (e.g. they left the room).
func (g *Game) Forfeit(id string) {
	if g.Over {
		return
	}
	for _, p := range g.players {
		if p.ID == id {
			p.State = StateDead
		}
	}
	g.Over = true
	g.Reason = "leave"
	for _, p := range g.players {
		if p.ID != id {
			g.WinnerID = p.ID
		}
	}
}

func (g *Game) Tick(dt float64) {
	g.events = g.events[:0]
	if g.Over {
		return
	}
	if g.countdown > 0 {
		g.countdown = math.Max(0, g.countdown-dt)
		return
	}
	g.elapsed += dt
	for _, p := range g.players {
		g.updateTimers(p, dt)
	}
	for _, p := range g.players {
		g.handleActions(p)
	}
	for _, p := range g.players {
		g.movePlayer(p, dt)
	}
	g.updatePassable()
	g.updateBubbles(dt)
	g.updateFlames(dt)
	g.checkHits()
	g.checkTouches()
	g.pickups()
	g.checkEnd()
}

func (g *Game) updateTimers(p *Player, dt float64) {
	if p.State == StateDead {
		return
	}
	p.invulT = math.Max(0, p.invulT-dt)
	p.shield = math.Max(0, p.shield-dt)
	p.jumpT = math.Max(0, p.jumpT-dt)
	if p.Curse != "" {
		p.curseT -= dt
		if p.curseT <= 0 {
			p.Curse = ""
		} else if p.Curse == CurseAutoBubble && p.State == StateAlive {
			p.autoT -= dt
			if p.autoT <= 0 {
				p.wantBubble = true
				p.autoT = AutoBubbleInterval
			}
		}
	}
	if p.State == StateTrapped {
		p.trapT -= dt
		if p.trapT <= 0 {
			g.kill(p)
		}
	}
}

func (g *Game) handleActions(p *Player) {
	defer func() { p.wantBubble, p.wantUse = false, ItemNone }()
	if p.State == StateDead {
		return
	}
	if p.wantBubble && p.State == StateAlive && p.Curse != CurseNoBubble && p.jumpT == 0 {
		g.placeBubble(p)
	}
	if p.wantUse != ItemNone {
		g.useItem(p, p.wantUse)
	}
}

func (g *Game) placeBubble(p *Player) {
	cx, cy := p.cell()
	if t := g.tiles[cy][cx]; t != TileEmpty && t != TileBush && t != TileThorn {
		return
	}
	if g.bubbleAt(cx, cy) != nil {
		return
	}
	owned := 0
	for _, b := range g.bubbles {
		if b.Owner == p {
			owned++
		}
	}
	if owned >= p.Bubbles {
		return
	}
	g.nextBubbleID++
	b := &Bubble{ID: g.nextBubbleID, Owner: p, CX: cx, CY: cy, Fuse: BubbleFuse, Range: p.Range, passable: map[string]bool{}}
	for _, q := range g.players {
		if q.State != StateDead && g.overlapsCell(q, cx, cy) {
			b.passable[q.ID] = true
		}
	}
	g.bubbles = append(g.bubbles, b)
	g.events = append(g.events, Event{Type: "place", X: cx, Y: cy, Player: p.ID})
}

func (g *Game) useItem(p *Player, it ItemType) {
	if !g.Mode.Consumables || p.Inv[it] <= 0 {
		return
	}
	cx, cy := p.cell()
	used := false
	switch it {
	case ItemNeedle:
		if p.State == StateTrapped {
			p.State = StateAlive
			p.invulT = InvulnAfterNeedle
			used = true
		}
	case ItemShield:
		if p.State == StateAlive {
			p.shield = ShieldTime
			used = true
		}
	case ItemDart:
		if p.State == StateAlive {
			d := dirs[p.Face]
			for i := 1; i <= MapW; i++ {
				x, y := cx+d.dx*i, cy+d.dy*i
				if !inBounds(x, y) || g.tiles[y][x] == TileWall || g.tiles[y][x] == TileBlock || g.tiles[y][x] == TilePush {
					break
				}
				if b := g.bubbleAt(x, y); b != nil {
					g.explode(b)
					break
				}
			}
			used = true
		}
	case ItemSpring:
		if p.State == StateAlive && p.jumpT == 0 {
			d := dirs[p.Face]
			x, y := cx+d.dx*2, cy+d.dy*2
			if inBounds(x, y) && (g.tiles[y][x] == TileEmpty || g.tiles[y][x] == TileBush || g.tiles[y][x] == TileThorn) && g.bubbleAt(x, y) == nil {
				p.X, p.Y = float64(x)+0.5, float64(y)+0.5
				p.jumpT = JumpTime
				used = true
			}
		}
	}
	if used {
		p.Inv[it]--
		g.events = append(g.events, Event{Type: "use", X: cx, Y: cy, Player: p.ID, Item: it})
	}
}

func (g *Game) movePlayer(p *Player, dt float64) {
	p.Moving = false
	if p.State == StateDead || p.jumpT > 0 {
		return
	}
	dir := p.inputDir
	if dir != "" && p.Curse == CurseReverse {
		dir = reverseDir[dir]
	}
	d, ok := dirs[dir]
	if !ok {
		p.pushT = 0
		return
	}
	p.Face = dir
	if p.Kick && p.State == StateAlive {
		g.kickOverlapping(p, d)
	}
	ox, oy := p.X, p.Y
	blocked, bx, by := g.moveAlong(p, d.dx, d.dy, p.speed()*dt)
	p.Moving = p.X != ox || p.Y != oy

	if !blocked || p.State != StateAlive {
		p.pushT = 0
		return
	}
	if g.tiles[by][bx] == TilePush {
		p.pushT += dt
		if p.pushT >= PushDelay {
			g.tryPush(bx, by, d.dx, d.dy)
			p.pushT = 0
		}
	} else {
		p.pushT = 0
	}
	if b := g.bubbleAt(bx, by); b != nil && p.Kick && !b.moving {
		b.moving, b.mdx, b.mdy = true, d.dx, d.dy
		b.passable = map[string]bool{}
		g.events = append(g.events, Event{Type: "kick", X: bx, Y: by, Player: p.ID})
	}
}

// moveAlong moves p up to s tiles in direction (dx, dy). The player always
// travels along lane centers; when turning mid-cell it first slides onto the
// nearest lane, and when that lane is blocked it slides onto the neighbouring
// lane if that one is open (corner assist). It reports the blocking cell when
// the player ends up pressed against an obstacle, for kick/push handling.
func (g *Game) moveAlong(p *Player, dx, dy int, s float64) (blocked bool, bx, by int) {
	horiz := dx != 0
	a, b, d := &p.Y, &p.X, dy
	if horiz {
		a, b, d = &p.X, &p.Y, dx
	}
	cellOf := func(ai, bi int) (int, int) {
		if horiz {
			return ai, bi
		}
		return bi, ai
	}
	free := func(ai, bi int) bool {
		x, y := cellOf(ai, bi)
		return g.passableFor(p, x, y)
	}

	ai, bi := int(math.Floor(*a)), int(math.Floor(*b))
	lane := float64(bi) + 0.5
	off := *b - lane
	if math.Abs(off) > 1e-9 {
		sg := math.Copysign(1, off)
		if !free(ai+d, bi) {
			bj := bi + int(sg)
			if free(ai, bj) && free(ai+d, bj) {
				*b += sg * math.Min(s, 1-math.Abs(off))
			}
			return false, 0, 0
		}
		step := math.Min(s, math.Abs(off))
		*b -= sg * step
		s -= step
		if math.Abs(*b-lane) < 1e-9 {
			*b = lane
		}
		if s <= 1e-9 {
			return false, 0, 0
		}
	}

	if free(ai+d, bi) {
		*a += float64(d) * s
		return false, 0, 0
	}
	center := float64(ai) + 0.5
	if dist := (center - *a) * float64(d); dist > 0 {
		*a += float64(d) * math.Min(s, dist)
		if dist > s {
			return false, 0, 0
		}
	}
	x, y := cellOf(ai+d, bi)
	if !inBounds(x, y) {
		return false, 0, 0
	}
	return true, x, y
}

// kickOverlapping은 신발을 가진 플레이어가 아직 몸이 겹쳐 있는(통과 가능한) 물풍선 쪽으로
// 움직일 때 통과하지 않고 바로 차게 한다. 원작처럼 물풍선 쪽으로 걸으면 즉시 밀린다.
func (g *Game) kickOverlapping(p *Player, d dirVec) {
	for _, b := range g.bubbles {
		if b.moving || b.exploded || !b.passable[p.ID] {
			continue
		}
		bx, by := float64(b.CX)+0.5, float64(b.CY)+0.5
		ahead := (bx-p.X)*float64(d.dx) + (by-p.Y)*float64(d.dy) // 진행 방향으로 물풍선까지 거리
		side := math.Abs((bx-p.X)*float64(d.dy)) + math.Abs((by-p.Y)*float64(d.dx))
		// 물풍선 중심이 앞쪽에 있고 같은 줄에 있을 때만 (막 놓고 떠나는 중이면 뒤쪽이라 차지 않음)
		if ahead <= 0.1 || ahead >= 1 || side >= 0.5 {
			continue
		}
		nx, ny := b.CX+d.dx, b.CY+d.dy
		if !g.bubbleCanEnter(nx, ny) {
			// 찰 수 없는 곳이면 그냥 막힌 물풍선으로 만든다
			delete(b.passable, p.ID)
			continue
		}
		b.moving, b.mdx, b.mdy = true, d.dx, d.dy
		b.passable = map[string]bool{}
		g.events = append(g.events, Event{Type: "kick", X: b.CX, Y: b.CY, Player: p.ID})
	}
}

func (g *Game) tryPush(bx, by, dx, dy int) {
	nx, ny := bx+dx, by+dy
	if !inBounds(nx, ny) || g.tiles[ny][nx] != TileEmpty || g.bubbleAt(nx, ny) != nil ||
		g.items[ny][nx] != ItemNone || g.flames[ny][nx].TTL > 0 {
		return
	}
	for _, q := range g.players {
		if q.State != StateDead && math.Abs(q.X-(float64(nx)+0.5)) < 0.95 && math.Abs(q.Y-(float64(ny)+0.5)) < 0.95 {
			return
		}
	}
	g.tiles[ny][nx], g.tiles[by][bx] = TilePush, TileEmpty
	g.hidden[ny][nx], g.hidden[by][bx] = g.hidden[by][bx], ItemNone
	g.events = append(g.events, Event{Type: "push", X: nx, Y: ny})
}

func (g *Game) passableFor(p *Player, x, y int) bool {
	if !inBounds(x, y) {
		return false
	}
	if t := g.tiles[y][x]; t != TileEmpty && t != TileBush && t != TileThorn {
		return false
	}
	if b := g.bubbleAt(x, y); b != nil && !b.passable[p.ID] {
		return false
	}
	return true
}

func (g *Game) overlapsCell(p *Player, x, y int) bool {
	return math.Abs(p.X-(float64(x)+0.5)) < overlapDist && math.Abs(p.Y-(float64(y)+0.5)) < overlapDist
}

func (g *Game) updatePassable() {
	for _, b := range g.bubbles {
		for id := range b.passable {
			if p := g.player(id); p == nil || p.State == StateDead || !g.overlapsCell(p, b.CX, b.CY) {
				delete(b.passable, id)
			}
		}
	}
}

func (g *Game) bubbleAt(x, y int) *Bubble {
	for _, b := range g.bubbles {
		if b.CX == x && b.CY == y && !b.exploded {
			return b
		}
	}
	return nil
}

func (g *Game) bubbleCanEnter(x, y int) bool {
	if !inBounds(x, y) {
		return false
	}
	if t := g.tiles[y][x]; t != TileEmpty && t != TileBush && t != TileThorn {
		return false
	}
	if g.bubbleAt(x, y) != nil {
		return false
	}
	for _, p := range g.players {
		if px, py := p.cell(); p.State != StateDead && px == x && py == y {
			return false
		}
	}
	return true
}

func (g *Game) updateBubbles(dt float64) {
	for _, b := range append([]*Bubble(nil), g.bubbles...) {
		if b.exploded {
			continue
		}
		if b.moving {
			g.moveBubble(b, dt)
		}
		b.Fuse -= dt
		if b.Fuse <= 0 || g.flames[b.CY][b.CX].TTL > 0 || g.thornAt(b.CX, b.CY) {
			g.explode(b)
		}
	}
}

func (g *Game) moveBubble(b *Bubble, dt float64) {
	nx, ny := b.CX+b.mdx, b.CY+b.mdy
	if !g.bubbleCanEnter(nx, ny) {
		b.moving, b.Off = false, 0
		return
	}
	b.Off += KickSpeed * dt
	for b.Off >= 1 {
		b.Off--
		b.CX, b.CY = nx, ny
		for _, p := range g.players {
			if p.State != StateDead && g.overlapsCell(p, nx, ny) {
				b.passable[p.ID] = true
			}
		}
		if g.thornAt(b.CX, b.CY) {
			// 가시 칸에 굴러 들어오면 멈추고 updateBubbles에서 바로 터진다
			b.moving, b.Off = false, 0
			return
		}
		nx, ny = b.CX+b.mdx, b.CY+b.mdy
		if !g.bubbleCanEnter(nx, ny) {
			b.moving, b.Off = false, 0
			return
		}
	}
}

func (g *Game) thornAt(x, y int) bool {
	return inBounds(x, y) && g.tiles[y][x] == TileThorn
}

type reveal struct {
	x, y int
	it   ItemType
}

func (g *Game) explode(first *Bubble) {
	first.exploded = true
	queue := []*Bubble{first}
	var reveals []reveal
	for len(queue) > 0 {
		b := queue[0]
		queue = queue[1:]
		g.removeBubble(b)
		g.events = append(g.events, Event{Type: "explode", X: b.CX, Y: b.CY, Player: b.Owner.ID})
		g.setFlame(b.CX, b.CY, 'c')
		for _, d := range dirs {
			kind := flameDir[d]
			lastX, lastY := -1, -1
			for i := 1; i <= b.Range; i++ {
				x, y := b.CX+d.dx*i, b.CY+d.dy*i
				if !inBounds(x, y) || g.tiles[y][x] == TileWall {
					break
				}
				if t := g.tiles[y][x]; t == TileBlock || t == TilePush {
					g.tiles[y][x] = TileEmpty
					g.setFlame(x, y, kind)
					lastX, lastY = x, y
					if it := g.hidden[y][x]; it != ItemNone {
						reveals = append(reveals, reveal{x, y, it})
						g.hidden[y][x] = ItemNone
					}
					g.events = append(g.events, Event{Type: "break", X: x, Y: y})
					break
				}
				g.setFlame(x, y, kind)
				lastX, lastY = x, y
				if ob := g.bubbleAt(x, y); ob != nil {
					ob.exploded = true
					queue = append(queue, ob)
					break
				}
			}
			// 줄기의 마지막 칸은 끝 모양으로 그린다
			if lastX >= 0 && g.flames[lastY][lastX].Kind == kind {
				g.flames[lastY][lastX].Kind = kind - 'a' + 'A'
			}
		}
	}
	// 부서진 블록에서 나온 아이템은 같은 폭발에 휩쓸리지 않는다.
	for _, r := range reveals {
		g.items[r.y][r.x] = r.it
	}
}

func (g *Game) setFlame(x, y int, kind byte) {
	f := &g.flames[y][x]
	if f.TTL <= 0 || kind == 'c' {
		f.Kind = kind
		f.Age = 0
	}
	f.TTL = FlameTime
	g.items[y][x] = ItemNone
}

func (g *Game) removeBubble(b *Bubble) {
	for i, o := range g.bubbles {
		if o == b {
			g.bubbles = append(g.bubbles[:i], g.bubbles[i+1:]...)
			return
		}
	}
}

func (g *Game) updateFlames(dt float64) {
	for y := range g.flames {
		for x := range g.flames[y] {
			if g.flames[y][x].TTL > 0 {
				g.flames[y][x].TTL -= dt
				g.flames[y][x].Age += dt
			}
		}
	}
}

func (g *Game) checkHits() {
	for _, p := range g.players {
		if p.State != StateAlive || p.jumpT > 0 || p.shield > 0 || p.invulT > 0 {
			continue
		}
		cx, cy := p.cell()
		if g.flames[cy][cx].TTL <= 0 {
			continue
		}
		if p.Mount != ItemNone {
			p.Mount = ItemNone
			p.invulT = InvulnAfterDismount
			g.events = append(g.events, Event{Type: "dismount", X: cx, Y: cy, Player: p.ID})
			continue
		}
		p.State = StateTrapped
		p.trapT = TrapTime
		p.pushT = 0
		g.events = append(g.events, Event{Type: "trap", X: cx, Y: cy, Player: p.ID})
	}
}

func (g *Game) checkTouches() {
	for _, t := range g.players {
		if t.State != StateTrapped {
			continue
		}
		for _, a := range g.players {
			if a == t || a.State != StateAlive || a.jumpT > 0 {
				continue
			}
			if math.Abs(a.X-t.X) < touchDist && math.Abs(a.Y-t.Y) < touchDist {
				g.kill(t)
				break
			}
		}
	}
}

func (g *Game) kill(p *Player) {
	p.State = StateDead
	p.Moving = false
	cx, cy := p.cell()
	g.events = append(g.events, Event{Type: "pop", X: cx, Y: cy, Player: p.ID})
}

func (g *Game) pickups() {
	for _, p := range g.players {
		if p.State != StateAlive || p.jumpT > 0 {
			continue
		}
		cx, cy := p.cell()
		it := g.items[cy][cx]
		if it == ItemNone {
			continue
		}
		g.items[cy][cx] = ItemNone
		g.applyItem(p, it)
		g.events = append(g.events, Event{Type: "pickup", X: cx, Y: cy, Player: p.ID, Item: it})
	}
}

func (g *Game) applyItem(p *Player, it ItemType) {
	switch it {
	case ItemBubble:
		p.Bubbles = min(p.Bubbles+1, p.Character.Bubbles.Max)
	case ItemPotion:
		p.Range = min(p.Range+1, p.Character.Range.Max)
	case ItemRoller:
		p.Speed = min(p.Speed+1, p.Character.Speed.Max)
	case ItemUltra:
		p.Range = p.Character.Range.Max
	case ItemRedDevil:
		p.Speed = p.Character.Speed.Max
	case ItemDevil:
		p.Curse = curses[g.rng.Intn(len(curses))]
		p.curseT = CurseTime
		p.autoT = 0
	case ItemKick:
		p.Kick = true
	case ItemTurtle, ItemPirateTurtle, ItemOwl, ItemUFO:
		if p.Mount == ItemNone {
			p.Mount = it
		}
	default:
		if itemCategory(it) == CatConsumable {
			p.Inv[it] = min(p.Inv[it]+1, MaxInventory)
		}
	}
}

func (g *Game) checkEnd() {
	var alive []*Player
	for _, p := range g.players {
		if p.State != StateDead {
			alive = append(alive, p)
		}
	}
	switch {
	case len(alive) == 0:
		g.Over, g.Reason = true, "draw"
	case len(alive) == 1 && len(g.players) > 1:
		g.Over, g.Reason, g.WinnerID = true, "knockout", alive[0].ID
	case g.elapsed >= TimeLimit:
		g.Over, g.Reason = true, "timeout"
	}
}

func inBounds(x, y int) bool {
	return x >= 0 && y >= 0 && x < MapW && y < MapH
}

// ---- snapshot sent to clients every tick ----

type PlayerSnap struct {
	ID        string           `json:"id"`
	Character string           `json:"character"`
	Slot      int              `json:"slot"`
	X         float64          `json:"x"`
	Y         float64          `json:"y"`
	Face      string           `json:"face"`
	Moving    bool             `json:"moving"`
	State     string           `json:"state"`
	Bubbles   int              `json:"bubbles"`
	Range     int              `json:"range"`
	Speed     int              `json:"speed"`
	Kick      bool             `json:"kick"`
	Mount     ItemType         `json:"mount,omitempty"`
	Shield    bool             `json:"shield,omitempty"`
	Invuln    bool             `json:"invuln,omitempty"`
	Curse     string           `json:"curse,omitempty"`
	Trap      float64          `json:"trap,omitempty"`
	Jump      float64          `json:"jump,omitempty"`
	Inv       map[ItemType]int `json:"inv,omitempty"`
}

type BubbleSnap struct {
	ID    int     `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Owner string  `json:"owner"`
	Fuse  float64 `json:"fuse"`
}

type FlameSnap struct {
	X    int     `json:"x"`
	Y    int     `json:"y"`
	Kind string  `json:"k"`
	Age  float64 `json:"a"` // 물줄기가 생긴 뒤 지난 시간 (애니메이션용)
}

type ItemSnap struct {
	X    int      `json:"x"`
	Y    int      `json:"y"`
	Type ItemType `json:"type"`
}

type Snapshot struct {
	Countdown float64      `json:"cd"`
	TimeLeft  float64      `json:"left"`
	Tiles     string       `json:"tiles"`
	Players   []PlayerSnap `json:"players"`
	Bubbles   []BubbleSnap `json:"bubbles"`
	Flames    []FlameSnap  `json:"flames"`
	Items     []ItemSnap   `json:"items"`
	Events    []Event      `json:"events"`
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }

func (g *Game) Snapshot() Snapshot {
	s := Snapshot{
		Countdown: round2(g.countdown),
		TimeLeft:  round2(math.Max(0, TimeLimit-g.elapsed)),
		Players:   []PlayerSnap{},
		Bubbles:   []BubbleSnap{},
		Flames:    []FlameSnap{},
		Items:     []ItemSnap{},
		Events:    append([]Event{}, g.events...),
	}
	tiles := make([]byte, 0, MapW*MapH)
	for y := 0; y < MapH; y++ {
		for x := 0; x < MapW; x++ {
			tiles = append(tiles, byte(g.tiles[y][x]))
			if f := g.flames[y][x]; f.TTL > 0 {
				s.Flames = append(s.Flames, FlameSnap{x, y, string(f.Kind), round2(f.Age)})
			}
			if it := g.items[y][x]; it != ItemNone {
				s.Items = append(s.Items, ItemSnap{x, y, it})
			}
		}
	}
	s.Tiles = string(tiles)
	for _, p := range g.players {
		trap := 0.0
		if p.State == StateTrapped {
			trap = round2(math.Max(0, p.trapT))
		}
		inv := map[ItemType]int{}
		for k, v := range p.Inv {
			if v > 0 {
				inv[k] = v
			}
		}
		s.Players = append(s.Players, PlayerSnap{
			ID: p.ID, Character: p.Character.ID, Slot: p.Slot, X: round2(p.X), Y: round2(p.Y), Face: p.Face, Moving: p.Moving,
			State: p.State, Bubbles: p.Bubbles, Range: p.Range, Speed: p.Speed, Kick: p.Kick,
			Mount: p.Mount, Shield: p.shield > 0, Invuln: p.invulT > 0, Curse: p.Curse,
			Trap: trap, Jump: round2(p.jumpT), Inv: inv,
		})
	}
	for _, b := range g.bubbles {
		s.Bubbles = append(s.Bubbles, BubbleSnap{
			ID: b.ID, X: round2(float64(b.CX) + float64(b.mdx)*b.Off), Y: round2(float64(b.CY) + float64(b.mdy)*b.Off),
			Owner: b.Owner.ID, Fuse: round2(b.Fuse),
		})
	}
	return s
}
