package main

// ItemType identifies an item that can appear on the map or in a player's inventory.
type ItemType string

const (
	ItemNone ItemType = ""

	// 능력치 아이템
	ItemBubble   ItemType = "bubble"    // 물풍선: 동시에 놓을 수 있는 물풍선 +1
	ItemPotion   ItemType = "potion"    // 물약: 물줄기 +1
	ItemRoller   ItemType = "roller"    // 롤러스케이트: 이동 속도 +1
	ItemUltra    ItemType = "ultra"     // 울트라 물약(파워 맥스): 물줄기 최대
	ItemRedDevil ItemType = "red_devil" // 빨간 악마: 이동 속도 최대

	// 특수 아이템
	ItemDevil ItemType = "devil" // 악마: 일정 시간 저주
	ItemKick  ItemType = "kick"  // 신발: 물풍선 차기

	// 탈것
	ItemTurtle       ItemType = "turtle"        // 거북이: 느림
	ItemPirateTurtle ItemType = "pirate_turtle" // 해적 거북이: 빠름
	ItemOwl          ItemType = "owl"           // 부엉이: 보통
	ItemUFO          ItemType = "ufo"           // UFO: 가장 빠름

	// 사용 아이템 (아이템전)
	ItemNeedle ItemType = "needle" // 바늘: 물방울 탈출
	ItemShield ItemType = "shield" // 방패: 잠시 무적
	ItemDart   ItemType = "dart"   // 다트: 앞쪽 물풍선 터뜨리기
	ItemSpring ItemType = "spring" // 스프링: 두 칸 점프
)

const (
	CatStat       = "stat"
	CatSpecial    = "special"
	CatMount      = "mount"
	CatConsumable = "consumable"
)

type ItemDef struct {
	Type     ItemType `json:"type"`
	Name     string   `json:"name"`
	Category string   `json:"category"`
	Desc     string   `json:"desc"`
	Key      string   `json:"key,omitempty"` // 사용 아이템 단축키
}

var ItemDefs = []ItemDef{
	{ItemBubble, "물풍선", CatStat, "동시에 놓을 수 있는 물풍선 개수 +1", ""},
	{ItemPotion, "물약", CatStat, "물줄기 길이 +1", ""},
	{ItemRoller, "롤러스케이트", CatStat, "이동 속도 +1", ""},
	{ItemUltra, "울트라 물약", CatStat, "물줄기 길이 최대", ""},
	{ItemRedDevil, "빨간 악마", CatStat, "이동 속도 최대", ""},
	{ItemDevil, "보라 악마", CatSpecial, "10초간 저주 (방향 반전 / 느려짐 / 물풍선 자동 설치 / 물풍선 설치 불가)", ""},
	{ItemKick, "신발", CatSpecial, "물풍선을 밀어서 찰 수 있음", ""},
	{ItemTurtle, "거북이", CatMount, "탈것 (느림). 물줄기에 맞으면 대신 내림", ""},
	{ItemPirateTurtle, "해적 거북이", CatMount, "탈것 (빠름). 물줄기에 맞으면 대신 내림", ""},
	{ItemOwl, "부엉이", CatMount, "탈것 (보통). 물줄기에 맞으면 대신 내림", ""},
	{ItemUFO, "UFO", CatMount, "탈것 (매우 빠름). 물줄기에 맞으면 대신 내림", ""},
	{ItemNeedle, "바늘", CatConsumable, "물방울에 갇혔을 때 탈출", "1"},
	{ItemShield, "방패", CatConsumable, "3초간 물줄기 무적", "2"},
	{ItemDart, "다트", CatConsumable, "바라보는 방향의 물풍선을 즉시 터뜨림", "3"},
	{ItemSpring, "스프링", CatConsumable, "바라보는 방향으로 두 칸 점프", "4"},
}

func itemCategory(t ItemType) string {
	for _, d := range ItemDefs {
		if d.Type == t {
			return d.Category
		}
	}
	return ""
}

const MaxInventory = 9

// ModeDef describes a game mode: which items drop and how players start.
type ModeDef struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Desc        string           `json:"desc"`
	Consumables bool             `json:"consumables"`
	DropChance  float64          `json:"-"`
	Weights     map[ItemType]int `json:"-"`
	StartMax    bool             `json:"-"`
	StartItems  map[ItemType]int `json:"-"`
}

var baseWeights = map[ItemType]int{
	ItemBubble:       24,
	ItemPotion:       24,
	ItemRoller:       18,
	ItemUltra:        3,
	ItemRedDevil:     3,
	ItemDevil:        4,
	ItemKick:         5,
	ItemTurtle:       4,
	ItemPirateTurtle: 1,
	ItemOwl:          3,
	ItemUFO:          1,
}

func withWeights(base map[ItemType]int, extra map[ItemType]int, drop ...ItemType) map[ItemType]int {
	out := map[ItemType]int{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	for _, k := range drop {
		delete(out, k)
	}
	return out
}

var Modes = []*ModeDef{
	{
		ID:         "normal",
		Name:       "노멀",
		Desc:       "기본 규칙. 블록에서 능력치/특수 아이템과 탈것이 나옵니다.",
		DropChance: 0.55,
		Weights:    baseWeights,
	},
	{
		ID:          "item",
		Name:        "아이템전",
		Desc:        "바늘·방패·다트·스프링 같은 사용 아이템도 나옵니다. 바늘 1개를 들고 시작합니다.",
		Consumables: true,
		DropChance:  0.6,
		Weights: withWeights(baseWeights, map[ItemType]int{
			ItemNeedle: 5,
			ItemShield: 4,
			ItemDart:   3,
			ItemSpring: 3,
		}),
		StartItems: map[ItemType]int{ItemNeedle: 1},
	},
	{
		ID:          "max",
		Name:        "맥스",
		Desc:        "물풍선·물줄기·속도가 모두 캐릭터 최대치인 상태로 시작합니다.",
		Consumables: true,
		DropChance:  0.35,
		Weights: withWeights(baseWeights, map[ItemType]int{
			ItemNeedle: 6,
			ItemShield: 5,
			ItemDart:   4,
			ItemSpring: 4,
		}, ItemBubble, ItemPotion, ItemRoller, ItemUltra, ItemRedDevil),
		StartMax: true,
	},
}

func findMode(id string) *ModeDef {
	for _, m := range Modes {
		if m.ID == id {
			return m
		}
	}
	return nil
}
