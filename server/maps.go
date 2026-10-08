package main

import "fmt"

// Map legend:
//
//	.  빈 칸
//	#  부서지지 않는 벽
//	x  부서지는 블록 (아이템이 숨어 있을 수 있음)
//	o  밀 수 있는 블록 (부서지기도 함)
//	~  풀숲 (지나갈 수 있고 캐릭터와 물풍선을 가림)
//	T  가시 (부서지지 않음, 차인 물풍선이 닿으면 터짐)
//	%  보이지 않는 벽 (여러 칸짜리 장식 그림 밑)
//	1  1P 시작 위치, 2  2P 시작 위치
//
// Art는 칸마다 테마의 특정 그림을 고르는 글자(화면 전용), Items는 처음부터 깔려 있는 아이템,
// Decor는 여러 칸에 걸친 큰 그림(트럭 등)이다.
type MapDef struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Theme string   `json:"theme"`
	Rows  []string `json:"rows"`
	Art   []string `json:"art,omitempty"`
	Items []string `json:"items,omitempty"`
	Decor []Decor  `json:"decor,omitempty"`
}

// Decor는 (X,Y)를 왼쪽 위 칸으로 하는 W×H 칸 크기의 그림이다.
type Decor struct {
	Name string `json:"name"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
	W    int    `json:"w"`
	H    int    `json:"h"`
}

// 맵에 미리 까는 아이템 글자
var mapItemChars = map[byte]ItemType{
	'b': ItemBubble, 'p': ItemPotion, 'r': ItemRoller, 'u': ItemUltra, 'R': ItemRedDevil, 'd': ItemDevil,
	'k': ItemKick, 't': ItemTurtle, 'T': ItemPirateTurtle, 'w': ItemOwl, 'U': ItemUFO,
	'n': ItemNeedle, 's': ItemShield, 'a': ItemDart, 'j': ItemSpring,
}

// 원작 맵의 분위기(빌리지·해적·공장·캠프)를 따르도록 그린 배치. 점대칭이라 1P/2P가 공평하다.
var Maps = []*MapDef{
	{
		ID:    "village",
		Name:  "빌리지 1",
		Theme: "village",
		Rows: []string{
			"1..xxx#x#xxx...",
			".#x#x#xxx#x#x#.",
			".xx~xxx.xxx~xx.",
			"x#x#.#x#x#.#x#x",
			"xx~xx.xxx.xx~xx",
			"x#x#x#.o.#x#x#x",
			"xxxx~x...x~xxxx",
			"x#x#x#.o.#x#x#x",
			"xx~xx.xxx.xx~xx",
			"x#x#.#x#x#.#x#x",
			".xx~xxx.xxx~xx.",
			".#x#x#xxx#x#x#.",
			"...xxx#x#xxx..2",
		},
	},
	{
		// 원작 해적 맵(해골 석상·은색 상자·보물상자, 아이템이 미리 깔린 맵)을 그대로 옮긴 배치
		ID:    "pirate",
		Name:  "해적 14",
		Theme: "pirate",
		Rows: []string{
			"x.x...x#x...x.x",
			".x.#x#.x.#x#.x.",
			"x.#x.x#.#x.x#.x",
			".xx...x.x..2xx.",
			"x.#x.x#.#x.x#.x",
			".x.#x#xxx#x#.x.",
			"#.x..x...x..x.#",
			".x.#x#xxx#x#.x.",
			"x.#x.x#.#x.x#.x",
			".xx1..x.x...xx.",
			"x.#x.x#.#x.x#.x",
			".x.#x#.x.#x#.x.",
			"x.x...x#x...x.x",
		},
		Art: []string{
			".......K.......",
			"...S.S...S.S...",
			"..Sb.gS.Sg.bS..",
			"...............",
			"..Sy.rS.Sr.yS..",
			"...S.S...S.S...",
			"K.............K",
			"...S.S...S.S...",
			"..Sy.rS.Sr.yS..",
			"...............",
			"..Sb.gS.Sg.bS..",
			"...S.S...S.S...",
			".......K.......",
		},
		Items: []string{
			".b..p.....p..b.",
			"b.....r.r.....b",
			"...............",
			"p.............p",
			"...............",
			"..r.........r..",
			".......u.......",
			"..r.........r..",
			"...............",
			"p.............p",
			"...............",
			"b.....r.r.....b",
			".b..p.....p..b.",
		},
	},
	{
		// 원작 공장 맵(트럭 두 대, 컨테이너 벽)을 그대로 옮긴 배치
		ID:    "factory",
		Name:  "공장 7",
		Theme: "factory",
		Rows: []string{
			"oo..xxxxxxx..oo",
			"ooo.xxxxxxx.ooo",
			"1oooxxxxxxxooo.",
			"..oo.......oo..",
			"xxx.........xxx",
			"xxx.%%ooo%%.xxx",
			"xxx.%%ooo%%.xxx",
			"xxx.%%ooo%%.xxx",
			"xxx.........xxx",
			"..oo.......oo..",
			".oooxxxxxxxooo2",
			"ooo.xxxxxxx.ooo",
			"oo..xxxxxxx..oo",
		},
		Art: []string{
			"...............",
			"...............",
			"...............",
			"....hhhhhhh....",
			"...vpppppppv...",
			"...v.......v...",
			"...v...N...v...",
			"...v.......v...",
			"...vpppppppv...",
			"....hhhhhhh....",
			"...............",
			"...............",
			"...............",
		},
		Decor: []Decor{{Name: "truckG", X: 4, Y: 5, W: 2, H: 3}, {Name: "truckR", X: 9, Y: 5, W: 2, H: 3}},
	},
	{
		// 원작 캠프 맵(철조망 울타리, 타이어, 신발·물약이 깔린 맵)을 그대로 옮긴 배치
		ID:    "camp",
		Name:  "캠프 1",
		Theme: "camp",
		Rows: []string{
			"###############",
			"#...x~x.x~x..2#",
			"#T..xx~x~xx...#",
			"#..#~xxxxx~#..#",
			"#xx~xx~x~xx~xx#",
			"#~xxx~#T#~xxx~#",
			"#x.xx..o..xx.x#",
			"#~xxx~#T#~xxx~#",
			"#xx~xx~x~xx~xx#",
			"#..#~xxxxx~#..#",
			"#...xx~x~xx..T#",
			"#1..x~x.x~x...#",
			"###############",
		},
		Art: []string{
			"AFFFFFFFFFFFFFB",
			"L.............R",
			"L.............R",
			"L..W.......W..R",
			"L.............R",
			"L.....W.W.....R",
			"L.............R",
			"L.....W.W.....R",
			"L.............R",
			"L..W.......W..R",
			"L.............R",
			"L.............R",
			"CfffffffffffffD",
		},
		Items: []string{
			"...............",
			"..k....p....k..",
			"...............",
			"...............",
			"...............",
			"...............",
			"..p.........p..",
			"...............",
			"...............",
			"...............",
			"...............",
			"..k....p....k..",
			"...............",
		},
	},
}

func findMap(id string) *MapDef {
	for _, m := range Maps {
		if m.ID == id {
			return m
		}
	}
	return nil
}

func validateMaps() error {
	for _, m := range Maps {
		if len(m.Rows) != MapH {
			return fmt.Errorf("map %s: %d rows, want %d", m.ID, len(m.Rows), MapH)
		}
		spawns := 0
		for y, row := range m.Rows {
			if len(row) != MapW {
				return fmt.Errorf("map %s row %d: %d cols, want %d", m.ID, y, len(row), MapW)
			}
			for _, ch := range row {
				switch ch {
				case '.', '#', 'x', 'o', '~', '%', 'T':
				case '1', '2':
					spawns++
				default:
					return fmt.Errorf("map %s row %d: unknown tile %q", m.ID, y, ch)
				}
			}
		}
		if spawns != 2 {
			return fmt.Errorf("map %s: %d spawns, want 2", m.ID, spawns)
		}
		for _, layer := range [][]string{m.Art, m.Items} {
			if layer == nil {
				continue
			}
			if len(layer) != MapH {
				return fmt.Errorf("map %s: layer has %d rows, want %d", m.ID, len(layer), MapH)
			}
			for y, row := range layer {
				if len(row) != MapW {
					return fmt.Errorf("map %s layer row %d: %d cols", m.ID, y, len(row))
				}
			}
		}
		for y, row := range m.Items {
			for x := 0; x < MapW; x++ {
				ch := row[x]
				if ch == '.' {
					continue
				}
				if _, ok := mapItemChars[ch]; !ok {
					return fmt.Errorf("map %s: unknown item %q at %d,%d", m.ID, ch, x, y)
				}
				if t := m.Rows[y][x]; t != '.' && t != '1' && t != '2' {
					return fmt.Errorf("map %s: item at %d,%d is not on an empty cell", m.ID, x, y)
				}
			}
		}
	}
	return nil
}
