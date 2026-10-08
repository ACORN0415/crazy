package main

import (
	"math"
	"math/rand"
	"testing"
)

// 무작위 입력으로 많은 판을 돌려 패닉/불변식 위반을 찾는다.
func TestRandomPlayInvariants(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	dirNames := []string{"", "up", "down", "left", "right"}
	consum := []ItemType{ItemNeedle, ItemShield, ItemDart, ItemSpring}
	games := 0
	for _, m := range Maps {
		for _, mode := range Modes {
			for round := 0; round < 40; round++ {
				games++
				c1 := Characters[rng.Intn(len(Characters))].ID
				c2 := Characters[rng.Intn(len(Characters))].ID
				g := NewGame(mode, m, []Participant{{"a", "A", 0, c1}, {"b", "B", 1, c2}}, rng.Int63())
				for _, p := range g.players {
					p.Kick = rng.Intn(2) == 0
					for _, it := range consum {
						p.Inv[it] = 3
					}
				}
				for tick := 0; tick < 30*90 && !g.Over; tick++ {
					for _, id := range []string{"a", "b"} {
						if rng.Intn(8) == 0 {
							g.SetInput(id, dirNames[rng.Intn(len(dirNames))])
						}
						if rng.Intn(25) == 0 {
							g.RequestBubble(id)
						}
						if rng.Intn(60) == 0 {
							g.RequestUse(id, consum[rng.Intn(len(consum))])
						}
					}
					g.Tick(TickDT)
					_ = g.Snapshot()
					for _, p := range g.players {
						if p.State == StateDead {
							continue
						}
						if p.X < 0.5-1e-6 || p.Y < 0.5-1e-6 || p.X > MapW-0.5+1e-6 || p.Y > MapH-0.5+1e-6 {
							t.Fatalf("%s/%s: player %s out of bounds (%.3f,%.3f)", m.ID, mode.ID, p.ID, p.X, p.Y)
						}
						cx, cy := p.cell()
						if tl := g.tiles[cy][cx]; tl != TileEmpty && tl != TileBush && tl != TileThorn {
							t.Fatalf("%s/%s tick %d: player %s inside tile %c at (%.3f,%.3f)", m.ID, mode.ID, tick, p.ID, tl, p.X, p.Y)
						}
						// 항상 한 축은 줄 가운데에 있어야 한다
						offX := math.Abs(p.X - (math.Floor(p.X) + 0.5))
						offY := math.Abs(p.Y - (math.Floor(p.Y) + 0.5))
						if offX > 1e-6 && offY > 1e-6 {
							t.Fatalf("%s/%s: player %s off both lanes (%.4f,%.4f)", m.ID, mode.ID, p.ID, p.X, p.Y)
						}
						ch := p.Character
						if p.Bubbles > ch.Bubbles.Max || p.Range > ch.Range.Max || p.Speed > ch.Speed.Max {
							t.Fatalf("stats over max: %+v", p)
						}
					}
					seen := map[[2]int]bool{}
					for _, b := range g.bubbles {
						if !inBounds(b.CX, b.CY) {
							t.Fatalf("bubble out of bounds %d,%d", b.CX, b.CY)
						}
						k := [2]int{b.CX, b.CY}
						if seen[k] {
							t.Fatalf("%s: two bubbles on one cell %v", m.ID, k)
						}
						seen[k] = true
						if tl := g.tiles[b.CY][b.CX]; tl != TileEmpty && tl != TileBush {
							t.Fatalf("bubble on tile %c after tick", tl) // 가시 위 물풍선은 같은 틱에 터져야 한다
						}
					}
				}
			}
		}
	}
	t.Logf("played %d random games", games)
}

// 시작 위치에서 물줄기 1짜리 물풍선을 놓고 피할 칸이 있어야 한다.
func TestSpawnsCanEscapeOwnBubble(t *testing.T) {
	for _, m := range Maps {
		g := NewGame(Modes[0], m, []Participant{{"a", "A", 0, "dao"}, {"b", "B", 1, "dao"}}, 1)
		for _, p := range g.players {
			sx, sy := p.cell()
			danger := func(x, y int) bool { return (x == sx && abs(y-sy) <= 1) || (y == sy && abs(x-sx) <= 1) }
			seen := map[[2]int]bool{{sx, sy}: true}
			q := [][2]int{{sx, sy}}
			safe := false
			for len(q) > 0 && !safe {
				c := q[0]
				q = q[1:]
				if !danger(c[0], c[1]) {
					safe = true
				}
				for _, d := range dirs {
					n := [2]int{c[0] + d.dx, c[1] + d.dy}
					if inBounds(n[0], n[1]) && !seen[n] && (g.tiles[n[1]][n[0]] == TileEmpty || g.tiles[n[1]][n[0]] == TileBush || g.tiles[n[1]][n[0]] == TileThorn) {
						seen[n] = true
						q = append(q, n)
					}
				}
			}
			if !safe {
				t.Errorf("map %s: player %s at %d,%d cannot escape its first bubble", m.ID, p.ID, sx, sy)
			}
		}
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
