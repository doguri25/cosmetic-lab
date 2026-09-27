# 내 화장품 연구소

시중 화장품에 쓰이는 성분을 직접 배합해 보고, 산 화장품의 전성분을 읽어 주는 성인 소비자용 웹앱입니다. 한 파일(`index.html`)로 동작하며 빌드 도구나 서버가 필요 없습니다.

- 성분 배합(17종 제품 유형, 권장 범위·합계 100% 잠금·추천 비율·되돌리기)
- 규칙 기반 리포트(효능·주의·궁합·피부 타입) + DIY 레시피 변환(배치 g 환산)
- 성분 사전 538종(자체 3단계 등급, 알레르기 유발성분 25종, 초보자용 5단 설명)
- 전성분 텍스트/사진 분석, 유사 시중 제품, 용기·포장 추천, 완성 카드 PNG
- 내 피부 프로필(피부 타입·피하는 성분)
- AI 기능: 제미나이·GPT·클로드 개인 API 키(설정 ⚙) 또는 claude.ai 내장 AI

## 실행·배포

`index.html`을 더블클릭해 열거나, 저장소 루트를 그대로 정적 호스팅(Vercel, GitHub Pages, Netlify)에 올리면 됩니다.

- Vercel: Framework Preset **Other**, Build Command 비움, Output Directory `./`
- GitHub Pages: Settings → Pages → Branch `main` / `(root)`

배포 후 ⚙ 설정 → 「내 API 키」 → 서비스 선택 → 키 입력 → 「연결 테스트」.

## 소스 구조

```
src/part1.html   스타일·마크업·SVG 아이콘
src/part2.js     성분 DB(RAW), 역할·유형·용기 데이터, 제품 카탈로그
src/part2b.js    초보자용 성분 설명(EXT, 역할별 설명)
src/part3.js     상태·규칙 엔진·화면·이벤트·AI 공급자
src/build.js     node src/build.js → index.html, artifact/cosmetic-lab.html
```

## 참고

- 개인 API 키는 사용자의 브라우저(localStorage)에만 저장되고, 선택한 AI 서비스로만 직접 전송됩니다.
- 성분 명칭은 대한화장품협회 성분사전 표준명을 기준으로 했고, 등급은 이 앱이 정한 3단계(안심·주의·경고)입니다. EWG 등급은 쓰지 않습니다.
- 정보 제공 목적의 앱이며 피부과 진단·처방을 대체하지 않습니다. 배합·DIY 레시피는 개인 사용 목적에 한합니다.
