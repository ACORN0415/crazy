# 캐릭터 그림 넣는 곳

캐릭터마다 폴더가 있습니다: `dao`(다오) `bazzi`(배찌) `dizni`(디지니) `marid`(마리드) `uni`(우니) `kephi`(케피) `ethi`(에띠) `mos`(모스) `su`(수)

현재 들어 있는 그림은 원작 게임의 **빨간 팀** 스프라이트입니다. 2P(파란 팀)는 게임이 자동으로 빨강→파랑으로 바꿔 그립니다.

## 가장 간단한 방법 (한 장씩)

폴더에 배경이 투명한 PNG를 아래 이름으로 넣고 브라우저를 새로고침하면 됩니다.

| 파일 | 내용 | 필수 |
|---|---|---|
| `down.png` | 정면 (아래쪽으로 걸을 때) | **필수** — 없으면 3D 모델 사용 |
| `up.png` | 뒷모습 | 없으면 정면 사용 |
| `left.png` | 왼쪽 보는 모습 | 없으면 right를 뒤집어 사용 |
| `right.png` | 오른쪽 보는 모습 | 없으면 left를 뒤집어 사용 |
| `trapped.png` | 물방울에 갇힌 모습 | 선택 |
| `portrait.png` | 캐릭터 선택창 얼굴 | 없으면 정면 사용 |

## 걷기 애니메이션 (여러 장)

같은 폴더에 `sprite.json`을 만들면 프레임을 여러 장 쓸 수 있습니다.

```json
{
  "down": ["down_0.png", "down_1.png", "down_2.png", "down_3.png"],
  "up": ["up_0.png", "up_1.png", "up_2.png", "up_3.png"],
  "left": ["left_0.png", "left_1.png", "left_2.png", "left_3.png"],
  "trapped": ["trapped_0.png", "trapped_1.png"],
  "portrait": "portrait.png",
  "fps": 8,
  "scale": 1.0
}
```

- 서 있을 때는 첫 프레임, 걸을 때는 `fps` 속도로 프레임을 넘깁니다.
- `scale`로 크기를 조절합니다 (1.0 = 기본, 타일보다 살짝 큼).
- 그림의 **발끝이 이미지 맨 아래**에 오도록 여백을 잘라 주세요.
