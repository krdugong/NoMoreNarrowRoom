# NoMoreNarrowRoom

한국인 일본 여행자를 위한 실용 호텔 탐색 서비스.

좁은 객실을 피하고, 예산·대욕장·객실 크기·인원·역 접근성 같은 실제 예약 조건으로 호텔을 찾는 것을 목표로 합니다.

## 검색 노출용 페이지 빌드 (nomorenarrowroom.com)

`data/*.js`를 고친 뒤 아래 명령으로 도시 페이지, 키워드 랜딩(대욕장·넓은 방·지역), 호텔별 페이지, 공유 이미지, `sitemap.xml`, `rss.xml`, `robots.txt`를 다시 만듭니다.

```sh
npm install
npm run build
```

- 주소와 사이트 인증 코드는 `scripts/seo-config.json`에서 바꿉니다. 네이버 서치어드바이저 인증 코드는 `naverSiteVerification`에 넣고 다시 빌드하세요.
- 구글 애널리틱스 측정 ID(`G-…`)는 `googleAnalyticsId`에 넣습니다. 빌드하면 모든 페이지와 `simulator.html`에 태그가 들어가고, 비워두면 빠집니다.
- 대욕장이 있는 호텔은 `bathFeatures`(onsen·rotenburo·sauna)로 천연온천·노천탕·사우나 여부를 적습니다. 도시 페이지의 '온천·사우나' 필터와 `/{도시}/onsen/`, `/rotenburo/`, `/sauna/` 페이지가 이 값을 씁니다.
- 3인·4인 투숙은 `pax3`/`pax4`(일본 현지 예약 사이트 성인 N명 검색에 플랜이 있으면 true)와 `minRoom3Pax`/`roomType3Pax`, `minRoom4Pax`/`roomType4Pax`로 적습니다. 도시 페이지의 '투숙 인원' 필터와 `/{도시}/triple/`, `/quad/` 페이지가 이 값을 씁니다.
- `community`는 한국 여행자 커뮤니티 게시글에서 그 호텔의 대욕장이 언급된 수입니다(`source`, `mentions`, `rank`, `summary`, `period`, `checkedAt`). 도시 페이지의 기본 정렬 '후기 언급순'과 `/{도시}/bath/`·온천·노천탕·사우나 페이지의 순서가 이 값을 따릅니다. 집계는 사용자가 직접 돌린 카페 검색 결과(2023-01~2026-10, 제목+본문 기준)이며 댓글은 세지 않았습니다.
- `aliases`는 검색에서 함께 쓰이는 다른 표기입니다(예: 미쓰이 가든 ↔ 미츠이 가든, 센츄리온 ↔ 센추리온). 호텔 페이지 설명·'다른 표기' 문장·schema alternateName과 도시 페이지 이름 검색에 쓰입니다. 표기 선택은 2026-10-29 네이버 키워드 도구 월간검색수 기준입니다.
- 네이버 애널리틱스 사이트 ID는 `naverAnalyticsId`에 넣습니다. 빌드하면 모든 HTML 페이지의 `</body>` 앞에 들어갑니다.
- 같은 데이터로 여러 번 빌드해도 결과가 같아야 합니다. 생성된 HTML과 이미지도 함께 커밋합니다.
- 서치어드바이저에는 `https://nomorenarrowroom.com/sitemap.xml`과 `https://nomorenarrowroom.com/rss.xml`을 제출합니다.
