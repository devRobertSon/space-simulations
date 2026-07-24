# 🌌 천체 시뮬레이션 모음 (Space Simulations)

직접 만든 여러 천체·지구과학 교육용 웹 시뮬레이션을 하나의 저장소에 모았습니다.
루트의 `index.html`이 **카드 형태의 랜딩 페이지**로, 카드를 누르면 각 시뮬레이션이
바로 실행됩니다. 모두 빌드 단계 없이 브라우저에서 동작하는 정적 페이지입니다.

## 🔗 실행

GitHub Pages가 활성화되면 다음 주소에서 열립니다:

```
https://devrobertson.github.io/space-simulations/
```

로컬에서 열 때는 (ES 모듈 사용 시뮬레이션이 있으므로) 간단한 정적 서버를 권장합니다:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 📂 구성

| 폴더 | 시뮬레이션 | 설명 |
| --- | --- | --- |
| [`diurnal-motion/`](diurnal-motion/) | 별들의 일주운동 | 지구 자전에 의한 별의 일주운동, 위도·적위에 따른 주극성/출몰성/전몰성 판별 |
| [`retrograde-motion/`](retrograde-motion/) | 행성의 순행과 역행 | 외행성(화성)·내행성(금성)의 겉보기 운동을 여러 좌표계 뷰로 비교 |
| [`coriolis-effect/`](coriolis-effect/) | 코리올리 효과 | 회전 좌표계와 관성 좌표계 시점을 나란히 비교 |
| [`moon-shadow/`](moon-shadow/) | 일식 그림자 (태양·달·지구) | 3D 배치 + 2D 지도로 개기/부분일식 경로 표시 |
| [`eclipse-direction/`](eclipse-direction/) | 일식·월식의 방향과 속도 | 일식·월식이 반대 방향으로 가려지는 까닭을 각속도·선속도로 설명 |
| [`westward-drift/`](westward-drift/) | 인공위성 서편현상 | 지상 궤적이 서쪽으로 밀려나는 현상을 3D 지구본 + 2D 지도로 표시 |

각 폴더는 원래 개별 저장소에 있던 시뮬레이션을 그대로 옮겨온 것으로,
자체 `index.html`과 에셋(CSS/JS)을 포함한 독립 실행 단위입니다.
각 시뮬레이션의 자세한 설명은 해당 폴더의 `README.md`를 참고하세요.

## ➕ 새 시뮬레이션 추가하기

1. 새 시뮬레이션을 담을 폴더를 루트에 만들고(`예: my-new-sim/`),
   그 안에 `index.html`과 필요한 에셋을 넣습니다. (경로는 폴더 내부 상대경로 사용)
2. 루트 `index.html`의 카드 목록(`<main class="grid">`)에 아래 형식으로 카드를 추가합니다:

   ```html
   <a class="card" href="my-new-sim/index.html">
     <div class="icon">🌟</div>
     <h2>시뮬레이션 이름</h2>
     <p>한 줄 설명.</p>
     <div class="tags"><span class="tag">키워드</span></div>
     <span class="go">시뮬레이션 열기 <span class="arrow">→</span></span>
   </a>
   ```
3. `README.md`의 구성 표에도 한 줄 추가합니다.

> 저장소 루트에 `.nojekyll` 파일이 있어 GitHub Pages가 Jekyll 처리를 건너뜁니다.
