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
- 같은 데이터로 여러 번 빌드해도 결과가 같아야 합니다. 생성된 HTML과 이미지도 함께 커밋합니다.
- 서치어드바이저에는 `https://nomorenarrowroom.com/sitemap.xml`과 `https://nomorenarrowroom.com/rss.xml`을 제출합니다.
