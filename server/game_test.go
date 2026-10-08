package main

import "testing"

func TestMapsValid(t *testing.T) {
	if err := validateMaps(); err != nil {
		t.Fatal(err)
	}
}

func newTestGame(t *testing.T, mode string) *Game {
	t.Helper()
	g := NewGame(findMode(mode), findMap("village"), []Participant{{"a", "A", 0, "dao"}, {"b", "B", 1, "dao"}}, 1)
	g.countdown = 0
	return g
}

func run(g *Game, seconds float64) {
	for i := 0; i < int(seconds*TickRate); i++ {
		g.Tick(TickDT)
	}
}

func TestMoveAndBlockedByWall(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	g.SetInput("a", "right")
	run(g, 2)
	// village row 0: "1..xxx" → a can reach at most column 2 before the block at column 3.
	if a.X != 2.5 || a.Y != 0.5 {
		t.Fatalf("want (2.5,0.5), got (%v,%v)", a.X, a.Y)
	}
}

func TestBubbleTrapsAndOpponentTouchKills(t *testing.T) {
	g := newTestGame(t, "normal")
	a, b := g.player("a"), g.player("b")
	g.RequestBubble("a")
	g.Tick(TickDT)
	if len(g.bubbles) != 1 {
		t.Fatalf("bubble not placed")
	}
	// a stays on its own bubble → gets trapped when it explodes.
	run(g, BubbleFuse+0.1)
	if a.State != StateTrapped {
		t.Fatalf("a should be trapped, got %s", a.State)
	}
	// wait for the water to clear, then b touches a → a pops, b wins.
	run(g, FlameTime)
	b.X, b.Y = a.X+0.3, a.Y
	g.Tick(TickDT)
	if a.State != StateDead || !g.Over || g.WinnerID != "b" {
		t.Fatalf("expected b to win: a=%s over=%v winner=%q", a.State, g.Over, g.WinnerID)
	}
}

func TestTrapExpiresToDeath(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.State, a.trapT = StateTrapped, 0.2
	run(g, 0.5)
	if a.State != StateDead || g.WinnerID != "b" {
		t.Fatalf("a should drown: %s winner=%q", a.State, g.WinnerID)
	}
}

func TestPlayerCanLeaveOwnBubbleButNotReturn(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	g.RequestBubble("a")
	g.SetInput("a", "down")
	run(g, 0.8) // leave the bubble cell (0,0) moving down
	if a.Y < 1.5 {
		t.Fatalf("a should have left the bubble, y=%v", a.Y)
	}
	g.SetInput("a", "up")
	run(g, 0.8)
	if a.Y < 1.5-1e-9 {
		t.Fatalf("a walked back into its bubble, y=%v", a.Y)
	}
}

func TestChainExplosionAndItemReveal(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.Bubbles, a.Range = 2, 2
	g.hidden[0][3] = ItemPotion
	g.RequestBubble("a") // (0,0), range 2 → reaches the bubble at (2,0)
	g.Tick(TickDT)
	a.X, a.Range = 2.5, 1
	g.RequestBubble("a") // (2,0), range 1 → breaks the block at (3,0)
	g.Tick(TickDT)
	if len(g.bubbles) != 2 {
		t.Fatalf("want 2 bubbles, got %d", len(g.bubbles))
	}
	a.X, a.Y = 14.5, 0.5 // out of the blast
	run(g, BubbleFuse+FlameTime+0.1)
	if len(g.bubbles) != 0 {
		t.Fatalf("chain explosion should clear all bubbles")
	}
	if g.tiles[0][3] != TileEmpty || g.items[0][3] != ItemPotion {
		t.Fatalf("block (3,0) should break and reveal potion: tile=%c item=%q", g.tiles[0][3], g.items[0][3])
	}
	a.X, a.Y = 3.5, 0.5
	g.Tick(TickDT)
	if a.Range != 2 || a.State != StateAlive {
		t.Fatalf("potion not applied, range=%d state=%s", a.Range, a.State)
	}
}

func TestMountAbsorbsHit(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.Mount = ItemOwl
	g.RequestBubble("a")
	run(g, BubbleFuse+0.2)
	if a.State != StateAlive || a.Mount != ItemNone {
		t.Fatalf("mount should absorb the hit: state=%s mount=%q", a.State, a.Mount)
	}
}

func TestNeedleEscapes(t *testing.T) {
	g := newTestGame(t, "item")
	a := g.player("a")
	a.State, a.trapT = StateTrapped, 3
	g.RequestUse("a", ItemNeedle)
	g.Tick(TickDT)
	if a.State != StateAlive || a.Inv[ItemNeedle] != 0 {
		t.Fatalf("needle should free a: %s inv=%d", a.State, a.Inv[ItemNeedle])
	}
}

func TestKickSlidesBubble(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.Kick = true
	// clear row 2 so the bubble can slide: row 2 ".xxxx~..."
	for x := 1; x < MapW; x++ {
		g.tiles[2][x] = TileEmpty
	}
	a.X, a.Y = 0.5, 2.5
	g.nextBubbleID++
	g.bubbles = append(g.bubbles, &Bubble{ID: g.nextBubbleID, Owner: g.player("b"), CX: 1, CY: 2, Fuse: 5, Range: 1, passable: map[string]bool{}})
	g.SetInput("a", "right")
	g.Tick(TickDT)
	g.SetInput("a", "")
	run(g, 2)
	if b := g.bubbles[0]; b.CX != MapW-1 || b.moving {
		t.Fatalf("kicked bubble should stop at the edge, got x=%d moving=%v", b.CX, b.moving)
	}
}

func TestPushBlock(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	g.tiles[0][1] = TilePush
	g.tiles[0][2] = TileEmpty
	g.SetInput("a", "right")
	run(g, 0.5)
	if g.tiles[0][2] != TilePush || g.tiles[0][1] != TileEmpty {
		t.Fatalf("block should be pushed to (2,0)")
	}
	_ = a
}

func TestCornerAssist(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	// a at (0, 0.8): slightly below lane 0, pressing right; (1,0) is free so it realigns and moves.
	a.X, a.Y = 0.5, 0.8
	g.SetInput("a", "right")
	run(g, 0.5)
	if a.Y != 0.5 || a.X <= 0.5 {
		t.Fatalf("corner assist failed: (%v,%v)", a.X, a.Y)
	}
}

func TestForfeit(t *testing.T) {
	g := newTestGame(t, "normal")
	g.Forfeit("a")
	if !g.Over || g.WinnerID != "b" || g.Reason != "leave" {
		t.Fatalf("forfeit: over=%v winner=%q reason=%s", g.Over, g.WinnerID, g.Reason)
	}
}

func TestCharacterStatsAndCaps(t *testing.T) {
	g := NewGame(findMode("normal"), findMap("village"), []Participant{{"a", "A", 0, "marid"}, {"b", "B", 1, "random"}}, 1)
	a, b := g.player("a"), g.player("b")
	if a.Bubbles != 2 || a.Range != 1 || a.Speed != 4 {
		t.Fatalf("marid start stats wrong: %d %d %d", a.Bubbles, a.Range, a.Speed)
	}
	if b.Character == nil {
		t.Fatal("random character not resolved")
	}
	for i := 0; i < 20; i++ {
		g.applyItem(a, ItemBubble)
		g.applyItem(a, ItemPotion)
	}
	if a.Bubbles != 9 || a.Range != 6 {
		t.Fatalf("marid caps wrong: bubbles=%d range=%d", a.Bubbles, a.Range)
	}
	g.applyItem(a, ItemRedDevil)
	if a.Speed != 8 {
		t.Fatalf("red devil should set marid speed to 8, got %d", a.Speed)
	}
	mx := NewGame(findMode("max"), findMap("village"), []Participant{{"a", "A", 0, "uni"}}, 1)
	if p := mx.player("a"); p.Speed != 8 || p.Bubbles != 5 || p.Range != 7 {
		t.Fatalf("max mode should start at character max: %+v", p)
	}
}

func TestFlameShapeAndPreplacedItems(t *testing.T) {
	g := NewGame(findMode("normal"), findMap("pirate"), []Participant{{"a", "A", 0, "dao"}, {"b", "B", 1, "dao"}}, 1)
	if g.items[0][1] != ItemBubble || g.items[6][7] != ItemUltra {
		t.Fatalf("pre-placed items missing: %q %q", g.items[0][1], g.items[6][7])
	}
	g = newTestGame(t, "normal")
	a := g.player("a")
	a.Range = 2
	g.countdown = 0
	g.RequestBubble("a")
	g.Tick(TickDT)
	a.X, a.Y = 14.5, 0.5
	run(g, BubbleFuse+0.05)
	if k := g.flames[0][0].Kind; k != 'c' {
		t.Fatalf("center kind %c", k)
	}
	// (0,0)에서 오른쪽 2칸: (1,0)은 줄기, (2,0)은 끝
	if g.flames[0][1].Kind != 'r' || g.flames[0][2].Kind != 'R' {
		t.Fatalf("arm kinds %c %c", g.flames[0][1].Kind, g.flames[0][2].Kind)
	}
	if g.flames[2][0].Kind != 'D' {
		t.Fatalf("down end kind %c", g.flames[2][0].Kind)
	}
}

func TestFactoryHiddenWalls(t *testing.T) {
	g := NewGame(findMode("normal"), findMap("factory"), []Participant{{"a", "A", 0, "dao"}, {"b", "B", 1, "dao"}}, 1)
	if g.tiles[5][4] != TileWall || g.tiles[7][10] != TileWall {
		t.Fatalf("truck cells should be walls")
	}
}

func TestKickOwnBubbleWhenWalkingBack(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.Kick = true
	for x := 0; x < MapW; x++ {
		g.tiles[2][x] = TileEmpty
	}
	a.X, a.Y = 3.5, 2.5
	g.RequestBubble("a") // (3,2)
	g.Tick(TickDT)
	g.SetInput("a", "right") // 살짝 비켜선다 (아직 겹침)
	run(g, 0.15)
	if a.X <= 3.6 || a.X >= 4.3 {
		t.Fatalf("setup: a.X=%v", a.X)
	}
	g.SetInput("a", "left") // 다시 물풍선 쪽으로 → 바로 차야 한다
	g.Tick(TickDT)
	g.SetInput("a", "")
	run(g, 1)
	b := g.bubbles[0]
	if b.CX != 0 {
		t.Fatalf("own bubble should be kicked to the left edge, got x=%d (player x=%v)", b.CX, a.X)
	}
	if a.X < 3.5 {
		t.Fatalf("player walked through the bubble: x=%v", a.X)
	}
}

func TestNoKickWhenLeavingOwnBubble(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	a.Kick = true
	for x := 0; x < MapW; x++ {
		g.tiles[2][x] = TileEmpty
	}
	a.X, a.Y = 3.5, 2.5
	g.RequestBubble("a")
	g.Tick(TickDT)
	g.SetInput("a", "right")
	run(g, 0.5)
	if b := g.bubbles[0]; b.CX != 3 || b.moving {
		t.Fatalf("leaving should not kick: x=%d moving=%v", b.CX, b.moving)
	}
}

func TestThornPopsBubbles(t *testing.T) {
	g := newTestGame(t, "normal")
	a := g.player("a")
	for x := 0; x < MapW; x++ {
		g.tiles[2][x] = TileEmpty
	}
	g.tiles[2][3] = TileThorn
	// 1) 걸어서 지나갈 수 있다
	a.X, a.Y = 1.5, 2.5
	g.SetInput("a", "right")
	run(g, 1.5)
	if a.X < 4.5 {
		t.Fatalf("player should walk over thorns, x=%v", a.X)
	}
	// 2) 가시 위에 놓으면 바로 터진다
	g.SetInput("a", "")
	a.X = 3.5
	a.invulT = 10
	g.RequestBubble("a")
	g.Tick(TickDT)
	if len(g.bubbles) != 0 || g.flames[2][3].TTL <= 0 {
		t.Fatalf("bubble on thorn should explode immediately")
	}
	// 3) 차서 가시로 굴러가면 터진다
	run(g, 1)
	a.X, a.Kick = 0.5, true
	g.nextBubbleID++
	g.bubbles = append(g.bubbles, &Bubble{ID: g.nextBubbleID, Owner: a, CX: 1, CY: 2, Fuse: 5, Range: 1, passable: map[string]bool{}})
	g.SetInput("a", "right")
	g.Tick(TickDT)
	g.SetInput("a", "")
	run(g, 0.5)
	if len(g.bubbles) != 0 {
		t.Fatalf("kicked bubble should pop on thorn, at %d", g.bubbles[0].CX)
	}
}
