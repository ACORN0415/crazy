package main

import "math/rand"

// StatRange는 캐릭터의 능력치 시작값과 아이템으로 올릴 수 있는 최대값이다.
type StatRange struct {
	Start int `json:"start"`
	Max   int `json:"max"`
}

type CharacterDef struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Type    string    `json:"type"`
	Desc    string    `json:"desc"`
	Bubbles StatRange `json:"bubbles"`
	Range   StatRange `json:"range"`
	Speed   StatRange `json:"speed"`
}

const RandomCharacter = "random"

// 수치는 원작 캐릭터 소개 이미지의 능력치 막대(물풍선 10칸, 물줄기·속도 9칸 기준)를 읽어서 맞춘 값이다.
// 수(Su)는 원작 소개 이미지가 없어 밸런스형으로 정했다.
var Characters = []*CharacterDef{
	{ID: "bazzi", Name: "배찌", Type: "스피드형", Desc: "게으르지만 발이 가장 빠른 장난꾸러기",
		Bubbles: StatRange{1, 6}, Range: StatRange{1, 7}, Speed: StatRange{5, 9}},
	{ID: "dao", Name: "다오", Type: "밸런스형", Desc: "물풍선을 최대 10개까지 늘릴 수 있는 의리남",
		Bubbles: StatRange{1, 10}, Range: StatRange{1, 7}, Speed: StatRange{5, 7}},
	{ID: "dizni", Name: "디지니", Type: "밸런스형", Desc: "물풍선 2개로 시작하고 물줄기가 가장 길다",
		Bubbles: StatRange{2, 6}, Range: StatRange{1, 9}, Speed: StatRange{4, 8}},
	{ID: "mos", Name: "모스", Type: "스피드형", Desc: "빠르지만 물줄기가 짧은 헬멧 소년",
		Bubbles: StatRange{1, 8}, Range: StatRange{1, 5}, Speed: StatRange{5, 8}},
	{ID: "uni", Name: "우니", Type: "파워형", Desc: "물줄기 2로 시작하는 고양이 모자",
		Bubbles: StatRange{1, 5}, Range: StatRange{2, 7}, Speed: StatRange{5, 8}},
	{ID: "ethi", Name: "에띠", Type: "개수형", Desc: "물풍선을 최대 10개까지 늘릴 수 있다",
		Bubbles: StatRange{1, 10}, Range: StatRange{1, 8}, Speed: StatRange{4, 8}},
	{ID: "marid", Name: "마리드", Type: "개수형", Desc: "물풍선 2개로 시작하는 버섯 머리",
		Bubbles: StatRange{2, 9}, Range: StatRange{1, 6}, Speed: StatRange{4, 8}},
	{ID: "kephi", Name: "케피", Type: "파워형", Desc: "물줄기 2로 시작하는 개구리 모자",
		Bubbles: StatRange{1, 9}, Range: StatRange{2, 8}, Speed: StatRange{4, 8}},
	{ID: "su", Name: "수", Type: "밸런스형", Desc: "은발의 소녀",
		Bubbles: StatRange{1, 8}, Range: StatRange{1, 7}, Speed: StatRange{5, 8}},
	{ID: "cloud", Name: "Cloud Lee", Type: "밸런스형", Desc: "구름 티셔츠를 입은 안경 라이더",
		Bubbles: StatRange{1, 8}, Range: StatRange{1, 7}, Speed: StatRange{5, 8}},
}

func findCharacter(id string) *CharacterDef {
	for _, c := range Characters {
		if c.ID == id {
			return c
		}
	}
	return nil
}

func validCharacterChoice(id string) bool {
	return id == RandomCharacter || findCharacter(id) != nil
}

// resolveCharacter turns a room choice (possibly "random") into a concrete character.
func resolveCharacter(id string, rng *rand.Rand) *CharacterDef {
	if c := findCharacter(id); c != nil {
		return c
	}
	return Characters[rng.Intn(len(Characters))]
}
